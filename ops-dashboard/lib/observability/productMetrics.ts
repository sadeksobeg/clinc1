/**
 * In-process product counters for ops-dashboard (cron + API paths).
 * Not a replacement for Prometheus on the bridge; complements structured logs.
 */

type CounterKey =
  | "process_inbound_total"
  | "process_inbound_error_total"
  | "process_inbound_duplicate_total"
  | "process_inbound_booking_consumed_total"
  | "process_inbound_blocked_billing_total"
  | "billing_blocked_attempt_total"
  | "billing_blocked_patient_message_total"
  | "ai_handoff_total"
  | "ai_confusion_total"
  | "ai_success_booking_total"
  | "process_inbound_lock_contended_total"
  | "process_inbound_queued_total"
  | "process_inbound_conversation_lock_contended_total"
  | "process_inbound_post_ingest_degraded_inline_total"
  | "process_inbound_post_ingest_worker_success_total"
  | "process_inbound_post_ingest_worker_error_total"
  | "process_inbound_stale_reclaimed_total"
  | "process_inbound_dlq_total"
  | "process_inbound_micro_batch_merged_total"
  | "process_inbound_micro_batch_messages_total"
  | "process_inbound_micro_batch_run_total"
  | "process_inbound_deferred_stale_drop_total"
  | "process_inbound_deferred_stale_requeue_total"
  | "process_inbound_ai_rate_limited_total"
  | "process_inbound_ai_token_denied_total"
  | "process_inbound_ai_handoff_total"
  | "process_inbound_ai_adapter_applied_total"
  | "process_inbound_ai_adapter_fallback_total"
  | "write_buffer_spill_append_total"
  | "write_buffer_spill_replay_row_total"
  | "write_buffer_spill_bytes_appended_total"
  | "process_inbound_interpret_skipped_total"
  | "hybrid_brain_routed_total"
  | "hybrid_brain_menu_fallback_total"
  | "ollama_interpret_ok_total"
  | "ollama_interpret_fallback_total"
  | "rules_engine_routed_total"
  | "rules_engine_handoff_total"
  | "rules_engine_unknown_total"
  | "clinic_lock_applied_total"
  | "bridge_send_blocked_policy_total"
  | "outbox_drain_sent_total"
  | "outbox_drain_blocked_total"
  | "outbox_drain_failed_total"
  | "emergency_detected_total"
  | "emergency_rescheduled_total"
  | "emergency_handoff_total"
  | "emergency_next_day_override_total"
  | "emergency_bump_notified_total"
  | "emergency_bump_notify_failed_total"
  | "process_inbound_decision_total"
  | "process_inbound_decision_emergency_total"
  | "process_inbound_decision_booking_total"
  | "process_inbound_decision_normal_total"
  | "process_inbound_decision_unknown_total"
  | "process_inbound_decision_uncertain_emergency_total"
  | "process_inbound_decision_idempotent_skip_total"
  | "process_inbound_prioritized_total"
  | "process_inbound_auto_book_total"
  | "process_inbound_auto_book_skipped_total"
  | "process_inbound_auto_reply_augment_total"
  | "decision_execute_total"
  | "decision_execute_success_total"
  | "decision_execute_error_total"
  | "decision_execute_blocked_total"
  | "decision_feedback_total"
  | "decision_feedback_success_total"
  | "decision_feedback_error_total"
  | "decision_feedback_medical_signal_mismatch_total"
  | "calibration_suggestion_generated_total"
  | "calibration_applied_total"
  | "calibration_rejected_total"
  | "calibration_blocked_total"
  | "calibration_rollback_total"
  | "emergency_throttle_activated_total"
  | "process_inbound_decision_version_locked_skip_total"
  | "billing_reminders_run_total"
  | "billing_reminders_run_success_total"
  | "billing_reminders_run_error_total"
  | "whatsapp_safety_rate_wait_exceeded_total"
  | "whatsapp_safety_circuit_already_open_total"
  | "whatsapp_safety_circuit_trip_total"
  | "whatsapp_safety_circuit_trip_error_total"
  | "whatsapp_safety_send_success_total"
  | "whatsapp_safety_send_failure_total"
  | "patient_safety_decision_blocked_total"
  | "outbound_guard_length_block_total"
  | "outbound_guard_hard_block_total"
  | "outbound_guard_sanitized_total";

