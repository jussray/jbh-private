-- Prevent two database orders from representing the same Stripe Checkout Session.
-- Fail closed if historical duplicates exist so an operator can reconcile them
-- instead of silently choosing a winner.

DO $$
BEGIN
  IF EXISTS (
    SELECT stripe_session_id
    FROM orders
    WHERE stripe_session_id IS NOT NULL
    GROUP BY stripe_session_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate stripe_session_id values must be reconciled before migration';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_id_unique
  ON orders (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
