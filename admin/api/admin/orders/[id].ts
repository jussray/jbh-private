import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkAdmin } from "../../_lib/admin";
import { storage } from "../../_lib/storage";

const ALLOWED = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await checkAdmin(req, res))) return;

  const id = Number(req.query.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid order id" });
  }

  const { status } = (req.body ?? {}) as { status?: unknown };
  if (typeof status !== "string" || !ALLOWED.includes(status as (typeof ALLOWED)[number])) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const updated = await storage.updateOrderStatus(id, status);
    if (!updated) return res.status(404).json({ error: "Order not found" });
    return res.status(200).json(updated);
  } catch {
    return res.status(500).json({ error: "Unable to update order" });
  }
}
