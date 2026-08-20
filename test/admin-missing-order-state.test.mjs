import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../admin/client/src/pages/Admin.tsx", import.meta.url),
  "utf8",
);

test("missing admin orders render a visible recovery state instead of mutating view during render", () => {
  assert.match(source, /function MissingOrderState/);
  assert.match(source, /data-testid="missing-order-state"/);
  assert.match(source, /This order is no longer available\./);
  assert.match(source, /Back to orders/);
  assert.doesNotMatch(
    source,
    /if \(!target\) \{\s*setView\(\{ mode: "list" \}\);\s*return null;\s*\}/,
  );

  const failSafeBranch =
    /if \(!target\) return <MissingOrderState onBack=\{\(\) => setView\(\{ mode: "list" \}\)\} \/>;/g;
  const failSafeMatches = source.match(failSafeBranch) ?? [];
  assert.equal(
    failSafeMatches.length,
    2,
    "both edit and detail modes must render the missing-order recovery state",
  );
});
