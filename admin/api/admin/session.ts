import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkAdmin } from "../_lib/admin";

/**
 * Same-origin bootstrap endpoint for a private admin frontend protected by
 * Cloudflare Access. Cloudflare owns the CF_Authorization browser cookie; this
 * origin validates only the Cf-Access-Jwt-Assertion header and never receives,
 * parses, mirrors, or reissues the provider cookie.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await checkAdmin(req, res))) return;

  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  return res.status(200).json({
    authenticated: true,
    provider: "cloudflare-access",
    logoutPath: "/cdn-cgi/access/logout",
  });
}
