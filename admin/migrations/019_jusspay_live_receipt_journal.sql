-- Additive live-only receipt journal. This stores payment evidence, not
-- authorization to procure or dispatch. Existing sandbox and legacy tables
-- are not changed. Run only through the authorized private database process.
BEGIN;
CREATE TABLE IF NOT EXISTS public.jusspay_live_order_receipt_state (
  order_id text PRIMARY KEY CHECK (order_id ~ '^jbho_[0-9a-f-]{36}$'),
  payment_intent_id text NOT NULL UNIQUE CHECK (payment_intent_id ~ '^pi_[A-Za-z0-9_]{1,180}$'),
  paid_seen boolean NOT NULL DEFAULT false,
  hold_reason text CHECK (hold_reason IN ('partially_refunded','refunded','disputed')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.jusspay_live_receipt_events (
  event_id text PRIMARY KEY CHECK (event_id ~ '^evt_[A-Za-z0-9_]{1,180}$'),
  order_id text NOT NULL REFERENCES public.jusspay_live_order_receipt_state(order_id),
  payment_intent_id text NOT NULL,
  event_state text NOT NULL CHECK (event_state IN ('awaiting_owner_dispatch','partially_refunded','refunded','disputed')),
  receipt_sha256 text NOT NULL CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jusspay_live_receipt_events_order_idx ON public.jusspay_live_receipt_events(order_id);
CREATE OR REPLACE FUNCTION public.record_jusspay_live_receipt(
  p_order text, p_event text, p_pi text, p_state text, p_digest text
) RETURNS TABLE(receipt_state text, duplicate boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  bound_pi text;
  existing public.jusspay_live_receipt_events%ROWTYPE;
  inserted_count integer;
  current_hold text;
BEGIN
  -- Order-level lock and unique PI prevent cross-order rebinding, including
  -- concurrent paid and refund events. A conflict aborts the entire statement.
  INSERT INTO public.jusspay_live_order_receipt_state(order_id,payment_intent_id)
  VALUES(p_order,p_pi) ON CONFLICT(order_id) DO NOTHING;
  SELECT s.payment_intent_id INTO bound_pi FROM public.jusspay_live_order_receipt_state s
  WHERE s.order_id=p_order FOR UPDATE;
  IF bound_pi IS DISTINCT FROM p_pi THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='receipt_conflict';
  END IF;
  INSERT INTO public.jusspay_live_receipt_events(event_id,order_id,payment_intent_id,event_state,receipt_sha256)
  VALUES(p_event,p_order,p_pi,p_state,p_digest) ON CONFLICT(event_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count=0 THEN
    SELECT * INTO existing FROM public.jusspay_live_receipt_events e WHERE e.event_id=p_event;
    IF existing.order_id IS DISTINCT FROM p_order OR existing.payment_intent_id IS DISTINCT FROM p_pi
       OR existing.event_state IS DISTINCT FROM p_state OR existing.receipt_sha256 IS DISTINCT FROM p_digest THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='receipt_conflict';
    END IF;
  ELSE
    UPDATE public.jusspay_live_order_receipt_state s SET
      paid_seen=s.paid_seen OR p_state='awaiting_owner_dispatch',
      hold_reason=CASE
        WHEN s.hold_reason='disputed' OR p_state='disputed' THEN 'disputed'
        WHEN s.hold_reason='refunded' OR p_state='refunded' THEN 'refunded'
        WHEN s.hold_reason='partially_refunded' OR p_state='partially_refunded' THEN 'partially_refunded'
        ELSE NULL END,
      updated_at=now()
    WHERE s.order_id=p_order;
  END IF;
  SELECT s.hold_reason INTO current_hold FROM public.jusspay_live_order_receipt_state s WHERE s.order_id=p_order;
  RETURN QUERY SELECT CASE WHEN current_hold IS NOT NULL THEN 'hold' ELSE 'awaiting_owner_review' END, inserted_count=0;
END;
$$;
REVOKE ALL ON FUNCTION public.record_jusspay_live_receipt(text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON public.jusspay_live_order_receipt_state, public.jusspay_live_receipt_events FROM PUBLIC;
COMMIT;
