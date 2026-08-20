import {createHash} from 'node:crypto';
import {mkdir, open, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ApifyClient} from 'apify-client';

export const APIFY_ACTOR_SLUG = 'apidojo/tweet-scraper';
export const MAX_ITEMS = 40;
export const MIN_REPLIES = 50;
export const TOP_SAMPLE_SIZE = 10;
export const WINDOW_HOURS = 48;

export type XEngagementUnknownReason =
  | 'TOKEN_MISSING'
  | 'ACTOR_UNAVAILABLE'
  | 'APIFY_ERROR'
  | 'INSUFFICIENT_DATA'
  | 'CACHE_ERROR'
  | 'INVALID_TOPIC';

export type XEngagementKnown = {
  status: 'KNOWN';
  topic: string;
  topicMedianEngagement: number;
  sampleSize: number;
  sourceCount: number;
  source: 'apify';
  actor: typeof APIFY_ACTOR_SLUG;
  cached: boolean;
  fetchedAt: string;
  windowStart: string;
  windowEnd: string;
};

export type XEngagementUnknown = {
  status: 'UNKNOWN';
  topic: string;
  reason: XEngagementUnknownReason;
  source: 'apify';
  actor: typeof APIFY_ACTOR_SLUG;
  cached: boolean;
  fetchedAt: string;
  windowStart: string;
  windowEnd: string;
};

export type XEngagementResult = XEngagementKnown | XEngagementUnknown;

type ActorRun = {
  status?: string;
  defaultDatasetId?: string;
};

type ActorClientLike = {
  get(): Promise<unknown | undefined>;
  call(input: Record<string, unknown>): Promise<ActorRun>;
};

type DatasetClientLike = {
  listItems(options?: {limit?: number}): Promise<{items: unknown[]}>;
};

type ApifyClientLike = {
  actor(id: string): ActorClientLike;
  dataset(id: string): DatasetClientLike;
};

type ClientFactory = (token: string) => ApifyClientLike;

type AdapterOptions = {
  token?: string;
  cacheDir?: string;
  now?: () => Date;
  clientFactory?: ClientFactory;
};

type CacheEnvelope = {
  version: 1;
  topicKey: string;
  dateKey: string;
  result: XEngagementResult;
};

type TweetMetrics = {
  createdAt: string;
  replyCount: number;
  engagement: number;
};

const defaultClientFactory: ClientFactory = (token) => new ApifyClient({token}) as unknown as ApifyClientLike;
const defaultNow = () => new Date();
const LOCK_STALE_MS = 5 * 60 * 1000;
const LOCK_POLL_MS = 150;
const LOCK_WAIT_MS = 5_000;

