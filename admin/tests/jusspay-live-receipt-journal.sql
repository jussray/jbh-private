-- Disposable database only. Exercises the real transactional migration.
BEGIN;
CREATE ROLE receipt_fixture_denied NOLOGIN;
CREATE ROLE receipt_fixture_worker NOLOGIN;
DO $
BEGIN
  IF has_function_privilege('receipt_fixture_denied','public.record_jusspay_live_receipt(text,text,text,text,text)','EXECUTE')
     OR has_table_privilege('receipt_fixture_denied','public.jusspay_live_receipt_events','SELECT')
     OR has_table_privilege('receipt_fixture_denied','public.jusspay_live_order_receipt_state','INSERT') THEN
    RAISE EXCEPTION 'ungranted role can access receipt journal';
  END IF;
END $;
GRANT USAGE ON SCHEMA public TO receipt_fixture_worker;
GRANT SELECT, INSERT, UPDATE ON public.jusspay_live_order_receipt_state TO receipt_fixture_worker;
GRANT SELECT, INSERT ON public.jusspay_live_receipt_events TO receipt_fixture_worker;
GRANT EXECUTE ON FUNCTION public.record_jusspay_live_receipt(text,text,text,text,text) TO receipt_fixture_worker;
SET LOCAL ROLE receipt_fixture_worker;
DO $
BEGIN
  IF NOT (has_table_privilege(current_user,'public.jusspay_live_order_receipt_state','SELECT')
    AND has_table_privilege(current_user,'public.jusspay_live_order_receipt_state','INSERT')
    AND has_table_privilege(current_user,'public.jusspay_live_order_receipt_state','UPDATE')
    AND has_table_privilege(current_user,'public.jusspay_live_receipt_events','SELECT')
    AND has_table_privilege(current_user,'public.jusspay_live_receipt_events','INSERT')
    AND has_function_privilege(current_user,'public.record_jusspay_live_receipt(text,text,text,text,text)','EXECUTE'))
    OR has_table_privilege(current_user,'public.jusspay_live_receipt_events','UPDATE')
    OR has_table_privilege(current_user,'public.jusspay_live_receipt_events','DELETE')
    OR has_table_privilege(current_user,'public.jusspay_live_order_receipt_state','DELETE') THEN
    RAISE EXCEPTION 'receipt worker privilege mismatch';
  END IF;
END $;
DO $
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
  PERFORM public.record_jusspay_live_receipt(o1,'evt_partial_first','pi_one','partially_refunded',d);
  PERFORM public.record_jusspay_live_receipt(o1,'evt_full_after_partial','pi_one','refunded',d);
  IF NOT EXISTS (SELECT 1 FROM public.jusspay_live_order_receipt_state WHERE order_id=o1 AND hold_reason='refunded') THEN RAISE EXCEPTION 'partial to full escalation failed'; END IF;
  PERFORM public.record_jusspay_live_receipt(o2,'evt_dispute','pi_two','disputed',d);
  PERFORM public.record_jusspay_live_receipt(o2,'evt_partial','pi_two','partially_refunded',d);
  IF NOT EXISTS (SELECT 1 FROM public.jusspay_live_order_receipt_state WHERE order_id=o2 AND paid_seen AND hold_reason='disputed') THEN RAISE EXCEPTION 'hold precedence failed'; END IF;
END $$;
ROLLBACK;
