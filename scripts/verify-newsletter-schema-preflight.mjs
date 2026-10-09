import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("newsletter_schema_preflight_missing_database_url");
}

const sql = neon(databaseUrl);

const [legacyShadow] = await sql`
  SELECT to_regclass('public.newsletter_subscribers')::text AS relation
`;
if (legacyShadow?.relation) {
  throw new Error("newsletter_schema_preflight_dual_store_detected");
}

const columns = await sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'newsletter'
`;

const byName = new Map(columns.map((column) => [column.column_name, column]));
const requiredColumns = new Map([
  ["email", "text"],
  ["receipt_id", "uuid"],
  ["consent_at", "timestamp with time zone"],
  ["source", "text"],
  ["subscribed", "boolean"],
  ["unsubscribed_at", "timestamp with time zone"],
  ["created_at", "timestamp with time zone"],
  ["updated_at", "timestamp with time zone"],
]);

for (const [name, type] of requiredColumns) {
  const column = byName.get(name);
  if (!column || column.data_type !== type) {
    throw new Error(`newsletter_schema_preflight_missing_column:${name}`);
  }
}

const indexes = await sql`
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'newsletter'
`;

const normalizedEmail = indexes.find(
  (index) =>
    index.indexname === "newsletter_email_normalized_idx" &&
    /CREATE UNIQUE INDEX/i.test(index.indexdef) &&
    /lower\(email\)/i.test(index.indexdef),
);
if (!normalizedEmail) {
  throw new Error("newsletter_schema_preflight_missing_normalized_email_index");
}

const receiptIndex = indexes.find(
  (index) =>
    index.indexname === "newsletter_receipt_idx" &&
    /CREATE UNIQUE INDEX/i.test(index.indexdef) &&
    /receipt_id/i.test(index.indexdef),
);
if (!receiptIndex) {
  throw new Error("newsletter_schema_preflight_missing_receipt_index");
}

const constraints = await sql`
  SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
  WHERE conrelid = 'public.newsletter'::regclass
`;

if (!constraints.some((constraint) => constraint.conname === "newsletter_subscription_state")) {
  throw new Error("newsletter_schema_preflight_missing_subscription_state_constraint");
}

console.log(
  JSON.stringify({
    state: "VERIFIED",
    table: "public.newsletter",
    canonicalStore: true,
    legacyShadowAbsent: true,
    columns: [...requiredColumns.keys()],
    indexes: ["newsletter_email_normalized_idx", "newsletter_receipt_idx"],
    constraint: "newsletter_subscription_state",
  }),
);
