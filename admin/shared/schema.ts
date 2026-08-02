import {
  pgTable,
  serial,
  text,
  doublePrecision,
  jsonb,
  timestamp,
  integer,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Orders placed through Stripe Checkout
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  addressJson: jsonb("address_json").notNull(),
  itemsJson: jsonb("items_json").notNull(),
  subtotal: doublePrecision("subtotal").notNull(),
  shipping: doublePrecision("shipping").notNull(),
  total: doublePrecision("total").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  stripeSessionId: text("stripe_session_id").unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Public checkout request shape.
 *
 * Product names, images, and prices are intentionally not accepted here.
 * The checkout handler resolves those values from the server-side catalog.
 */
export const insertOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(5).max(40),
  addressJson: z.object({
    street: z.string().trim().min(1).max(160),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(2).max(60),
    zip: z.string().trim().min(3).max(20),
  }),
  itemsJson: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(100),
        variant: z.string().trim().min(1).max(100),
        qty: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(20),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export type CheckoutOrderInput = z.infer<typeof insertOrderSchema>;
export type InsertOrder = typeof orders.$inferInsert;
export type Order = typeof orders.$inferSelect;

// Private vendor registry. These rows must never be exposed by a public route.
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  displayName: text("display_name").notNull(),
  fulfillmentEmail: text("fulfillment_email"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vendorProductMappings = pgTable(
  "vendor_product_mappings",
  {
    id: serial("id").primaryKey(),
    productId: text("product_id").notNull(),
    variant: text("variant").notNull(),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("vendor_product_mapping_unique").on(
      table.productId,
      table.variant,
    ),
  ],
);

export const vendorFulfillmentGroups = pgTable(
  "vendor_fulfillment_groups",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    itemsJson: jsonb("items_json").notNull(),
    status: text("status").notNull().default("pending_owner_approval"),
    ownerApprovedAt: timestamp("owner_approved_at", { withTimezone: true }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    trackingJson: jsonb("tracking_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("vendor_fulfillment_order_vendor_unique").on(
      table.orderId,
      table.vendorId,
    ),
  ],
);

export const vendorRoutingExceptions = pgTable(
  "vendor_routing_exceptions",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    productId: text("product_id").notNull(),
    variant: text("variant").notNull(),
    reason: text("reason").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("vendor_routing_exception_unique").on(
      table.orderId,
      table.productId,
      table.variant,
      table.reason,
    ),
  ],
);

export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = typeof vendors.$inferInsert;
export type VendorProductMapping = typeof vendorProductMappings.$inferSelect;
export type VendorFulfillmentGroup = typeof vendorFulfillmentGroups.$inferSelect;
export type VendorRoutingException = typeof vendorRoutingExceptions.$inferSelect;

// Newsletter signups
export const newsletter = pgTable("newsletter", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNewsletterSchema = createInsertSchema(newsletter).omit({
  id: true,
  createdAt: true,
});

export type InsertNewsletter = z.infer<typeof insertNewsletterSchema>;
export type Newsletter = typeof newsletter.$inferSelect;

// Contact form messages
export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertContactSchema = createInsertSchema(contactMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertContact = z.infer<typeof insertContactSchema>;
export type ContactMessage = typeof contactMessages.$inferSelect;

// Webhook reliability tables
export const processedStripeEvents = pgTable("processed_stripe_events", {
  stripeEventId: text("stripe_event_id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProcessedStripeEvent = typeof processedStripeEvents.$inferSelect;

export const failedWebhookEvents = pgTable("failed_webhook_events", {
  stripeEventId: text("stripe_event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  failedAt: timestamp("failed_at", { withTimezone: true }).notNull().defaultNow(),
  retryCount: integer("retry_count").notNull().default(1),
  lastError: text("last_error"),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export type FailedWebhookEvent = typeof failedWebhookEvents.$inferSelect;

export interface UpsertFailedWebhookEventInput {
  stripeEventId: string;
  eventType: string;
  lastError?: string;
}
