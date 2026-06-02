/**
 * Shared SQL fragments for tenant-scoped conversation visibility.
 * A clinic sees conversations it owns OR conversations routed to it via Hub.
 */

export function conversationVisibleToClinicSql(clinicParamRef: string): string {
  return `(
  c.clinic_id = ${clinicParamRef}
  OR (
    (c.routing->>'selected_clinic_id') ~ '^[0-9]+$'
    AND (c.routing->>'selected_clinic_id')::bigint = ${clinicParamRef}
  )
)`;
}

export const ROUTED_CLINIC_ID_SELECT_SQL = `CASE
  WHEN (c.routing->>'selected_clinic_id') ~ '^[0-9]+$'
  THEN (c.routing->>'selected_clinic_id')::bigint
  ELSE NULL
END AS routed_clinic_id`;
