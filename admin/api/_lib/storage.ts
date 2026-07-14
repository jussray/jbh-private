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
  ProcessedStripeEvent,
  FailedWebhookEvent,
  UpsertFailedWebhookEventInput,
} from "../../shared/schema";

const {
  orders,
  newsletter,
  contactMessages,
  processedStripeEvents,
  failedWebhookEvents,
} = schema;

export const storage = {
  // ─── Orders ───────────────────────────────────────────────────────────────

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

  // ─── Newsletter & Contact ──────────────────────────────────────────────

  async addNewsletter(entry: InsertNewsletter): Promise<Newsletter> {
    const [row] = await db.insert(newsletter).values(entry).returning();
    return row;
  },

  async addContact(entry: InsertContact): Promise<ContactMessage> {
    const [row] = await db.insert(contactMessages).values(entry).returning();
    return row;
  },

  // ─── Webhook reliability ───────────────────────────────────────────────

  /**
   * Returns the processed event record if this Stripe event_id has already
   * been handled, or null if it has not. Used for idempotency checks.
   */
  async findProcessedEvent(
    stripeEventId: string
  ): Promise<ProcessedStripeEvent | null> {
    const [row] = await db
      .select()
      .from(processedStripeEvents)
      .where(eq(processedStripeEvents.stripeEventId, stripeEventId));
    return row ?? null;
  },

  /**
   * Marks a Stripe event as successfully processed.
   * Call this AFTER your handler logic succeeds — never before.
   * Safe to call multiple times (INSERT OR IGNORE via onConflictDoNothing).
   */
  async createProcessedEvent(stripeEventId: string): Promise<void> {
    await db
      .insert(processedStripeEvents)
      .values({ stripeEventId })
      .onConflictDoNothing();
  },

  /**
   * Writes a failed event to the dead-letter queue.
   * If the same event_id fails again (Stripe retry), increments retry_count
   * and updates last_error rather than inserting a duplicate row.
   */
  async upsertFailedWebhookEvent(
    input: UpsertFailedWebhookEventInput
  ): Promise<void> {
    await db
      .insert(failedWebhookEvents)
      .values({
        stripeEventId: input.stripeEventId,
        eventType: input.eventType,
        lastError: input.lastError ?? null,
        retryCount: 1,
      })
      .onConflictDoUpdate({
        target: failedWebhookEvents.stripeEventId,
        set: {
          retryCount: sql`${failedWebhookEvents.retryCount} + 1`,
          lastError: input.lastError ?? null,
          failedAt: sql`NOW()`,
        },
      });
  },
};
