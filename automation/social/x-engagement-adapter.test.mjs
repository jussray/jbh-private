import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {
  APIFY_ACTOR_SLUG,
  MAX_ITEMS,
  MIN_REPLIES,
  createXEngagementAdapter,
} from '../../.cache/x-engagement-build/x-engagement-adapter.js';

const FIXED_NOW = new Date('2026-08-19T20:00:00.000Z');

async function withTempCache(run) {
  const dir = await mkdtemp(join(tmpdir(), 'jbh-x-engagement-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}

function tweet({hoursAgo = 1, likes = 0, retweets = 0, replies = 50, quotes = 0} = {}) {
  return {
    createdAt: new Date(FIXED_NOW.getTime() - hoursAgo * 60 * 60 * 1000).toUTCString(),
    likeCount: likes,
    retweetCount: retweets,
    replyCount: replies,
    quoteCount: quotes,
  };
}

function mockClient({items = [], actorExists = true, callError = null, runStatus = 'SUCCEEDED'} = {}) {
  const state = {
    actorGetCalls: 0,
    actorCallCount: 0,
    datasetCallCount: 0,
    actorId: null,
    callInput: null,
  };

  const client = {
    actor(id) {
      state.actorId = id;
      return {
        async get() {
          state.actorGetCalls += 1;
          return actorExists ? {id} : undefined;
        },
        async call(input) {
          state.actorCallCount += 1;
          state.callInput = input;
          if (callError) throw callError;
          return {status: runStatus, defaultDatasetId: 'dataset-1'};
        },
      };
    },
    dataset(id) {
      assert.equal(id, 'dataset-1');
      return {
        async listItems(options) {
          state.datasetCallCount += 1;
          assert.equal(options.limit, MAX_ITEMS);
          return {items};
        },
      };
    },
  };

  return {client, state};
}

test('missing APIFY_TOKEN returns UNKNOWN and never creates a client', async () => {
  await withTempCache(async (cacheDir) => {
    let factoryCalls = 0;
    const adapter = await createXEngagementAdapter({
      token: '',
      cacheDir,
      now: () => FIXED_NOW,
      clientFactory: () => {
        factoryCalls += 1;
        throw new Error('must not be called');
      },
    });

    const result = await adapter.getTopicEngagement('lace wigs');
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.reason, 'TOKEN_MISSING');
    assert.equal(factoryCalls, 0);
    assert.equal('topicMedianEngagement' in result, false);
  });
});

test('initialization validates the exact actor slug and fails closed when absent', async () => {
  await withTempCache(async (cacheDir) => {
    const {client, state} = mockClient({actorExists: false});
    const adapter = await createXEngagementAdapter({
      token: 'test-token',
      cacheDir,
      now: () => FIXED_NOW,
      clientFactory: () => client,
    });

    const result = await adapter.getTopicEngagement('hair extensions');
    assert.equal(state.actorId, APIFY_ACTOR_SLUG);
    assert.equal(state.actorGetCalls, 1);
    assert.equal(state.actorCallCount, 0);
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.reason, 'ACTOR_UNAVAILABLE');
  });
});

test('Apify failures return UNKNOWN rather than a synthetic zero and are cached for the day', async () => {
  await withTempCache(async (cacheDir) => {
    const {client, state} = mockClient({callError: new Error('rate limited')});
    const adapter = await createXEngagementAdapter({
      token: 'test-token',
      cacheDir,
      now: () => FIXED_NOW,
      clientFactory: () => client,
    });

    const first = await adapter.getTopicEngagement('protective styles');
    const second = await adapter.getTopicEngagement('protective styles');

    assert.equal(first.status, 'UNKNOWN');
    assert.equal(first.reason, 'APIFY_ERROR');
    assert.equal('topicMedianEngagement' in first, false);
    assert.equal(second.status, 'UNKNOWN');
    assert.equal(second.cached, true);
    assert.equal(state.actorCallCount, 1);
  });
});

test('successful runs request top 40, minimum 50 replies, and return median of top 10 engagement', async () => {
  await withTempCache(async (cacheDir) => {
    const goodRows = Array.from({length: 12}, (_, index) => tweet({
      hoursAgo: index + 1,
      likes: (index + 1) * 100,
      retweets: 10,
      replies: 50,
      quotes: 5,
    }));
    const rows = [
      ...goodRows,
      tweet({hoursAgo: 60, likes: 999_999, replies: 500}),
      tweet({hoursAgo: 2, likes: 999_999, replies: 49}),
    ];
    const {client, state} = mockClient({items: rows});
    const adapter = await createXEngagementAdapter({
      token: 'test-token',
      cacheDir,
      now: () => FIXED_NOW,
      clientFactory: () => client,
    });

    const result = await adapter.getTopicEngagement(' lace   wigs ');

    assert.equal(result.status, 'KNOWN');
    assert.equal(result.topic, 'lace wigs');
    assert.equal(result.topicMedianEngagement, 815);
    assert.equal(result.sampleSize, 10);
    assert.equal(result.sourceCount, 12);
    assert.equal(state.actorCallCount, 1);
    assert.equal(state.datasetCallCount, 1);
    assert.equal(state.callInput.sort, 'Top');
    assert.equal(state.callInput.maxItems, MAX_ITEMS);
    assert.equal(state.callInput.minimumReplies, MIN_REPLIES);
    assert.equal(state.callInput.includeSearchTerms, true);
    assert.match(state.callInput.searchTerms[0], /^"lace wigs" /);
    assert.match(state.callInput.searchTerms[0], /-filter:retweets$/);
  });
});

test('exact local 48-hour filter rejects provider date leakage', async () => {
  await withTempCache(async (cacheDir) => {
    const {client} = mockClient({items: [tweet({hoursAgo: 49, likes: 5000, replies: 100})]});
    const adapter = await createXEngagementAdapter({
      token: 'test-token',
      cacheDir,
      now: () => FIXED_NOW,
      clientFactory: () => client,
    });

    const result = await adapter.getTopicEngagement('hair care');
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.reason, 'INSUFFICIENT_DATA');
  });
});

