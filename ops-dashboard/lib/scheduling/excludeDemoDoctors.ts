/** Exclude seed/demo doctors from patient-facing booking lists and slot search. */
export const EXCLUDE_DEMO_DOCTOR_SQL = `
  AND COALESCE(d.display_name, '') NOT ILIKE '%تجريبي%'
  AND COALESCE(d.display_name, '') NOT ILIKE '%demo%'
  AND COALESCE(d.display_name, '') NOT ILIKE 'Doctor %'
`;
