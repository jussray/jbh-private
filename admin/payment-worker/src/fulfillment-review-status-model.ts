// Status only: no payment proof, supplier evidence or order authority is conferred.
export function reviewStorageStatus(row: unknown) {
  const r = row && typeof row === 'object' ? row as Record<string, unknown> : {};
  const storageReady = r.db === 'jbh' && r.role === 'jbh_runtime' && r.ledger === true &&
    r.can_select === true && r.can_insert === true && r.can_update === false &&
    r.can_delete === false && r.can_create === false && r.superuser === false &&
    r.create_role === false && r.create_db === false && r.bypass_rls === false &&
    r.orders_read === false && r.dispatch_read === false;
  return {mode:'review-storage-only', storageReady, providerVerified:false,
    chargesCollected:false, orderDispatched:false};
}
