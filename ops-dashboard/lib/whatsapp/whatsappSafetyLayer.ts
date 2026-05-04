/**
 * P7 Day 1 — Balanced WhatsApp safety: per-clinic + global sliding windows,
 * human-like jitter before bridge calls, and circuit breaker → runtime whatsapp_send_disabled.
 */
import { getPool } from "@/lib/db";
import { insertAuditLog } from "@/lib/auditTrail";
import { writeStructuredLog } from "@/lib/observability/trace";
import { incProductMetric } from "@/lib/observability/productMetrics";
import { setRuntimeFlag, getRuntimeFlag } from "@/lib/system/emergencyMode";

const WINDOW_MS = Math.max(5_000, Number(process.env.WA_SAFETY_WINDOW_MS || 60_000));
const MAX_WAIT_MS = Math.max(500, Number(process.env.WA_SAFETY_MAX_WAIT_MS || 12_000));

/** Max sends per clinic per window (patient-facing paths only). */
const CLINIC_MAX_PER_WINDOW = Math.max(1, Number(process.env.WA_SAFETY_CLINIC_MAX_PER_WINDOW || 45));
/** Max patient-class sends globally per window. */
const GLOBAL_PATIENT_MAX = Math.max(1, Number(process.env.WA_SAFETY_GLOBAL_PATIENT_MAX || 120));
/** Max staff_alert sends per window (global only). */
const GLOBAL_STAFF_MAX = Math.max(1, Number(process.env.WA_SAFETY_GLOBAL_STAFF_MAX || 300));

const JITTER_MIN_MS = Math.max(0, Number(process.env.WA_SAFETY_JITTER_MS_MIN || 120));
const JITTER_MAX_MS = Math.max(JITTER_MIN_MS, Number(process.env.WA_SAFETY_JITTER_MS_MAX || 780));

const CIRCUIT_WINDOW_MS = Math.max(30_000, Number(process.env.WA_SAFETY_CIRCUIT_WINDOW_MS || 180_000));
const CIRCUIT_FAILURE_THRESHOLD = Math.max(2, Number(process.env.WA_SAFETY_CIRCUIT_FAILURE_THRESHOLD || 10));

const buckets = new Map<string, number[]>();
const failureStamps: number[] = [];
let lastTripLogAt = 0;

function prune(ts: number[], now: number): void {
  const cutoff = now - WINDOW_MS;
  while (ts.length > 0 && ts[0]! < cutoff) ts.shift();
}

function pruneFailures(now: number): void {
  const cutoff = now - CIRCUIT_WINDOW_MS;
  while (failureStamps.length > 0 && failureStamps[0]! < cutoff) failureStamps.shift();
}

function jitterMs(): number {
  if (JITTER_MAX_MS <= 0) return 0;
  return JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1));
}

async function acquireWindowSlot(key: string, maxPerWindow: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    const now = Date.now();
    let stamps = buckets.get(key);
    if (!stamps) {
      stamps = [];
      buckets.set(key, stamps);
    }
    prune(stamps, now);
    if (stamps.length < maxPerWindow) {
      stamps.push(now);
      return;
    }
    const oldest = stamps[0]!;
    const waitMs = Math.max(1, oldest + WINDOW_MS - now);
    if (Date.now() - start + waitMs > MAX_WAIT_MS) {
      incProductMetric("whatsapp_safety_rate_wait_exceeded_total");
      throw new Error("wa_safety_rate_limited");
    }
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 500)));
  }
}

export type WhatsAppSafetySnapshot = {
  window_ms: number;
  global_patient_stamps: number;
  global_staff_stamps: number;
  circuit_failures_in_window: number;
  circuit_window_ms: number;
  circuit_threshold: number;
  clinic_samples: Array<{ clinic_id: number; stamps: number }>;
};

export function getWhatsAppSafetySnapshot(): WhatsAppSafetySnapshot {
  const now = Date.now();
  const gPat = buckets.get("__global_patient__") ?? [];
  const gStaff = buckets.get("__global_staff__") ?? [];
  prune(gPat, now);
  prune(gStaff, now);
  pruneFailures(now);
  const clinicSamples: Array<{ clinic_id: number; stamps: number }> = [];
  for (const [k, stamps] of buckets.entries()) {
    if (!k.startsWith("clinic:")) continue;
    const id = Number(k.slice("clinic:".length));
    if (!Number.isFinite(id)) continue;
    prune(stamps, now);
    clinicSamples.push({ clinic_id: id, stamps: stamps.length });
    if (clinicSamples.length >= 20) break;
  }
  return {
    window_ms: WINDOW_MS,
    global_patient_stamps: gPat.length,
    global_staff_stamps: gStaff.length,
    circuit_failures_in_window: failureStamps.length,
    circuit_window_ms: CIRCUIT_WINDOW_MS,
    circuit_threshold: CIRCUIT_FAILURE_THRESHOLD,
    clinic_samples: clinicSamples,
  };
}

