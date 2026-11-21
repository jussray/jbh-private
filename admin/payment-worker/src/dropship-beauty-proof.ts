import type { Env } from "./shared.js";

const DEFAULT_LOCATION_GID = "gid://shopify/Location/94408442099";
const SKU = /^(BRAZ-SEW-(BW|DW|LW|ST|KS|KC|AK|SW)-|BRAZ-TRANS-(CLO-(DW|ST|LW|BW)|FRO-(ST|LW))-|613-BRAZ-SEW-BW-)[A-Z0-9-]*$/;
const MAX_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const TIMEOUT_MS = 20_000;

type FulfillmentNode = {
  id?: unknown;
  status?: unknown;
  requestStatus?: unknown;
  updatedAt?: unknown;
  assignedLocation?: {
    location?: {
      id?: unknown;
      isFulfillmentService?: unknown;
      fulfillmentService?: { id?: unknown; handle?: unknown; serviceName?: unknown } | null;
    } | null;
  } | null;
  lineItems?: { nodes?: Array<{ sku?: unknown }> } | null;
  fulfillments?: { nodes?: Array<{ id?: unknown; status?: unknown; location?: { id?: unknown } | null }> } | null;
  order?: {
    id?: unknown;
    name?: unknown;
    test?: unknown;
    fullyPaid?: unknown;
    displayFinancialStatus?: unknown;
  } | null;
};

export class DropshipBeautyProofError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "DropshipBeautyProofError";
  }
}

function safeId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9:/._-]{8,220}$/.test(value) ? value : null;
}

function safeTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function evaluateDropshipBeautyProof(
  nodes: unknown,
  expectedLocationGid = DEFAULT_LOCATION_GID,
  now = Date.now(),
) {
  if (!Array.isArray(nodes)) throw new DropshipBeautyProofError("shopify_fulfillment_payload_invalid");

  let bestTransport: Record<string, unknown> | null = null;
  let bestLive: Record<string, unknown> | null = null;

  for (const raw of nodes) {
    const node = raw && typeof raw === "object" ? raw as FulfillmentNode : null;
    if (!node) continue;
    const location = node.assignedLocation?.location;
    const service = location?.fulfillmentService;
    if (location?.id !== expectedLocationGid || location?.isFulfillmentService !== true || !service) continue;

    const fulfillmentOrderId = safeId(node.id);
    const orderId = safeId(node.order?.id);
    const updatedAt = safeTimestamp(node.updatedAt);
    if (!fulfillmentOrderId || !orderId || updatedAt === null || updatedAt > now || now - updatedAt > MAX_EVIDENCE_AGE_MS) continue;

    const lineNodes = Array.isArray(node.lineItems?.nodes) ? node.lineItems!.nodes! : [];
    const skus = [...new Set(lineNodes.map((line) => typeof line?.sku === "string" ? line.sku.trim() : "").filter(Boolean))];
    if (!skus.length || skus.some((sku) => !SKU.test(sku))) continue;

    const requestAccepted = node.requestStatus === "ACCEPTED";
    const fulfillmentNodes = Array.isArray(node.fulfillments?.nodes) ? node.fulfillments!.nodes! : [];
    const providerFulfillment = fulfillmentNodes.find((f) =>
      safeId(f?.id) && f?.location?.id === expectedLocationGid && f?.status !== "CANCELLED"
    );
    const closedWithFulfillment = node.requestStatus === "CLOSED" && Boolean(providerFulfillment);
    if (!requestAccepted && !closedWithFulfillment) continue;

    const transport = {
      vendor: "dropship-beauty",
      fulfillmentOrderId,
      orderId,
      orderName: typeof node.order?.name === "string" ? node.order.name.slice(0, 80) : null,
      locationGid: expectedLocationGid,
      requestStatus: node.requestStatus,
      fulfillmentStatus: node.status,
      providerFulfillmentId: providerFulfillment ? safeId(providerFulfillment.id) : null,
      skus,
      observedAt: now,
      sourceUpdatedAt: updatedAt,
    };
    if (!bestTransport || updatedAt > Number(bestTransport.sourceUpdatedAt || 0)) bestTransport = transport;

    const livePaid = node.order?.test === false &&
      node.order?.fullyPaid === true &&
      node.order?.displayFinancialStatus === "PAID";
    if (!livePaid) continue;

    const live = {
      ...transport,
      evidenceRef: `shopify:fulfillment-order:${fulfillmentOrderId}`,
      ownerReceiptRef: providerFulfillment
        ? `shopify:fulfillment:${safeId(providerFulfillment.id)}`
        : `shopify:request:accepted:${fulfillmentOrderId}`,
    };
    if (!bestLive || updatedAt > Number(bestLive.sourceUpdatedAt || 0)) bestLive = live;
  }

  return {
    vendor: "dropship-beauty",
    transportVerified: Boolean(bestTransport),
    liveDispatchVerified: Boolean(bestLive),
    dispatchAuthority: false,
    transportEvidence: bestTransport,
    liveEvidence: bestLive,
    jussPayAuthorityCandidate: bestLive ? {
      enabled: true,
      mode: "verified-owner-handoff",
      evidenceRef: bestLive.evidenceRef,
      ownerReceiptRef: bestLive.ownerReceiptRef,
      ownerHandoffVerified: true,
      verifiedAt: now,
      skus: bestLive.skus,
    } : null,
  };
}

