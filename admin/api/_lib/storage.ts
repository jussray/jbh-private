// Storage layer reused across serverless functions and the local dev server.
import { and, eq, sql } from "drizzle-orm";
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
  Vendor,
  VendorFulfillmentGroup,
} from "../../shared/schema";

const {
  orders,
  vendors,
  vendorProductMappings,
  vendorFulfillmentGroups,
  vendorDispatchJobs,
  vendorRoutingExceptions,
  newsletter,
  contactMessages,
  processedStripeEvents,
  failedWebhookEvents,
} = schema;

export type ActiveVendorMapping = {
  productId: string;
  variant: string;
  vendorId: number;
};

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

  async getOrderByStripeSessionId(
    stripeSessionId: string,
  ): Promise<Order | undefined> {
    const [row] = await db
      .select()
      .from(orders)
      .where(eq(orders.stripeSessionId, stripeSessionId));
    return row;
  },

  async createPaidCheckoutOrder(
    order: InsertOrder & { stripeSessionId: string },
  ): Promise<{ order: Order; created: boolean }> {
    const [created] = await db
      .insert(orders)
      .values(order)
      .onConflictDoNothing()
      .returning();

    if (created) return { order: created, created: true };

    const [existing] = await db
      .select()
      .from(orders)
      .where(eq(orders.stripeSessionId, order.stripeSessionId));

    if (!existing) {
      throw new Error("paid_order_insert_conflict");
    }

    return { order: existing, created: false };
  },

  async listOrders(): Promise<Order[]> {
    return db
      .select()
      .from(orders)
      .orderBy(sql`${orders.createdAt} DESC`);
  },

  async updateOrderStatus(
    id: number,
    status: string,
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
    stripePaymentIntentId: string | null,
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

  // ─── Private vendor routing ──────────────────────────────────────────────

  async listVendors(): Promise<Vendor[]> {
    return db.select().from(vendors).orderBy(vendors.displayName);
  },

  async getActiveVendor(id: number): Promise<Vendor | undefined> {
    const [vendor] = await db
      .select()
      .from(vendors)
      .where(and(eq(vendors.id, id), eq(vendors.active, true)));
    return vendor;
  },

  async upsertVendor(input: {
    code: string;
    displayName: string;
    fulfillmentEmail?: string | null;
    active?: boolean;
  }): Promise<Vendor> {
    const [vendor] = await db
      .insert(vendors)
      .values({
        code: input.code,
        displayName: input.displayName,
        fulfillmentEmail: input.fulfillmentEmail ?? null,
        active: input.active ?? true,
      })
      .onConflictDoUpdate({
        target: vendors.code,
        set: {
          displayName: input.displayName,
          fulfillmentEmail: input.fulfillmentEmail ?? null,
          active: input.active ?? true,
          updatedAt: sql`NOW()`,
        },
      })
      .returning();
    return vendor;
  },

  async upsertVendorMapping(input: {
    productId: string;
    variant: string;
    vendorId: number;
  }) {
    const [mapping] = await db
      .insert(vendorProductMappings)
      .values({
        productId: input.productId,
        variant: input.variant,
        vendorId: input.vendorId,
        active: true,
      })
      .onConflictDoUpdate({
        target: [
          vendorProductMappings.productId,
          vendorProductMappings.variant,
        ],
        set: {
          vendorId: input.vendorId,
          active: true,
          updatedAt: sql`NOW()`,
        },
      })
      .returning();
    return mapping;
  },

  async listActiveVendorMappings(): Promise<ActiveVendorMapping[]> {
    return db
      .select({
        productId: vendorProductMappings.productId,
        variant: vendorProductMappings.variant,
        vendorId: vendorProductMappings.vendorId,
      })
      .from(vendorProductMappings)
      .innerJoin(vendors, eq(vendorProductMappings.vendorId, vendors.id))
      .where(
        and(
          eq(vendorProductMappings.active, true),
          eq(vendors.active, true),
        ),
      );
  },

  async createFulfillmentGroup(input: {
    orderId: number;
    vendorId: number;
    itemsJson: unknown;
  }): Promise<VendorFulfillmentGroup> {
    const [created] = await db
      .insert(vendorFulfillmentGroups)
      .values({
        orderId: input.orderId,
        vendorId: input.vendorId,
        itemsJson: input.itemsJson,
      })
      .onConflictDoNothing({
        target: [
          vendorFulfillmentGroups.orderId,
          vendorFulfillmentGroups.vendorId,
        ],
      })
      .returning();

    if (created) return created;

    const [existing] = await db
      .select()
      .from(vendorFulfillmentGroups)
      .where(
        and(
          eq(vendorFulfillmentGroups.orderId, input.orderId),
          eq(vendorFulfillmentGroups.vendorId, input.vendorId),
        ),
      );
    if (!existing) throw new Error("vendor_group_insert_conflict");
    return existing;
  },

  async createRoutingException(input: {
    orderId: number;
    productId: string;
    variant: string;
    reason: string;
  }): Promise<void> {
    await db
      .insert(vendorRoutingExceptions)
      .values(input)
      .onConflictDoNothing({
        target: [
          vendorRoutingExceptions.orderId,
          vendorRoutingExceptions.productId,
          vendorRoutingExceptions.variant,
          vendorRoutingExceptions.reason,
        ],
      });
  },

  async resolveRoutingException(input: {
    orderId: number;
    productId: string;
    variant: string;
  }): Promise<void> {
    await db
      .update(vendorRoutingExceptions)
      .set({ resolvedAt: sql`NOW()` })
      .where(
        and(
          eq(vendorRoutingExceptions.orderId, input.orderId),
          eq(vendorRoutingExceptions.productId, input.productId),
          eq(vendorRoutingExceptions.variant, input.variant),
          eq(vendorRoutingExceptions.reason, "vendor_mapping_missing"),
        ),
      );
  },

  async listRoutingExceptions(orderId: number) {
    return db
      .select()
      .from(vendorRoutingExceptions)
      .where(eq(vendorRoutingExceptions.orderId, orderId))
      .orderBy(vendorRoutingExceptions.createdAt);
  },

  async listFulfillmentGroups(orderId: number) {
    return db
      .select({
        id: vendorFulfillmentGroups.id,
        orderId: vendorFulfillmentGroups.orderId,
        vendorId: vendorFulfillmentGroups.vendorId,
        vendorCode: vendors.code,
        vendorDisplayName: vendors.displayName,
        vendorFulfillmentEmail: vendors.fulfillmentEmail,
        itemsJson: vendorFulfillmentGroups.itemsJson,
        status: vendorFulfillmentGroups.status,
        ownerApprovedAt: vendorFulfillmentGroups.ownerApprovedAt,
        queuedAt: vendorFulfillmentGroups.queuedAt,
        trackingJson: vendorFulfillmentGroups.trackingJson,
        createdAt: vendorFulfillmentGroups.createdAt,
        updatedAt: vendorFulfillmentGroups.updatedAt,
      })
      .from(vendorFulfillmentGroups)
      .innerJoin(vendors, eq(vendorFulfillmentGroups.vendorId, vendors.id))
      .where(eq(vendorFulfillmentGroups.orderId, orderId))
      .orderBy(vendorFulfillmentGroups.id);
  },

  async listDispatchJobs(orderId: number) {
    return db
      .select({
        id: vendorDispatchJobs.id,
        fulfillmentGroupId: vendorDispatchJobs.fulfillmentGroupId,
        status: vendorDispatchJobs.status,
        attemptCount: vendorDispatchJobs.attemptCount,
        lastError: vendorDispatchJobs.lastError,
        createdAt: vendorDispatchJobs.createdAt,
        updatedAt: vendorDispatchJobs.updatedAt,
      })
      .from(vendorDispatchJobs)
      .innerJoin(
        vendorFulfillmentGroups,
        eq(
          vendorDispatchJobs.fulfillmentGroupId,
          vendorFulfillmentGroups.id,
        ),
      )
      .where(eq(vendorFulfillmentGroups.orderId, orderId))
      .orderBy(vendorDispatchJobs.id);
  },

  async approveFulfillmentGroup(
    orderId: number,
    groupId: number,
  ): Promise<VendorFulfillmentGroup | undefined> {
    const [group] = await db
      .update(vendorFulfillmentGroups)
      .set({
        status: "approved",
        ownerApprovedAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(vendorFulfillmentGroups.id, groupId),
          eq(vendorFulfillmentGroups.orderId, orderId),
          eq(vendorFulfillmentGroups.status, "pending_owner_approval"),
        ),
      )
      .returning();
    return group;
  },

  async overrideFulfillmentVendor(input: {
    orderId: number;
    groupId: number;
    vendorId: number;
  }): Promise<VendorFulfillmentGroup | undefined> {
    const vendor = await this.getActiveVendor(input.vendorId);
    if (!vendor) throw new Error("vendor_not_active");

    const [group] = await db
      .select()
      .from(vendorFulfillmentGroups)
      .where(
        and(
          eq(vendorFulfillmentGroups.id, input.groupId),
          eq(vendorFulfillmentGroups.orderId, input.orderId),
        ),
      );
    if (!group || group.status !== "pending_owner_approval") return undefined;

    const [conflict] = await db
      .select({ id: vendorFulfillmentGroups.id })
      .from(vendorFulfillmentGroups)
      .where(
        and(
          eq(vendorFulfillmentGroups.orderId, input.orderId),
          eq(vendorFulfillmentGroups.vendorId, input.vendorId),
        ),
      );
    if (conflict && conflict.id !== input.groupId) {
      throw new Error("vendor_group_conflict");
    }

    const [updated] = await db
      .update(vendorFulfillmentGroups)
      .set({
        vendorId: input.vendorId,
        updatedAt: sql`NOW()`,
      })
      .where(eq(vendorFulfillmentGroups.id, input.groupId))
      .returning();
    return updated;
  },

  async queueFulfillmentDispatch(
    orderId: number,
    groupId: number,
  ): Promise<VendorFulfillmentGroup | undefined> {
    const [existing] = await db
      .select()
      .from(vendorFulfillmentGroups)
      .where(
        and(
          eq(vendorFulfillmentGroups.id, groupId),
          eq(vendorFulfillmentGroups.orderId, orderId),
        ),
      );
    if (!existing) return undefined;
    if (!["approved", "queued_for_dispatch"].includes(existing.status)) {
      return undefined;
    }

    let group = existing;
    if (existing.status === "approved") {
      const [updated] = await db
        .update(vendorFulfillmentGroups)
        .set({
          status: "queued_for_dispatch",
          queuedAt: sql`NOW()`,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(vendorFulfillmentGroups.id, groupId),
            eq(vendorFulfillmentGroups.status, "approved"),
          ),
        )
        .returning();
      if (!updated) return undefined;
      group = updated;
    }

    await db
      .insert(vendorDispatchJobs)
      .values({ fulfillmentGroupId: groupId, status: "queued" })
      .onConflictDoNothing({ target: vendorDispatchJobs.fulfillmentGroupId });

    return group;
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
    stripeEventId: string,
  ): Promise<ProcessedStripeEvent | null> {
    const [row] = await db
      .select()
      .from(processedStripeEvents)
      .where(eq(processedStripeEvents.stripeEventId, stripeEventId));
    return row ?? null;
  },

  /**
   * Marks a Stripe event as successfully processed.
   * Call this AFTER your handler logic succeeds, never before.
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
    input: UpsertFailedWebhookEventInput,
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
