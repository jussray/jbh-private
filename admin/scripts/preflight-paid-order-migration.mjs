import { appendFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

function publishResult(result) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `result=${result}\n`, "utf8");
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  publishResult("missing-database-url");
  console.error("Paid-order migration preflight failed: DATABASE_URL is not set.");
  process.exit(2);
}

const sql = neon(databaseUrl);

try {
  const [tableState] = await sql`
    SELECT to_regclass(current_schema() || '.orders') IS NOT NULL AS present
  `;

  if (!tableState?.present) {
    publishResult("orders-table-missing");
    console.error("Paid-order migration preflight failed: orders table is missing.");
    process.exit(3);
  }

  const [duplicateState] = await sql`
    SELECT
      COUNT(*)::int AS duplicate_groups,
      COALESCE(SUM(row_count - 1), 0)::int AS excess_rows
    FROM (
      SELECT COUNT(*)::int AS row_count
      FROM orders
      WHERE stripe_session_id IS NOT NULL
      GROUP BY stripe_session_id
      HAVING COUNT(*) > 1
    ) duplicate_sessions
  `;

  const [indexState] = await sql`
    SELECT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'orders'
        AND indexname = 'orders_stripe_session_id_unique'
    ) AS present
  `;

  const report = {
    ordersTablePresent: true,
    duplicateSessionGroups: Number(duplicateState?.duplicate_groups ?? 0),
    excessDuplicateRows: Number(duplicateState?.excess_rows ?? 0),
    uniqueSessionIndexPresent: Boolean(indexState?.present),
  };

  console.log(JSON.stringify(report, null, 2));

  if (report.duplicateSessionGroups > 0 || report.excessDuplicateRows > 0) {
    publishResult("duplicate-session-references");
    console.error(
      "Paid-order migration preflight blocked: duplicate Stripe session references require operator reconciliation.",
    );
    process.exit(4);
  }

  publishResult(
    report.uniqueSessionIndexPresent
      ? "passed-index-present"
      : "passed-index-missing",
  );
  console.log(
    report.uniqueSessionIndexPresent
      ? "Paid-order migration preflight passed: unique session index is already present."
      : "Paid-order migration preflight passed: no duplicate session references; migration may proceed through an approved operator gate.",
  );
} catch (error) {
  publishResult("query-failed");
  const code = error instanceof Error ? error.name.slice(0, 80) : "UnknownError";
  console.error(`Paid-order migration preflight failed: ${code}`);
  process.exit(5);
}
