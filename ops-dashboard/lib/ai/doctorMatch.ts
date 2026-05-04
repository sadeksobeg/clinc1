import type { Pool } from "pg";

/** Map Arabic / colloquial fragments to DB specialty substring (ILIKE). */
export function specialtySearchTokenFromText(
  bookingText: string,
  doctorHint: string | null | undefined,
  interpretSpecialty: string | null | undefined,
): string | null {
  const slug = (interpretSpecialty || "").trim().toLowerCase();
  if (slug.length >= 2) return slug;
  const t = `${bookingText} ${doctorHint || ""}`.toLowerCase();
  if (t.includes("عيون") || t.includes("ophthalm")) return "ophthalm";
  if (t.includes("اسنان") || t.includes("أسنان") || t.includes("dent") || t.includes("dental")) return "dent";
  if (t.includes("جلد") || t.includes("dermat")) return "dermat";
  if (t.includes("اطفال") || t.includes("أطفال") || t.includes("pediat")) return "pediat";
  if (t.includes("نساء") || t.includes("نسائي") || t.includes("gynec")) return "gynec";
  if (t.includes("انف") || t.includes("حنجرة") || t.includes(" ent")) return "ent";
  return null;
}

/**
 * Single active doctor in clinic matching specialty column or display name (ILIKE).
 */
export async function findDoctorIdBySpecialtyOrNameToken(
  pool: Pool,
  clinicId: number,
  token: string,
): Promise<number | null> {
  const tok = token.trim().toLowerCase();
  if (tok.length < 2) return null;
  const like = `%${tok.replace(/%/g, "")}%`;
  const r = await pool.query<{ id: number }>(
    `SELECT id FROM doctors
     WHERE clinic_id = $1 AND deleted_at IS NULL AND is_active = TRUE
       AND (lower(specialty) LIKE $2 OR lower(display_name) LIKE $2)
     ORDER BY id ASC
     LIMIT 1`,
    [clinicId, like],
  );
  const id = r.rows[0]?.id;
  return id != null ? Number(id) : null;
}