function isPatientClass(policyKind: string): boolean {
  return policyKind === "patient_inbound_sync" || policyKind === "patient_proactive";
}

/**
 * Throttle gates (may await). Throws `wa_safety_rate_limited` if wait would exceed cap.
 */
export async function acquireWhatsAppSafetySlots(args: {
  clinicId?: number | null;
  policyKind: "patient_inbound_sync" | "patient_proactive" | "staff_alert";
}): Promise<void> {
  if (args.policyKind === "staff_alert") {
    await acquireWindowSlot("__global_staff__", GLOBAL_STAFF_MAX);
    return;
  }
  const cid = args.clinicId != null && Number.isFinite(args.clinicId) && args.clinicId! > 0 ? Number(args.clinicId) : 0;
  if (cid > 0) {
    await acquireWindowSlot(`clinic:${cid}`, CLINIC_MAX_PER_WINDOW);
  }
  await acquireWindowSlot("__global_patient__", GLOBAL_PATIENT_MAX);
}

export async function sleepHumanLikeJitter(policyKind: string): Promise<void> {
  if (!isPatientClass(policyKind)) return;
  const ms = jitterMs();
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

let tripInFlight: Promise<void> | null = null;

async function maybeTripCircuitBreaker(args: { clinicId?: number | null; detail: string }): Promise<void> {
  const now = Date.now();
  pruneFailures(now);
  failureStamps.push(now);
  pruneFailures(Date.now());
  if (failureStamps.length < CIRCUIT_FAILURE_THRESHOLD) return;

  if (tripInFlight) {
    await tripInFlight;
    return;
  }

  tripInFlight = (async () => {
    try {
      const pool = getPool();
      const already = await getRuntimeFlag("whatsapp_send_disabled", { pool, forceRefresh: true });
      if (already) {
        incProductMetric("whatsapp_safety_circuit_already_open_total");
        return;
      }
      await setRuntimeFlag({
        pool,
        clinicId: args.clinicId ?? null,
        actorUserId: "system_whatsapp_safety",
        flagKey: "whatsapp_send_disabled",
        enabled: true,
        reason: `auto_circuit_breaker:bridge_failures>=${CIRCUIT_FAILURE_THRESHOLD}/${Math.round(CIRCUIT_WINDOW_MS / 1000)}s last=${args.detail.slice(0, 200)}`,
        requestId: null,
      });
      await insertAuditLog(pool, {
        clinicId: args.clinicId ?? null,
        actorType: "system",
        actorId: "whatsapp_safety",
        action: "system.whatsapp.safety_circuit_trip",
        entityType: "system_runtime_flags",
        entityId: "whatsapp_send_disabled",
        payload: {
          failures_in_window: failureStamps.length,
          window_ms: CIRCUIT_WINDOW_MS,
          sample_detail: args.detail.slice(0, 400),
        },
      });
      const logNow = Date.now();
      if (logNow - lastTripLogAt > 5_000) {
        lastTripLogAt = logNow;
        await writeStructuredLog({
          level: "error",
          eventName: "system.whatsapp.safety_circuit_trip",
          clinicId: args.clinicId ?? null,
          userId: null,
          message: "WhatsApp safety circuit tripped; whatsapp_send_disabled set",
          payload: {
            failures_in_window: failureStamps.length,
            threshold: CIRCUIT_FAILURE_THRESHOLD,
            window_ms: CIRCUIT_WINDOW_MS,
          },
        });
      }
      incProductMetric("whatsapp_safety_circuit_trip_total");
    } catch (e) {
      incProductMetric("whatsapp_safety_circuit_trip_error_total");
      console.error("[whatsappSafetyLayer] circuit trip failed", e);
    } finally {
      tripInFlight = null;
    }
  })();

  await tripInFlight;
}

export async function recordBridgeSendOutcome(args: {
  ok: boolean;
  clinicId?: number | null;
  policyKind: string;
  detail?: string;
}): Promise<void> {
  if (args.ok) {
    incProductMetric("whatsapp_safety_send_success_total");
    return;
  }
  incProductMetric("whatsapp_safety_send_failure_total");
  if (args.policyKind === "staff_alert") {
    return;
  }
  await maybeTripCircuitBreaker({
    clinicId: args.clinicId,
    detail: args.detail || "unknown",
  });
}

export function resetWhatsAppSafetyStateForTests(): void {
  buckets.clear();
  failureStamps.length = 0;
  lastTripLogAt = 0;
}
