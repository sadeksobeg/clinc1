/**
 * P8.3 smoke:
 * - platform user login (platform scope) (super_admin / ops_admin / ops_manager when enabled)
 * - /platform landing works
 * - read clinics list
 * - set/clear acting clinic context
 * - verify protected module behavior with and without context
 * - platform pages: clinics/revenue/support/search
 */
const baseWeb = process.env.P8_BASE_WEB || "http://127.0.0.1:3000";
const email = process.env.P8_PLATFORM_EMAIL || process.env.P8_SUPER_ADMIN_EMAIL || "superadmin@local.test";
const password = process.env.P8_PLATFORM_PASSWORD || process.env.P8_SUPER_ADMIN_PASSWORD || "Admin12345!";
const otp = process.env.P8_PLATFORM_OTP || process.env.P8_SUPER_ADMIN_OTP || "";

function extractCookie(setCookie) {
  if (!setCookie) return "";
  const first = setCookie.split(",")[0];
  return first.split(";")[0];
}

async function request(url, init = {}) {
  return fetch(url, { redirect: "manual", ...init });
}

function assert(name, cond, detail) {
  if (!cond) throw new Error(`FAIL - ${name}: ${detail}`);
  console.log(`PASS - ${name}: ${detail}`);
}

async function main() {
  const loginRes = await request(`${baseWeb}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, otp_code: otp || undefined }),
  });
  const cookie = extractCookie(loginRes.headers.get("set-cookie"));
  assert("platform user login", loginRes.ok && cookie.includes("ops_session="), `status=${loginRes.status}`);

  const meRes = await request(`${baseWeb}/api/auth/me`, { headers: { cookie } });
  const me = await meRes.json().catch(() => ({}));
  assert("platform scope session", meRes.ok && me.scope === "platform", `scope=${me.scope} role=${me.role}`);

  const platformLanding = await request(`${baseWeb}/platform`, { headers: { cookie } });
  assert("platform landing", platformLanding.status === 200, `status=${platformLanding.status}`);

  const clinicsRes = await request(`${baseWeb}/api/platform/clinics`, { headers: { cookie } });
  const clinicsJson = await clinicsRes.json().catch(() => ({}));
  const clinics = Array.isArray(clinicsJson.clinics) ? clinicsJson.clinics : [];
  assert("platform clinics list", clinicsRes.ok && clinics.length > 0, `count=${clinics.length}`);

  const anyClinicId = Number(clinics[0]?.clinic_id || 0);
  assert("valid clinic id", anyClinicId > 0, `clinic_id=${anyClinicId}`);

  const clearCtx = await request(`${baseWeb}/api/platform/context`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ acting_clinic_id: null }),
  });
  assert("clear context", clearCtx.ok, `status=${clearCtx.status}`);

  const inboxNoContext = await request(`${baseWeb}/inbox`, { headers: { cookie } });
  assert("clinic route blocked without context", inboxNoContext.status === 307 || inboxNoContext.status === 308, `status=${inboxNoContext.status}`);

  const platformClinicsPage = await request(`${baseWeb}/platform/clinics`, { headers: { cookie } });
  assert("platform clinics page", platformClinicsPage.status === 200, `status=${platformClinicsPage.status}`);
  const platformRevenuePage = await request(`${baseWeb}/platform/revenue`, { headers: { cookie } });
  assert("platform revenue page", platformRevenuePage.status === 200, `status=${platformRevenuePage.status}`);
  const platformSupportPage = await request(`${baseWeb}/platform/support`, { headers: { cookie } });
  assert("platform support page", platformSupportPage.status === 200, `status=${platformSupportPage.status}`);
  const platformSearchPage = await request(`${baseWeb}/platform/search`, { headers: { cookie } });
  assert("platform search page", platformSearchPage.status === 200, `status=${platformSearchPage.status}`);

  const setCtx = await request(`${baseWeb}/api/platform/context`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ acting_clinic_id: anyClinicId }),
  });
  assert("set context", setCtx.ok, `status=${setCtx.status}`);

  const inboxWithContext = await request(`${baseWeb}/inbox`, { headers: { cookie } });
  assert("clinic route works with context", inboxWithContext.status === 200, `status=${inboxWithContext.status}`);

  console.log("\nP8 super admin smoke: all checks passed.");
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
