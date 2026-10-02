-- Supersede the historical BRAZ-SEW-only supplier hint with the current
-- Dropship Beauty SKU families verified directly at Shopify location
-- gid://shopify/Location/94408442099 on 2026-09-25.
--
-- This remains a NON-AUTHORIZING hint only. It does not activate a vendor,
-- create vendor_product_mappings, enable DSers, queue dispatch, or place orders.

CREATE OR REPLACE FUNCTION hint_shopify_supplier_lane()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.supplier_code IS NULL
     AND jsonb_typeof(NEW.items_json) = 'array'
     AND jsonb_array_length(NEW.items_json) > 0
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(NEW.items_json) AS item(value)
       WHERE COALESCE(item.value ->> 'sku', '') !~
         '^(BRAZ-SEW-(BW|DW|LW|ST|KS|KC|AK|SW)-|BRAZ-TRANS-(CLO-(DW|ST|LW|BW)|FRO-(ST|LW))-|613-BRAZ-SEW-BW-)'
     ) THEN
    NEW.supplier_code := 'dropship-beauty';
  END IF;

  RETURN NEW;
END;
$$;

UPDATE shopify_physical_orders
SET supplier_code = 'dropship-beauty',
    updated_at = NOW()
WHERE supplier_code IS NULL
  AND procurement_status = 'procurement_needed'
  AND jsonb_typeof(items_json) = 'array'
  AND jsonb_array_length(items_json) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(items_json) AS item(value)
    WHERE COALESCE(item.value ->> 'sku', '') !~
      '^(BRAZ-SEW-(BW|DW|LW|ST|KS|KC|AK|SW)-|BRAZ-TRANS-(CLO-(DW|ST|LW|BW)|FRO-(ST|LW))-|613-BRAZ-SEW-BW-)'
  );

UPDATE vendor_connection_states
SET evidence_json = evidence_json || jsonb_build_array(
      '2026-09-25 Shopify readback: Dropship Beauty location gid://shopify/Location/94408442099 owns tracked active BRAZ-SEW, BRAZ-TRANS, and 613-BRAZ-SEW-BW variants; DSers location has no inventory levels'
    ),
    updated_at = NOW()
WHERE code = 'dropship-beauty';

-- Stop condition intentionally preserved:
-- dispatch_authority remains FALSE; exact routing still requires a proven
-- vendor_product_mapping and the existing fail-closed routing gate.
