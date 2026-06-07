import type { Pool } from "pg";
import type { InboundIngestRow } from "@/lib/crm/inboundIngest";
import {
  ensureClinicLock,
  getLockedClinic,
  incrementSessionMessageCount,
  resolveEffectiveClinicId,
} from "./clinicRoutingGuard";
import { dispatchIntentHandler } from "./intentHandlers";
import { normalizeArabicMessage } from "./messageNormalizer";
import { isNumericMainMenuChoice } from "./hybridBrainRouter";
import type { NormalizedInboundRules } from "./normalizeInbound";
import type { StoredDialogueState } from "./dialogueTypes";
import type { ConsumedBookingTurn } from "./bookingDialogueFlow";

const INTERACTIVE_STEPS = new Set([
  "slot_offer",
  "choose_doctor",
  "choose_clinic",
  "awaiting_specialty",
  "awaiting_display_name",
  "awaiting_confirm",
  "awaiting_cancel_confirm",
]);

export type RulesEngineRouteResult = ConsumedBookingTurn | "handoff" | null;

/**
 * Pure-rules path for idle / non-interactive WhatsApp turns (no AI).
 */
export async function tryRulesEngineRoute(
  pool: Pool,
  args: {
    crm: InboundIngestRow;
    norm: NormalizedInboundRules;
    dialogue: StoredDialogueState;
    routing: Record<string, unknown>;
  },
): Promise<RulesEngineRouteResult> {
  const { crm, norm, dialogue, routing } = args;
  const step = dialogue.flow_step;

  if (INTERACTIVE_STEPS.has(step)) {
    if (step === "awaiting_cancel_confirm") {
      const msg = normalizeArabicMessage(norm.text);
      if (msg.intent === "AFFIRMATION" || msg.intent === "NEGATION" || /^[12]$/.test(norm.text.trim())) {
        const clinicId = resolveEffectiveClinicId(routing, crm.clinic_id);
        return dispatchIntentHandler({
          pool,
          crm,
          norm,
          dialogue,
          routing,
          message: msg.intent === "NEGATION" || norm.text.trim() === "2" ? { ...msg, intent: "NEGATION" } : msg,
          clinicId,
        });
      }
    }
    return null;
  }

  if (isNumericMainMenuChoice(norm.text)) return null;

  const message = normalizeArabicMessage(norm.text);
  const clinicId = resolveEffectiveClinicId(routing, crm.clinic_id);

  const locked = getLockedClinic(routing);
  if (locked == null && clinicId > 0) {
    await ensureClinicLock(pool, crm.conversation_id, clinicId, "number_route").catch(() => undefined);
  }

  const result = await dispatchIntentHandler({
    pool,
    crm: { ...crm, clinic_id: clinicId },
    norm,
    dialogue,
    routing,
    message,
    clinicId,
  });

  void incrementSessionMessageCount(pool, crm.conversation_id).catch(() => undefined);

  return result;
}

export { INTERACTIVE_STEPS as RULES_INTERACTIVE_STEPS };
