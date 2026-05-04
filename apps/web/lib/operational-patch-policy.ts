/**
 * سياسة patch التشغيلية: عند التفعيل، أي تعديل على الموعد يجب أن يمر بمصدر معروف
 * (انتقال رسمي، مزامنة، walk-in، تهيئة، أو سطح واجهة مؤقت أثناء الهجرة).
 */

export const enforceTransitionsOnly = true;

export const TRANSITION_SAFE_PATCH_SOURCES = new Set([
  "sync",
  "walk_in",
  "system_init",
  "transition",
  /** حتى تُستبدل كل النقرات بـ transitionOperational */
  "ui_surface",
]);

export function assertPatchSourceAllowed(source: string | undefined): void {
  if (!enforceTransitionsOnly) return;
  const s = source ?? "__missing__";
  if (!TRANSITION_SAFE_PATCH_SOURCES.has(s)) {
    throw new Error(`[ILLEGAL_PATCH] source=${s}`);
  }
}
