const baseWeb = "http://localhost:3000";
const baseOps = "http://localhost:3001";

const results = [];
const nowTag = Date.now();

function push(name, pass, details) {
  results.push({ name, pass, details });
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}: ${details}`);
}

async function request(url, init = {}) {
  return fetch(url, { redirect: "manual", ...init });
}

function extractCookie(setCookie) {
  if (!setCookie) return "";
  const first = setCookie.split(",")[0];
  return first.split(";")[0];
}

async function login() {
  const creds = [
    { email: "ops@local.test", password: "Admin12345!" },
    { email: "admin@example.com", password: "Admin12345!" },
  ];
  for (const c of creds) {
    const r = await request(`${baseWeb}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(c),
    });
    if (r.ok) {
      const cookie = extractCookie(r.headers.get("set-cookie"));
      if (cookie.includes("ops_session=")) return cookie;
    }
  }
  return "";
}

async function main() {
  const anon = await request(`${baseWeb}/dashboard`);
  const anonLoc = anon.headers.get("location") || "";
  push(
    "Auth boundary",
    [301, 302, 307, 308].includes(anon.status) && anonLoc.includes("/login"),
    `status=${anon.status}, location=${anonLoc || "-"}`,
  );

  const cookie = await login();
  if (!cookie) {
    push("Login for smoke tests", false, "could_not_login_with_known_credentials");
    console.log("\nSummary:\n" + JSON.stringify(results, null, 2));
    process.exit(1);
  } else {
    push("Login for smoke tests", true, "session_cookie_issued");
  }

  const meRes = await request(`${baseWeb}/api/auth/me`, { headers: { cookie } });
  const meJson = await meRes.json().catch(() => ({}));
  const clinicId = Number(meJson.clinic_id || 0);
  const userId = Number(meJson.user_id || 0);

  const spoof = await request(`${baseWeb}/api/ops/billing/local?clinic_id=999`, { headers: { cookie } });
  const spoofJson = await spoof.json().catch(() => ({}));
  const scopedClinic = Number(spoofJson?.snapshot?.clinic_id || 0);
  push(
    "Secure BFF tenant scope",
    spoof.ok && clinicId > 0 && scopedClinic === clinicId,
    `requested=999, resolved=${scopedClinic}, session_clinic=${clinicId}`,
  );

  const logoutAll = await request(`${baseOps}/api/account/security/logout-all`, {
    method: "POST",
    headers: { cookie },
  });
  const afterLogout = await request(`${baseOps}/inbox`, { headers: { cookie } });
  const afterLogoutLoc = afterLogout.headers.get("location") || "";
  push(
    "Logout-all revocation",
    logoutAll.ok && [301, 302, 307, 308].includes(afterLogout.status) && afterLogoutLoc.includes("/login"),
    `logout_status=${logoutAll.status}, inbox_after_logout=${afterLogout.status}`,
  );

  const cookie2 = await login();
  if (!cookie2) {
    push("Re-login after logout-all", false, "unable_to_relogin");
    console.log("\nSummary:\n" + JSON.stringify(results, null, 2));
    process.exit(1);
  }

  const subject = `Smoke ticket ${nowTag}`;
  const createTicket = await request(`${baseWeb}/api/ops/support/tickets`, {
    method: "POST",
    headers: { cookie: cookie2, "content-type": "application/json" },
    body: JSON.stringify({ subject, priority: "normal", message: "Initial smoke message" }),
  });
  const createTicketJson = await createTicket.json().catch(() => ({}));
  const ticketId = Number(createTicketJson?.ticket?.id || 0);

  const assign = await request(`${baseWeb}/api/ops/support/assign`, {
    method: "POST",
    headers: { cookie: cookie2, "content-type": "application/json" },
    body: JSON.stringify({ ticket_id: ticketId, assigned_to: userId }),
  });
  const escalate = await request(`${baseWeb}/api/ops/support/escalate`, {
    method: "POST",
    headers: { cookie: cookie2, "content-type": "application/json" },
    body: JSON.stringify({ ticket_id: ticketId, reason: "smoke escalation" }),
  });
  const resolve = await request(`${baseWeb}/api/ops/support/tickets`, {
    method: "PATCH",
    headers: { cookie: cookie2, "content-type": "application/json" },
    body: JSON.stringify({ ticket_id: ticketId, status: "resolved" }),
  });
  const listTickets = await request(`${baseWeb}/api/ops/support/tickets`, { headers: { cookie: cookie2 } });
  const listJson = await listTickets.json().catch(() => ({}));
  const final = (listJson?.tickets || []).find((t) => Number(t.id) === ticketId);
  push(
    "Support lifecycle",
    ticketId > 0 && createTicket.ok && assign.ok && escalate.ok && resolve.ok && final?.status === "resolved",
    `ticket=${ticketId || 0}, status=${final?.status || "missing"}`,
  );

  const createNotif = await request(`${baseWeb}/api/ops/notifications`, {
    method: "POST",
    headers: { cookie: cookie2, "content-type": "application/json" },
    body: JSON.stringify({
      type: "smoke_test",
      title: `Smoke ${nowTag}`,
      body: "Notification flow check",
    }),
  });
  const createNotifJson = await createNotif.json().catch(() => ({}));
  const notifId = Number(createNotifJson?.notification?.id || 0);
  const markRead = await request(`${baseWeb}/api/ops/notifications`, {
    method: "PATCH",
    headers: { cookie: cookie2, "content-type": "application/json" },
    body: JSON.stringify({ id: notifId }),
  });
  const listNotif = await request(`${baseWeb}/api/ops/notifications`, { headers: { cookie: cookie2 } });
  const listNotifJson = await listNotif.json().catch(() => ({}));
  const notif = (listNotifJson?.notifications || []).find((n) => Number(n.id) === notifId);
  push(
    "Notifications flow",
    createNotif.ok && notifId > 0 && markRead.ok && notif?.read === true,
    `notification=${notifId || 0}, read=${String(notif?.read)}`,
  );

  const fp = `fp-smoke-${nowTag}`;
  const vat = `VAT-${nowTag}`;
  const firstSignup = await request(`${baseWeb}/api/trial/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clinicName: `Smoke Clinic A ${nowTag}`,
      ownerName: "Smoke Owner A",
      whatsapp: `+9639900${String(nowTag).slice(-4)}`,
      city: "Damascus",
      specialty: "General",
      doctorsCount: 1,
      email: `smoke-a-${nowTag}@example.com`,
      password: "Admin12345!",
      confirmPassword: "Admin12345!",
      browserFingerprint: fp,
      vat,
    }),
  });
  const secondSignup = await request(`${baseWeb}/api/trial/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clinicName: `Smoke Clinic B ${nowTag}`,
      ownerName: "Smoke Owner B",
      whatsapp: `+9639911${String(nowTag).slice(-4)}`,
      city: "Damascus",
      specialty: "General",
      doctorsCount: 1,
      email: `smoke-b-${nowTag}@example.com`,
      password: "Admin12345!",
      confirmPassword: "Admin12345!",
      browserFingerprint: fp,
      vat,
    }),
  });
  const firstJson = await firstSignup.json().catch(() => ({}));
  const secondJson = await secondSignup.json().catch(() => ({}));
  const strictFlowPass = firstSignup.status === 201 && secondSignup.status === 409;
  const preblockedEnvPass =
    firstSignup.status === 409 &&
    secondSignup.status === 409 &&
    firstJson?.error === "trial_identity_blocked" &&
    secondJson?.error === "trial_identity_blocked";
  push(
    "Trial-abuse rejection",
    strictFlowPass || preblockedEnvPass,
    `first=${firstSignup.status}(${firstJson?.error || "-"}), second=${secondSignup.status}(${secondJson?.error || "-"})`,
  );

  console.log("\nSummary:\n" + JSON.stringify(results, null, 2));
  const failed = results.filter((x) => !x.pass);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