const counters: Record<CounterKey, number> = {
  process_inbound_total: 0,
  process_inbound_error_total: 0,
  process_inbound_duplicate_total: 0,
  process_inbound_booking_consumed_total: 0,
  process_inbound_blocked_billing_total: 0,
  billing_blocked_attempt_total: 0,
  billing_blocked_patient_message_total: 0,
  ai_handoff_total: 0,
  ai_confusion_total: 0,
  ai_success_booking_total: 0,
  process_inbound_lock_contended_total: 0,
  process_inbound_queued_total: 0,
  process_inbound_conversation_lock_contended_total: 0,
  process_inbound_post_ingest_degraded_inline_total: 0,
  process_inbound_post_ingest_worker_success_total: 0,
  process_inbound_post_ingest_worker_error_total: 0,
  process_inbound_stale_reclaimed_total: 0,
  process_inbound_dlq_total: 0,
  process_inbound_micro_batch_merged_total: 0,
  process_inbound_micro_batch_messages_total: 0,
  process_inbound_micro_batch_run_total: 0,
  process_inbound_deferred_stale_drop_total: 0,
  process_inbound_deferred_stale_requeue_total: 0,
  process_inbound_ai_rate_limited_total: 0,
  process_inbound_ai_token_denied_total: 0,
  process_inbound_ai_handoff_total: 0,
  process_inbound_ai_adapter_applied_total: 0,
  process_inbound_ai_adapter_fallback_total: 0,
  write_buffer_spill_append_total: 0,
  write_buffer_spill_replay_row_total: 0,
  write_buffer_spill_bytes_appended_total: 0,
  process_inbound_interpret_skipped_total: 0,
  hybrid_brain_routed_total: 0,
  hybrid_brain_menu_fallback_total: 0,
  ollama_interpret_ok_total: 0,
  ollama_interpret_fallback_total: 0,
  rules_engine_routed_total: 0,
  rules_engine_handoff_total: 0,
  rules_engine_unknown_total: 0,
  clinic_lock_applied_total: 0,
  bridge_send_blocked_policy_total: 0,
  outbox_drain_sent_total: 0,
  outbox_drain_blocked_total: 0,
  outbox_drain_failed_total: 0,
  emergency_detected_total: 0,
  emergency_rescheduled_total: 0,
  emergency_handoff_total: 0,
  emergency_next_day_override_total: 0,
  emergency_bump_notified_total: 0,
  emergency_bump_notify_failed_total: 0,
  process_inbound_decision_total: 0,
  process_inbound_decision_emergency_total: 0,
  process_inbound_decision_booking_total: 0,
  process_inbound_decision_normal_total: 0,
  process_inbound_decision_unknown_total: 0,
  process_inbound_decision_uncertain_emergency_total: 0,
  process_inbound_decision_idempotent_skip_total: 0,
  process_inbound_prioritized_total: 0,
  process_inbound_auto_book_total: 0,
  process_inbound_auto_book_skipped_total: 0,
  process_inbound_auto_reply_augment_total: 0,
  decision_execute_total: 0,
  decision_execute_success_total: 0,
  decision_execute_error_total: 0,
  decision_execute_blocked_total: 0,
  decision_feedback_total: 0,
  decision_feedback_success_total: 0,
  decision_feedback_error_total: 0,
  decision_feedback_medical_signal_mismatch_total: 0,
  calibration_suggestion_generated_total: 0,
  calibration_applied_total: 0,
  calibration_rejected_total: 0,
  calibration_blocked_total: 0,
  calibration_rollback_total: 0,
  emergency_throttle_activated_total: 0,
  process_inbound_decision_version_locked_skip_total: 0,
  billing_reminders_run_total: 0,
  billing_reminders_run_success_total: 0,
  billing_reminders_run_error_total: 0,
  whatsapp_safety_rate_wait_exceeded_total: 0,
  whatsapp_safety_circuit_already_open_total: 0,
  whatsapp_safety_circuit_trip_total: 0,
  whatsapp_safety_circuit_trip_error_total: 0,
  whatsapp_safety_send_success_total: 0,
  whatsapp_safety_send_failure_total: 0,
  patient_safety_decision_blocked_total: 0,
  outbound_guard_length_block_total: 0,
  outbound_guard_hard_block_total: 0,
  outbound_guard_sanitized_total: 0,
};

let latencySumMs = 0;
let latencyCount = 0;

export function incProductMetric(key: CounterKey, n = 1): void {
  counters[key] = (counters[key] || 0) + n;
}

export function observeProcessInboundLatencyMs(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  latencySumMs += ms;
  latencyCount += 1;
}

export function getProductMetricsSnapshot(): Record<string, number> {
  const avg = latencyCount ? latencySumMs / latencyCount : 0;
  const feedbackSuccess = counters.decision_feedback_success_total || 0;
  const medicalMismatchRate = feedbackSuccess
    ? counters.decision_feedback_medical_signal_mismatch_total / feedbackSuccess
    : 0;
  return {
    ...counters,
    process_inbound_latency_avg_ms: Math.round(avg * 100) / 100,
    process_inbound_latency_sample_count: latencyCount,
    decision_feedback_medical_signal_mismatch_rate: Math.round(medicalMismatchRate * 10000) / 10000,
  };
}

export function resetProductMetricsForTests(): void {
  (Object.keys(counters) as CounterKey[]).forEach((k) => {
    counters[k] = 0;
  });
  latencySumMs = 0;
  latencyCount = 0;
}
