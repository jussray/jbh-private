// Storage layer reused across serverless functions and the local dev server.
import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type {
  Order,
  InsertOrder,
  Newsletter,
  InsertNewsletter,
  ContactMessage,
  InsertContact,
} from "../../shared/schema";

const { orders, newsletter, contactMessages } = schema;

export const storage = {
  async createOrder(order: InsertOrder): Promise<Order> {
    const [row] = await db.insert(orders).values(order).returning();
    return row;
  },

  async getOrder(id: number): Promise<Order | undefined> {
    const [row] = await db.select().from(orders).where(eq(orders.id, id));
    return row;
  },

  async listOrders(): Promise<Order[]> {
    return db
      .select()
      .from(orders)
      .orderBy(sql`${orders.createdAt} DESC`);
  },

  async updateOrderStatus(
    id: number,
    status: string
  ): Promise<Order | undefined> {
    const [row] = await db
      .update(orders)
      .set({ status })
      .where(eq(orders.id, id))
      .returning();
    return row;
  },

  async markOrderPaid(
    id: number,
    stripeSessionId: string,
    stripePaymentIntentId: string | null
  ): Promise<Order | undefined> {
    const [row] = await db
      .update(orders)
      .set({
        paymentStatus: "paid",
        stripeSessionId,
        stripePaymentIntentId,
        status: "processing",
      })
      .where(eq(orders.id, id))
      .returning();
    return row;
  },

  async attachStripeSession(id: number, sessionId: string): Promise<void> {
    await db
      .update(orders)
      .set({ stripeSessionId: sessionId })
      .where(eq(orders.id, id));
  },

  async addNewsletter(entry: InsertNewsletter): Promise<Newsletter> {
    const [row] = await db.insert(newsletter).values(entry).returning();
    return row;
  },

  async addContact(entry: InsertContact): Promise<ContactMessage> {
    const [row] = await db.insert(contactMessages).values(entry).returning();
    return row;
  },
};
