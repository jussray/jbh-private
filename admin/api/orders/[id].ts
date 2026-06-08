// GET /api/orders/:id — public order lookup for the confirmation page
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { storage } from "../_lib/storage";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const id = Number(req.query.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const order = await storage.getOrder(id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  // Don't leak internal payment id
  const { stripePaymentIntentId, ...safe } = order as any;
  return res.status(200).json(safe);
}
