"use client";

import { useEffect, useState } from "react";

type RevenueSummary = {
  active_clinics?: number;
  trial_clinics?: number;
  locked_clinics?: number;
};

export default function AdminSuperPanelPage() {
  const [revenue, setRevenue] = useState<RevenueSummary>({});
  const [health, setHealth] = useState<Record<string, unknown>>({});
  const [supportTickets, setSupportTickets] = useState<number>(0);
  const [jobsDead, setJobsDead] = useState<number>(0);
  const [simStatus, setSimStatus] = useState<string>("n/a");

  useEffect(() => {
    const load = async () => {
      const [rev, sys, tickets] = await Promise.all([
        fetch("/api/ops/billing/admin/revenue").then((r) => r.json()).catch(() => ({})),
        fetch("/api/ops/system/health").then((r) => r.json()).catch(() => ({})),
        fetch("/api/ops/support/tickets").then((r) => r.json()).catch(() => ({})),
      ]);
      setRevenue((rev as { summary?: RevenueSummary }).summary ?? {});
      setHealth((sys as { health?: Record<string, unknown> }).health ?? {});
      setSupportTickets(((tickets as { tickets?: unknown[] }).tickets ?? []).length);
      const [dead, sim] = await Promise.all([
        fetch("/api/ops/system/jobs/dead").then((r) => r.json()).catch(() => ({})),
        fetch("/api/ops/system/simulation/runs?limit=1").then((r) => r.json()).catch(() => ({})),
      ]);
      setJobsDead(((dead as { jobs?: unknown[] }).jobs ?? []).length);
      setSimStatus(((sim as { runs?: Array<{ status?: string }> }).runs ?? [])[0]?.status || "n/a");
    };
    void load();
  }, []);

  return (
    <div className="flex flex-col gap-cg-5">
      <header>
        <p className="text-ds-body text-muted-foreground">Global SaaS Control</p>
        <h1 className="text-ds-h1 font-semibold tracking-tight">Admin Super Panel</h1>
      </header>
      <div className="grid gap-cg-4 md:grid-cols-2 xl:grid-cols-4">
        <section className="rounded-xl border p-cg-4">
          <h2 className="mb-cg-2 text-ds-body text-muted-foreground">Clinics (Active)</h2>
          <p className="text-ds-h1 font-semibold">{Number(revenue.active_clinics || 0)}</p>
        </section>
        <section className="rounded-xl border p-cg-4">
          <h2 className="mb-cg-2 text-ds-body text-muted-foreground">Trials</h2>
          <p className="text-ds-h1 font-semibold">{Number(revenue.trial_clinics || 0)}</p>
        </section>
        <section className="rounded-xl border p-cg-4">
          <h2 className="mb-cg-2 text-ds-body text-muted-foreground">Locked Clinics</h2>
          <p className="text-ds-h1 font-semibold">{Number(revenue.locked_clinics || 0)}</p>
        </section>
        <section className="rounded-xl border p-cg-4">
          <h2 className="mb-cg-2 text-ds-body text-muted-foreground">Open Support Tickets</h2>
          <p className="text-ds-h1 font-semibold">{supportTickets}</p>
        </section>
        <section className="rounded-xl border p-cg-4">
          <h2 className="mb-cg-2 text-ds-body text-muted-foreground">Dead Jobs</h2>
          <p className="text-ds-h1 font-semibold">{jobsDead}</p>
        </section>
        <section className="rounded-xl border p-cg-4">
          <h2 className="mb-cg-2 text-ds-body text-muted-foreground">Last Simulation</h2>
          <p className="text-ds-h1 font-semibold">{simStatus}</p>
        </section>
      </div>
      <section className="rounded-xl border p-cg-4">
        <h2 className="mb-cg-2 font-medium">Health Overview</h2>
        <pre className="overflow-auto text-ds-small text-muted-foreground">{JSON.stringify(health, null, 2)}</pre>
      </section>
    </div>
  );
}
