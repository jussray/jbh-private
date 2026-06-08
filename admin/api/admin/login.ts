import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isPasswordConfigured, passwordMatches } from "../_lib/admin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!isPasswordConfigured()) {
    return res.status(503).json({ ok: false, error: "Admin not configured" });
  }
  const { password } = (req.body ?? {}) as { password?: unknown };
  if (!passwordMatches(password)) return res.status(401).json({ ok: false });
  return res.status(200).json({ ok: true });
}
