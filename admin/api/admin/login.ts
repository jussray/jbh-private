import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkAdmin } from "../_lib/admin";

/**
 * Cloudflare Access session probe.
 *
 * The legacy password endpoint has been removed. Cloudflare Access performs
 * the login flow before this route is reached; this endpoint only confirms
 * that the signed Access assertion is valid for the owner allowlist.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await checkAdmin(req, res))) return;
  return res.status(200).json({ ok: true });
}
