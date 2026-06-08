// Header-based admin auth helper for Vercel functions.
import type { VercelRequest, VercelResponse } from "@vercel/node";

const ADMIN_PASSWORD = process.env.JBH_ADMIN_PASSWORD ?? "";

export function checkAdmin(
  req: VercelRequest,
  res: VercelResponse
): boolean {
  if (!ADMIN_PASSWORD) {
    res.status(503).json({ error: "Admin not configured" });
    return false;
  }
  const provided = req.headers["x-admin-password"];
  if (!provided || provided !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function isPasswordConfigured(): boolean {
  return !!ADMIN_PASSWORD;
}

export function passwordMatches(provided: unknown): boolean {
  return (
    typeof provided === "string" &&
    ADMIN_PASSWORD.length > 0 &&
    provided === ADMIN_PASSWORD
  );
}
