import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkAdmin } from "../../_lib/admin";
import { storage } from "../../_lib/storage";

const ALLOWED = ["pending", "processing", "shipped", "delivered", "cancelled"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });
  if (!checkAdmin(req, res)) return;
  const id = Number(req.query.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { status } = (req.body ?? {}) as { status?: string };
  if (!status || !ALLOWED.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const updated = await storage.updateOrderStatus(id, status);
  if (!updated) return res.status(404).json({ error: "Order not found" });
  return res.status(200).json(updated);
}