test('same normalized topic and UTC date uses one paid actor call', async () => {
  await withTempCache(async (cacheDir) => {
    const {client, state} = mockClient({items: [tweet({likes: 100, replies: 50})]});
    const adapter = await createXEngagementAdapter({
      token: 'test-token',
      cacheDir,
      now: () => FIXED_NOW,
      clientFactory: () => client,
    });

    const first = await adapter.getTopicEngagement('Wigs');
    const second = await adapter.getTopicEngagement('  wigs  ');

    assert.equal(first.status, 'KNOWN');
    assert.equal(second.status, 'KNOWN');
    assert.equal(second.cached, true);
    assert.equal(state.actorCallCount, 1);
  });
});

test('concurrent same-topic requests coalesce into one actor call', async () => {
  await withTempCache(async (cacheDir) => {
    const {client, state} = mockClient({items: [tweet({likes: 100, replies: 50})]});
    const adapter = await createXEngagementAdapter({
      token: 'test-token',
      cacheDir,
      now: () => FIXED_NOW,
      clientFactory: () => client,
    });

    const [first, second] = await Promise.all([
      adapter.getTopicEngagement('bundles'),
      adapter.getTopicEngagement('bundles'),
    ]);

    assert.equal(first.status, 'KNOWN');
    assert.equal(second.status, 'KNOWN');
    assert.equal(state.actorCallCount, 1);
  });
});

test('the cache key resets on the next UTC date', async () => {
  await withTempCache(async (cacheDir) => {
    let now = FIXED_NOW;
    const {client, state} = mockClient({items: [tweet({likes: 100, replies: 50})]});
    const adapter = await createXEngagementAdapter({
      token: 'test-token',
      cacheDir,
      now: () => now,
      clientFactory: () => client,
    });

    const first = await adapter.getTopicEngagement('closures');
    now = new Date('2026-08-20T20:00:00.000Z');
    const second = await adapter.getTopicEngagement('closures');

    assert.equal(first.status, 'KNOWN');
    assert.equal(second.status, 'KNOWN');
    assert.equal(state.actorCallCount, 2);
  });
});

test('invalid topic input never spends an actor call', async () => {
  await withTempCache(async (cacheDir) => {
    const {client, state} = mockClient({items: [tweet()]});
    const adapter = await createXEngagementAdapter({
      token: 'test-token',
      cacheDir,
      now: () => FIXED_NOW,
      clientFactory: () => client,
    });

    const result = await adapter.getTopicEngagement('   ');
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.reason, 'INVALID_TOPIC');
    assert.equal(state.actorCallCount, 0);
  });
});