function normalizeTopic(topic: string): string {
  return topic.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function topicKey(topic: string): string {
  return normalizeTopic(topic).toLocaleLowerCase('en-US');
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function safeSearchPhrase(topic: string): string {
  return normalizeTopic(topic).replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function toFiniteNonNegative(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function parseTweetMetrics(item: unknown): TweetMetrics | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  if (typeof row.createdAt !== 'string') return null;

  const replyCount = toFiniteNonNegative(row.replyCount);
  const engagement =
    toFiniteNonNegative(row.likeCount)
    + toFiniteNonNegative(row.retweetCount)
    + replyCount
    + toFiniteNonNegative(row.quoteCount);

  return {createdAt: row.createdAt, replyCount, engagement};
}

function median(values: number[]): number {
  if (values.length === 0) throw new Error('median requires values');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function windowFor(now: Date): {start: Date; end: Date} {
  return {
    start: new Date(now.getTime() - WINDOW_HOURS * 60 * 60 * 1000),
    end: now,
  };
}

function unknownResult(
  topic: string,
  reason: XEngagementUnknownReason,
  now: Date,
  cached = false,
): XEngagementUnknown {
  const window = windowFor(now);
  return {
    status: 'UNKNOWN',
    topic,
    reason,
    source: 'apify',
    actor: APIFY_ACTOR_SLUG,
    cached,
    fetchedAt: now.toISOString(),
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
  };
}

function isResult(value: unknown): value is XEngagementResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return result.status === 'KNOWN' || result.status === 'UNKNOWN';
}

class DailyFileCache {
  readonly #cacheDir: string;

  constructor(cacheDir: string) {
    this.#cacheDir = cacheDir;
  }

  #baseName(topic: string, date: string): string {
    const hash = createHash('sha256').update(`${topic}\n${date}`).digest('hex');
    return join(this.#cacheDir, `x-engagement-${date}-${hash}`);
  }

  async read(topic: string, date: string): Promise<XEngagementResult | null> {
    const path = `${this.#baseName(topic, date)}.json`;
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8')) as CacheEnvelope;
      if (parsed.version !== 1 || parsed.topicKey !== topic || parsed.dateKey !== date || !isResult(parsed.result)) {
        return null;
      }
      return {...parsed.result, cached: true};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async write(topic: string, date: string, result: XEngagementResult): Promise<void> {
    await mkdir(this.#cacheDir, {recursive: true});
    const base = this.#baseName(topic, date);
    const finalPath = `${base}.json`;
    const tempPath = `${base}.${process.pid}.${Date.now()}.tmp`;
    const payload: CacheEnvelope = {version: 1, topicKey: topic, dateKey: date, result: {...result, cached: false}};
    await writeFile(tempPath, `${JSON.stringify(payload)}\n`, {encoding: 'utf8', mode: 0o600});
    await rename(tempPath, finalPath);
  }

  async withDailyLock<T>(topic: string, date: string, task: () => Promise<T>): Promise<T> {
    await mkdir(this.#cacheDir, {recursive: true});
    const lockPath = `${this.#baseName(topic, date)}.lock`;
    const startedAt = Date.now();

    while (true) {
      try {
        const handle = await open(lockPath, 'wx', 0o600);
        await handle.close();
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST') throw error;

        try {
          const lockStat = await stat(lockPath);
          if (Date.now() - lockStat.mtimeMs > LOCK_STALE_MS) {
            await rm(lockPath, {force: true});
            continue;
          }
        } catch (statError) {
          if ((statError as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw statError;
        }

        if (Date.now() - startedAt >= LOCK_WAIT_MS) {
          throw new Error('daily cache lock timeout');
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
      }
    }

    try {
      return await task();
    } finally {
      await rm(lockPath, {force: true});
    }
  }
}

export class XEngagementAdapter {
  readonly #client: ApifyClientLike | null;
  readonly #initReason: XEngagementUnknownReason | null;
  readonly #cache: DailyFileCache;
  readonly #now: () => Date;
  readonly #inFlight = new Map<string, Promise<XEngagementResult>>();

  constructor(options: {
    client: ApifyClientLike | null;
    initReason: XEngagementUnknownReason | null;
    cacheDir: string;
    now: () => Date;
  }) {
    this.#client = options.client;
    this.#initReason = options.initReason;
    this.#cache = new DailyFileCache(options.cacheDir);
    this.#now = options.now;
  }

  async getTopicEngagement(topicInput: string): Promise<XEngagementResult> {
    const topic = normalizeTopic(topicInput);
    const now = this.#now();

    if (!topic || topic.length > 120) return unknownResult(topic, 'INVALID_TOPIC', now);
    if (this.#initReason || !this.#client) {
      return unknownResult(topic, this.#initReason ?? 'APIFY_ERROR', now);
    }

    const normalized = topicKey(topic);
    const date = dayKey(now);
    const requestKey = `${normalized}\n${date}`;
    const existing = this.#inFlight.get(requestKey);
    if (existing) return existing;

    const promise = this.#getOrFetch(topic, normalized, date, now);
    this.#inFlight.set(requestKey, promise);
    try {
      return await promise;
    } finally {
      this.#inFlight.delete(requestKey);
    }
  }

  async #getOrFetch(topic: string, normalized: string, date: string, now: Date): Promise<XEngagementResult> {
    try {
      const cached = await this.#cache.read(normalized, date);
      if (cached) return cached;
    } catch {
      return unknownResult(topic, 'CACHE_ERROR', now);
    }

    try {
      return await this.#cache.withDailyLock(normalized, date, async () => {
        const secondRead = await this.#cache.read(normalized, date);
        if (secondRead) return secondRead;

        const result = await this.#fetchFromApify(topic, now);
        await this.#cache.write(normalized, date, result);
        return result;
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'daily cache lock timeout') {
        return unknownResult(topic, 'CACHE_ERROR', now);
      }
      return unknownResult(topic, 'CACHE_ERROR', now);
    }
  }

  async #fetchFromApify(topic: string, now: Date): Promise<XEngagementResult> {
    if (!this.#client) return unknownResult(topic, 'APIFY_ERROR', now);
    const window = windowFor(now);
    const phrase = safeSearchPhrase(topic);
    const actorStart = toDateOnly(window.start);
    const actorEnd = toDateOnly(addDays(window.end, 1));
    const query = `"${phrase}" since:${actorStart} until:${actorEnd} -filter:retweets`;

    try {
      const run = await this.#client.actor(APIFY_ACTOR_SLUG).call({
        searchTerms: [query],
        sort: 'Top',
        maxItems: MAX_ITEMS,
        minimumReplies: MIN_REPLIES,
        start: actorStart,
        end: actorEnd,
        includeSearchTerms: true,
      });

      if (run.status && run.status !== 'SUCCEEDED') return unknownResult(topic, 'APIFY_ERROR', now);
      if (!run.defaultDatasetId) return unknownResult(topic, 'APIFY_ERROR', now);

      const {items} = await this.#client.dataset(run.defaultDatasetId).listItems({limit: MAX_ITEMS});
      const filtered = items
        .map(parseTweetMetrics)
        .filter((row): row is TweetMetrics => row !== null)
        .filter((row) => row.replyCount >= MIN_REPLIES)
        .filter((row) => {
          const createdAt = Date.parse(row.createdAt);
          return Number.isFinite(createdAt) && createdAt >= window.start.getTime() && createdAt <= window.end.getTime();
        })
        .sort((a, b) => b.engagement - a.engagement);

      if (filtered.length === 0) return unknownResult(topic, 'INSUFFICIENT_DATA', now);

      const sample = filtered.slice(0, TOP_SAMPLE_SIZE);
      return {
        status: 'KNOWN',
        topic,
        topicMedianEngagement: median(sample.map((row) => row.engagement)),
        sampleSize: sample.length,
        sourceCount: filtered.length,
        source: 'apify',
        actor: APIFY_ACTOR_SLUG,
        cached: false,
        fetchedAt: now.toISOString(),
        windowStart: window.start.toISOString(),
        windowEnd: window.end.toISOString(),
      };
    } catch {
      return unknownResult(topic, 'APIFY_ERROR', now);
    }
  }
}

export async function createXEngagementAdapter(options: AdapterOptions = {}): Promise<XEngagementAdapter> {
  const token = options.token ?? process.env.APIFY_TOKEN;
  const cacheDir = options.cacheDir ?? process.env.X_ENGAGEMENT_CACHE_DIR ?? '.cache/x-engagement';
  const now = options.now ?? defaultNow;

  if (!token) {
    return new XEngagementAdapter({client: null, initReason: 'TOKEN_MISSING', cacheDir, now});
  }

  try {
    const client = (options.clientFactory ?? defaultClientFactory)(token);
    const actor = await client.actor(APIFY_ACTOR_SLUG).get();
    if (!actor) {
      return new XEngagementAdapter({client: null, initReason: 'ACTOR_UNAVAILABLE', cacheDir, now});
    }
    return new XEngagementAdapter({client, initReason: null, cacheDir, now});
  } catch {
    return new XEngagementAdapter({client: null, initReason: 'APIFY_ERROR', cacheDir, now});
  }
}
