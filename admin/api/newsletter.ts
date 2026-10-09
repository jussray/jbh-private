import type { VercelRequest, VercelResponse } from "@vercel/node";

// The legacy newsletter table is not reconciled with the private ingress
// consent ledger. Fail closed rather than creating a second subscriber truth.
// Do not restore this writer without a verified migration and opt-out proof.
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Allow", "POST");
  return res.status(503).json({ error: "Newsletter enrollment is temporarily unavailable" });
}
