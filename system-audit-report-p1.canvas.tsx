import { Callout, Card, CardBody, CardHeader, Divider, Grid, H1, H2, H3, Pill, Row, Stack, Stat, Table, Text } from "cursor/canvas";

export default function SystemAuditReportP1() {
  return (
    <Stack gap={20}>
      <H1>System Audit Report (Post P1)</H1>
      <Text tone="secondary">
        Scope: Full readiness audit after P1 Billing & Growth implementation across architecture, user journeys, billing, admin/ops,
        support, security, and launch blockers.
      </Text>

      <Grid columns={3} gap={12}>
        <Stat label="Product Completeness" value="78%" tone="warning" />
        <Stat label="Technical Readiness" value="74%" tone="warning" />
        <Stat label="Launch Readiness" value="68%" tone="warning" />
      </Grid>

      <Callout tone="warning" title="Executive Summary">
        Platform has moved to a strong Revenue-Safe baseline (P0 + major P1 foundations), but still has launch-critical gaps in
        web auth/authorization and support operations before global-grade production rollout.
      </Callout>

      <Divider />

      <H2>Part 1: Architecture Overview</H2>
      <H3>Frontend Apps</H3>
      <Table
        headers={["Surface", "Current State", "Key Paths"]}
        rows={[
          [
            "apps/web",
            "Next.js App Router with public and app shells; no route middleware guard",
            "app/(public), app/(app), app/api/ops/*, lib/ops-server.ts",
          ],
          [
            "ops-dashboard",
            "Next.js App Router with auth + billing lock middleware and internal API backbone",
            "app/(main), app/api/internal/*, middleware.ts, lib/session.ts",
          ],
          [
            "frontend/ClinicSaaS.Web",
            "Angular app still present with route guards and service-based state",
            "src/app/app.routes.ts, core/auth.guard.ts",
          ],
        ]}
      />

      <H3>Backend / Ops Dashboard</H3>
      <Text>
        Internal API domains are grouped and active: conversations, scheduling, billing, decision/AI, analytics, audit, metrics, and
        system health. Core orchestration is centered around inbound processing in <Text weight="semibold">processInbound</Text> and
        related lock/queue/outbox infrastructure.
      </Text>
      <Row gap={8}>
        <Pill tone="info">Billing</Pill>
        <Pill tone="info">Analytics</Pill>
        <Pill tone="info">Scheduling/AI</Pill>
        <Pill tone="info">Audit/Metrics</Pill>
      </Row>

      <H3>Database Domains</H3>
      <Table
        headers={["Domain", "Representative Tables"]}
        rows={[
          ["Auth", "staff_users, password_reset_tokens"],
          ["Clinics", "clinics, clinic_saas_tenant_links, clinic_public_hours"],
          ["Billing", "clinic_local_subscriptions, clinic_payment_requests, billing_invoices, billing_receipts, billing_processed_events"],
          ["Analytics", "trial_funnel_events, ai_interaction_logs"],
          ["Scheduling", "doctors, appointments, doctor_working_hours, doctor_leaves, notification_outbox"],
          ["Support/Ops", "alerts, cases, audit_logs, domain_events, processed_events, dead_letter_events, core_outbox"],
        ]}
      />

      <Divider />

      <H2>Part 2: User Journey Coverage</H2>
      <Table
        headers={["Journey", "Coverage", "Notes"]}
        rows={[
          ["Signup/Trial creation", "Strong", "Multi-step trial wizard, backend clinic/admin/subscription provisioning exists"],
          ["Onboarding post-signup", "Partial", "Welcome flow exists, but onboarding not hard-blocked on all deep links"],
          ["In-app clinic operations", "Partial", "Inbox and billing flows are functional; some web paths still default to clinic_id=1"],
          ["End of trial lock + redirect", "Mixed", "Lock logic exists; billing access behavior has routing inconsistency for proactive renewal"],
        ]}
        rowTone={[undefined, "warning", "warning", "warning"]}
      />

      <Divider />

      <H2>Part 3: Billing System Audit</H2>
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader title="Implemented" />
          <CardBody>
            <Stack gap={6}>
              <Text>Subscription states including trial_expiring</Text>
              <Text>Payment requests with idempotency keys</Text>
              <Text>Webhook signature check + replay dedupe table</Text>
              <Text>Invoice issuance and receipt creation on approval</Text>
              <Text>Reminder scheduler with run history</Text>
              <Text>Trial-to-paid event path in analytics</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Remaining Risks" />
          <CardBody>
            <Stack gap={6}>
              <Text>Non-atomic business+audit behavior can produce ambiguous retries</Text>
              <Text>Reminder dedupe/backoff is not finance-grade yet</Text>
              <Text>Trial-to-paid event semantics can overcount renewals</Text>
              <Text>Invoice lifecycle beyond issued/paid is still limited</Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>
      <Callout tone="warning" title="Billing Readiness Verdict">
        Ready for controlled pilot and low-volume manual operations; needs hardening for high-volume or strict-finance production.
      </Callout>

      <Divider />

      <H2>Part 4: Admin & Ops Capabilities</H2>
      <Table
        headers={["Capability", "Status", "Current Ability"]}
        rows={[
          ["Admin billing dashboard", "Available", "Requests, approvals/rejections, revenue summary, reminder runs, reconciliation view"],
          ["Clinic-wide ops monitoring", "Partial", "Deep health and product metrics exist; central SLA board is missing"],
          ["Invoice/receipt visibility", "Available", "Tenant/admin APIs + UI exposure exists"],
          ["Analytics funnel visibility", "Available", "Snapshot with attribution and trial-to-paid metric exists"],
          ["Global operational command center", "Partial", "Good module coverage, but cross-surface governance remains fragmented"],
        ]}
        rowTone={[undefined, "warning", undefined, undefined, "warning"]}
      />

      <Divider />

      <H2>Part 5: Support & Operations</H2>
      <Callout tone="warning" title="Critical Gap">
        Dedicated support system is not complete as a first-class product surface. Case/alert primitives exist, but full ticket lifecycle,
        SLA ownership, escalation workflow, and support role cockpit are missing.
      </Callout>

      <Divider />

      <H2>Part 6: Security & Reliability</H2>
      <Table
        headers={["Area", "Assessment", "Why"]}
        rows={[
          ["Authentication", "Mixed", "ops-dashboard is guarded; apps/web login is demo-only and not a real auth boundary"],
          ["Authorization", "Weak on web", "many apps/web /api/ops routes proxy privileged ops actions without user auth checks"],
          ["API protection", "Strong internal / weaker edge", "internal token checks are present, but token scope is broad"],
          ["Webhook security", "Good baseline", "HMAC + timestamp window + dedupe table are implemented"],
          ["Rate limiting", "Partial", "in-memory limiter only (not distributed)"],
          ["Audit logs", "Partial", "present in key flows but not yet universal/immutable stream grade"],
          ["Reliability controls", "Strong", "locks, deferred queues, outbox, dedupe, deep health checks are substantial"],
        ]}
        rowTone={["warning", "danger", "warning", undefined, "warning", "warning", undefined]}
      />

      <Divider />

      <H2>Part 7: Missing Production Blockers</H2>
      <H3>Production Blockers</H3>
      <Table
        headers={["Blocker", "Impact"]}
        rows={[
          ["No real auth/authorization gate in apps/web", "Potential unauthorized access to operational surfaces"],
          ["Unprotected proxy routes under apps/web /api/ops/*", "Privileged operations can be exposed unintentionally"],
          ["Single broad service token model", "High blast radius if leaked"],
          ["Tenant safety issues via clinic_id defaults", "Cross-tenant data/action risk in multi-clinic production"],
        ]}
        rowTone={["danger", "danger", "danger", "danger"]}
      />

      <H3>Major Missing Systems</H3>
      <Table
        headers={["System", "Current Gap"]}
        rows={[
          ["Support Desk", "No full ticket workflow with SLA/escalation ownership"],
          ["Session Security", "No robust global revocation/token-version model"],
          ["Centralized Observability", "Mostly in-process counters and endpoint probes"],
          ["Fine-grained Permissions", "Coarse role model, no policy matrix engine"],
        ]}
      />

      <H3>Nice-to-Have Later</H3>
      <Text tone="secondary">
        Scoped token rotation, MFA for privileged roles, anomaly detection on auth, SIEM export pipeline, and advanced cohort experimentation UI.
      </Text>

      <Divider />

      <H2>Part 8: Final Score</H2>
      <Grid columns={3} gap={12}>
        <Stat label="Product Completeness" value="78%" tone="warning" />
        <Stat label="Technical Readiness" value="74%" tone="warning" />
        <Stat label="Launch Readiness" value="68%" tone="warning" />
      </Grid>
      <Text>
        Final judgment: the system is significantly mature and commercially meaningful, but not yet SaaS world-class launch-ready until
        web auth boundary, API authorization, and support/ops command capabilities are closed.
      </Text>
    </Stack>
  );
}
