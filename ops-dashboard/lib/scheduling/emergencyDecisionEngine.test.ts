import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { runEmergencyDecisionEngine } from "./emergencyDecisionEngine";

vi.mock("./slotService", () => ({
  findNextSlots: vi.fn(),
}));

vi.mock("./appointmentService", () => ({
  confirmAppointment: vi.fn(),
  confirmAppointmentTx: vi.fn(),
}));

function buildPoolMock(queryImpl: Pool["query"], connectImpl?: Pool["connect"]): Pool {
  return {
    query: queryImpl,
    connect:
      connectImpl ||
      (async () =>
        ({
          query: queryImpl,
          release: () => undefined,
        }) as never),
  } as unknown as Pool;
}

describe("runEmergencyDecisionEngine", () => {
  it("allocates directly when same-day slot exists", async () => {
    const { findNextSlots } = await import("./slotService");
    const { confirmAppointment } = await import("./appointmentService");
    vi.mocked(findNextSlots).mockResolvedValue([
      {
        starts_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        ends_at: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
        doctor_id: 11,
        doctor_name: "Dr A",
      },
    ]);
    vi.mocked(confirmAppointment).mockResolvedValue({ ok: true, appointment_id: 501 });

    const pool = buildPoolMock(async () => ({ rows: [{ timezone: "Asia/Amman" }] }) as never);
    const out = await runEmergencyDecisionEngine(pool, {
      clinic_id: 1,
      patient_id: 2,
      conversation_id: 3,
    } as never);

    expect(out.ok).toBe(true);
    expect(out.ok && out.outcome).toBe("allocated_direct");
  });

  it("returns no_same_day_slot when no candidate exists", async () => {
    const { findNextSlots } = await import("./slotService");
    vi.mocked(findNextSlots).mockResolvedValue([]);
    const pool = buildPoolMock(async (q: string | { text?: string }) => {
      const sql = typeof q === "string" ? q : String(q.text ?? "");
      if (sql.includes("FROM clinics")) return { rows: [{ timezone: "Asia/Amman" }] } as never;
      if (sql.includes("FROM appointments a")) return { rows: [] } as never;
      return { rows: [] } as never;
    });
    const out = await runEmergencyDecisionEngine(pool, {
      clinic_id: 1,
      patient_id: 9,
      conversation_id: 4,
    } as never);
    expect(out.ok).toBe(false);
    expect(!out.ok && out.reason).toBe("no_same_day_slot");
  });

  it("allocates next-day when override is enabled and no same-day slot", async () => {
    const { findNextSlots } = await import("./slotService");
    const { confirmAppointment } = await import("./appointmentService");
    vi.mocked(findNextSlots).mockResolvedValue([
      {
        starts_at: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
        ends_at: new Date(Date.now() + 26 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
        doctor_id: 12,
        doctor_name: "Dr NextDay",
      },
    ]);
    vi.mocked(confirmAppointment).mockResolvedValue({ ok: true, appointment_id: 888 });
    const pool = buildPoolMock(async (q: string | { text?: string }) => {
      const sql = typeof q === "string" ? q : String(q.text ?? "");
      if (sql.includes("FROM clinics")) return { rows: [{ timezone: "Asia/Amman" }] } as never;
      if (sql.includes("FROM appointments a")) return { rows: [] } as never;
      return { rows: [] } as never;
    });
    const out = await runEmergencyDecisionEngine(
      pool,
      {
        clinic_id: 1,
        patient_id: 9,
        conversation_id: 4,
      } as never,
      { allowNextDayOverride: true },
    );
    expect(out.ok).toBe(true);
    expect(out.ok && out.outcome).toBe("allocated_next_day_override");
  });

  it("allocates with soft bump when direct slot missing", async () => {
    const { findNextSlots } = await import("./slotService");
    const { confirmAppointment, confirmAppointmentTx } = await import("./appointmentService");
    vi.mocked(confirmAppointment).mockResolvedValue({ ok: false, code: "overlap", error: "x" });
    vi.mocked(findNextSlots)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          starts_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          ends_at: new Date(Date.now() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
          doctor_id: 7,
          doctor_name: "Dr B",
        },
      ]);
    vi.mocked(confirmAppointmentTx).mockResolvedValue({ ok: true, appointment_id: 777 });

    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM clinics")) return { rows: [{ timezone: "Asia/Amman" }] } as never;
      if (sql.includes("FROM appointments a")) {
        return {
          rows: [
            {
              id: 99,
              doctor_id: 7,
              starts_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              ends_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
              conversation_id: 13,
              patient_id: 42,
              patient_chat_id: "9639xxxx",
              patient_name: "Ali",
            },
          ],
        } as never;
      }
      if (sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: 99,
              starts_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              ends_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
              doctor_id: 7,
            },
          ],
        } as never;
      }
      if (sql.includes("SELECT id") && sql.includes("tstzrange")) return { rows: [] } as never;
      return { rows: [] } as never;
    });
    const pool = buildPoolMock(query as never, async () => ({ query, release: () => undefined }) as never);

    const out = await runEmergencyDecisionEngine(pool, {
      clinic_id: 1,
      patient_id: 2,
      conversation_id: 3,
    } as never);
    expect(out.ok).toBe(true);
    expect(out.ok && out.outcome).toBe("allocated_with_soft_bump");
  });
});