function configuredDomain(env: Env): string {
  const domain = String(env.SHOPIFY_SHOP_DOMAIN || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    throw new DropshipBeautyProofError("shopify_domain_invalid");
  }
  return domain;
}

function configuredApiVersion(env: Env): string {
  const version = String(env.SHOPIFY_ADMIN_API_VERSION || "").trim();
  if (!/^20\d{2}-(01|04|07|10)$/.test(version)) {
    throw new DropshipBeautyProofError("shopify_admin_api_version_required");
  }
  return version;
}

export async function readDropshipBeautyProof(
  env: Env,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
) {
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw new DropshipBeautyProofError("shopify_admin_not_configured");

  const domain = configuredDomain(env);
  const apiVersion = configuredApiVersion(env);
  const locationGid = String(env.DROPSHIP_BEAUTY_LOCATION_GID || DEFAULT_LOCATION_GID).trim();
  if (!/^gid:\/\/shopify\/Location\/\d+$/.test(locationGid)) {
    throw new DropshipBeautyProofError("dropship_beauty_location_invalid");
  }
  const legacyLocationId = locationGid.split("/").pop();
  if (!legacyLocationId) throw new DropshipBeautyProofError("dropship_beauty_location_invalid");

  const query = `query DropshipBeautyProof($first:Int!,$query:String!){
    fulfillmentOrders(first:$first,query:$query,includeClosed:true){
      nodes{
        id status requestStatus updatedAt
        assignedLocation{
          location{
            id isFulfillmentService
            fulfillmentService{id handle serviceName}
          }
        }
        lineItems(first:100){nodes{sku}}
        fulfillments(first:20){nodes{id status location{id}}}
        order{id name test fullyPaid displayFinancialStatus}
      }
    }
  }`;

  let response: Response;
  try {
    response = await fetchImpl(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query,
        variables: { first: 100, query: `assigned_location_id:${legacyLocationId}` },
      }),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new DropshipBeautyProofError("shopify_admin_request_failed");
  }
  if (!response.ok) throw new DropshipBeautyProofError(`shopify_admin_http_${response.status}`);

  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
    throw new DropshipBeautyProofError("shopify_admin_response_too_large");
  }
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new DropshipBeautyProofError("shopify_admin_invalid_json"); }

  if (Array.isArray(payload.errors) && payload.errors.length) {
    throw new DropshipBeautyProofError("shopify_admin_graphql_error");
  }
  const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : null;
  const orders = data?.fulfillmentOrders && typeof data.fulfillmentOrders === "object"
    ? data.fulfillmentOrders as Record<string, unknown>
    : null;
  return evaluateDropshipBeautyProof(orders?.nodes, locationGid, now);
}
