import type { VercelRequest, VercelResponse } from "@vercel/node";
import { storage } from "./_lib/storage";
import { insertNewsletterSchema } from "../shared/schema";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const parsed = insertNewsletterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const entry = await storage.addNewsletter(parsed.data);
  return res.status(201).json(entry);
}
