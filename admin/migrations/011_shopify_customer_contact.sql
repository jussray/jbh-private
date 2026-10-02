-- Keep Shopify physical paid-order intake compatible with checkout contact settings.
-- Shopify can legitimately create an order with phone instead of email.
-- Additive schema transition only: preserve existing rows and require at least
-- one bounded customer contact channel for every physical paid order.

ALTER TABLE shopify_physical_orders
  ALTER COLUMN customer_email DROP NOT NULL;

ALTER TABLE shopify_physical_orders
  DROP CONSTRAINT IF EXISTS shopify_physical_orders_customer_contact_present;

ALTER TABLE shopify_physical_orders
  ADD CONSTRAINT shopify_physical_orders_customer_contact_present
  CHECK (
    NULLIF(BTRIM(customer_email), '') IS NOT NULL
    OR NULLIF(BTRIM(customer_phone), '') IS NOT NULL
  );
