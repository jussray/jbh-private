-- Disposable database only. Exercises the real transactional migration.
BEGIN;
DO $$
DECLARE
  r record;
  o1 text := 'jbho_11111111-1111-4111-8111-111111111111';
  o2 text := 'jbho_22222222-2222-4222-8222-222222222222';
  o3 text := 'jbho_33333333-3333-4333-8333-333333333333';
  d text := repeat('a',64);
BEGIN
  SELECT * INTO r FROM public.record_jusspay_live_receipt(o1,'evt_paid','pi_one','awaiting_owner_dispatch',d);
  IF r.receipt_state <> 'awaiting_owner_review' OR r.duplicate IS DISTINCT FROM false THEN RAISE EXCEPTION 'initial paid receipt'; END IF;
  SELECT * INTO r FROM public.record_jusspay_live_receipt(o1,'evt_paid','pi_one','awaiting_owner_dispatch',d);
  IF r.receipt_state <> 'awaiting_owner_review' OR r.duplicate IS DISTINCT FROM true THEN RAISE EXCEPTION 'duplicate receipt'; END IF;
  BEGIN
    PERFORM public.record_jusspay_live_receipt(o1,'evt_paid','pi_one','awaiting_owner_dispatch',repeat('b',64));
    RAISE EXCEPTION 'changed immutable receipt accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.record_jusspay_live_receipt(o1,'evt_wrong_pi','pi_other','refunded',d);
    RAISE EXCEPTION 'order rebound to other intent';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.record_jusspay_live_receipt(o3,'evt_paid','pi_three','awaiting_owner_dispatch',d);
    RAISE EXCEPTION 'event rebound to other order';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.jusspay_live_order_receipt_state WHERE order_id=o3) THEN RAISE EXCEPTION 'partial state persisted'; END IF;
  BEGIN
    PERFORM public.record_jusspay_live_receipt(o3,'evt_other','pi_one','awaiting_owner_dispatch',d);
    RAISE EXCEPTION 'intent rebound to other order';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  SELECT * INTO r FROM public.record_jusspay_live_receipt(o2,'evt_refund_first','pi_two','refunded',d);
  IF r.receipt_state <> 'hold' THEN RAISE EXCEPTION 'refund hold not recorded'; END IF;
  SELECT * INTO r FROM public.record_jusspay_live_receipt(o2,'evt_late_paid','pi_two','awaiting_owner_dispatch',d);
  IF r.receipt_state <> 'hold' THEN RAISE EXCEPTION 'late payment reopened hold'; END IF;
  PERFORM public.record_jusspay_live_receipt(o2,'evt_dispute','pi_two','disputed',d);
  PERFORM public.record_jusspay_live_receipt(o2,'evt_partial','pi_two','partially_refunded',d);
  IF NOT EXISTS (SELECT 1 FROM public.jusspay_live_order_receipt_state WHERE order_id=o2 AND paid_seen AND hold_reason='disputed') THEN RAISE EXCEPTION 'hold precedence failed'; END IF;
END $$;
ROLLBACK;
