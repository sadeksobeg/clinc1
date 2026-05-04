const crm = $input.first().json;
async function main() {
  const base = String($env.OPS_DASHBOARD_URL || "http://host.docker.internal:3001");
  const token = String($env.SCHEDULING_SERVICE_TOKEN || "");
  if (!token) {
    return {
      ...crm,
      finalIntent: crm.ruleIntent,
      finalPriority: crm.rulePriority,
      finalReply: crm.fallbackReply,
      handoffRequired: crm.ruleHandoff,
      decisionSource: "rules",
      aiValid: false,
      aiFailureReason: "no_service_token",
    };
  }
  try {
    const cid = String(crm.message_id || crm.messageId || crm.dedupe_hash || crm.correlation_id || "").slice(0, 256);
    const apiHeaders = {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      "X-Correlation-Id": cid || "n8n-scheduling",
    };
    const r1 = await fetch(base + "/api/internal/scheduling/interpret", {
      method: "POST",
      headers: apiHeaders,
      body: JSON.stringify({ text: crm.text }),
    });
    let int;
    try {
      int = await r1.json();
    } catch {
      throw new Error("interpret_bad_json");
    }
    if (!r1.ok || !int || !int.ok || !int.interpret) {
      const msg = (int && (int.error || int.detail)) || "interpret_http_" + r1.status;
      throw new Error(String(msg));
    }
    const intent = int.interpret.intent;
    if (intent === "urgent") {
      return {
        ...crm,
        finalIntent: "URGENT",
        finalPriority: 1,
        finalReply:
          crm.fallbackReply ||
          "تم استلام حالتك كأولوية. إذا كانت الحالة طارئة جداً يرجى التواصل مع الطوارئ.",
        handoffRequired: true,
        decisionSource: "scheduling_interpret",
        aiValid: false,
        aiFailureReason: "n/a",
      };
    }
    if (intent !== "booking") {
      return {
        ...crm,
        finalIntent: crm.ruleIntent,
        finalPriority: crm.rulePriority,
        finalReply: crm.fallbackReply,
        handoffRequired: crm.ruleHandoff,
        decisionSource: "rules",
        aiValid: false,
        aiFailureReason: "not_booking",
      };
    }
    const r2 = await fetch(base + "/api/internal/scheduling/slots", {
      method: "POST",
      headers: apiHeaders,
      body: JSON.stringify({
        clinic_id: Number(crm.clinic_id),
        conversation_id: Number(crm.conversation_id),
        specialty: int.interpret.specialty || undefined,
      }),
    });
    let slots;
    try {
      slots = await r2.json();
    } catch {
      throw new Error("slots_bad_json");
    }
    if (!r2.ok || !slots || !slots.ok) {
      const msg = (slots && (slots.error || slots.detail)) || "slots_http_" + r2.status;
      throw new Error(String(msg));
    }
    const lines = (slots.reply_lines || []).join("\n");
    const closed = slots.closed_message_ar;
    const finalReply = lines
      ? "أهلاً بك، أقرب المواعيد المتاحة:\n" + lines + "\nأرسل رقم الخيار (1، 2، أو 3)."
      : closed || crm.fallbackReply;
    return {
      ...crm,
      finalIntent: "BOOKING",
      finalPriority: 2,
      finalReply,
      handoffRequired: false,
      decisionSource: "scheduling_engine",
      aiValid: false,
      aiFailureReason: "n/a",
      schedulingSlots: slots.slots,
    };
  } catch (e) {
    return {
      ...crm,
      finalIntent: crm.ruleIntent,
      finalPriority: crm.rulePriority,
      finalReply: crm.fallbackReply,
      handoffRequired: crm.ruleHandoff,
      decisionSource: "rules",
      aiValid: false,
      aiFailureReason: String(e && e.message),
    };
  }
}
return main().then((j) => [{ json: j }]);
