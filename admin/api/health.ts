import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    ok: true,
    adminConfigured: !!process.env.JBH_ADMIN_PASSWORD,
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
    publicUrlConfigured: !!process.env.PUBLIC_URL,
    time: new Date().toISOString(),
  });
}
