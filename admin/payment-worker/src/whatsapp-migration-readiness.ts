// Read-only Postgres catalog evidence. Table presence alone is never migration proof.
const TABLE_FIELDS = [
  ['quotes','quotes'], ['purchaseOrderDrafts','purchase_order_drafts'],
  ['contacts','contacts'], ['inbox','inbox'], ['outbox','outbox'],
  ['deliveryReceipts','delivery_receipts'], ['reviewActions','review_actions'],
] as const;
const GUARD_FIELDS = [
  ['supplierDispatchGuard','supplier_dispatch_guard'],
  ['paidOrderTrigger','paid_order_trigger'],
  ['purchaseOrderOwnerGuard','purchase_order_owner_guard'],
  ['consentEvidenceGuard','consent_evidence_guard'],
  ['consentDefaultOff','consent_default_off'],
  ['purchaseOrderDedupeGuard','purchase_order_dedupe_guard'],
  ['receiptIdempotenceGuard','receipt_idempotence_guard'],
  ['reviewForeignKeyGuard','review_foreign_key_guard'],
] as const;
export function assessWhatsAppMigrationStructure(row: unknown) {
  const facts: Record<string, unknown> = row && typeof row === 'object' && !Array.isArray(row) ? row as Record<string, unknown> : {};
  const migrationTables = Object.fromEntries(TABLE_FIELDS.map(([key,field])=>[key,facts[field]===true]));
  const migrationGuards = Object.fromEntries(GUARD_FIELDS.map(([key,field])=>[key,facts[field]===true]));
  return {
    migrationTables, migrationGuards,
    migrationStructureVerified:Object.values(migrationTables).every(Boolean) && Object.values(migrationGuards).every(Boolean),
    // Catalog structure does not prove the migration ran successfully, was load-tested or deployed.
    migrationsVerified:false,
    evidenceLevel:'database_catalog_structure_only' as const,
  };
}
