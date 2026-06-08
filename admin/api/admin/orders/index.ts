import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkAdmin } from "../../_lib/admin";
import { storage } from "../../_lib/storage";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!checkAdmin(req, res)) return;
  const orders = await storage.listOrders();
  return res.status(200).json(orders);
}
