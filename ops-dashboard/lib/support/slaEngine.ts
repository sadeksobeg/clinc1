type TicketStatus = "open" | "assigned" | "escalated" | "resolved";
type TicketPriority = "low" | "normal" | "high" | "critical";

const PRIORITY_HOURS: Record<TicketPriority, number> = {
  low: 48,
  normal: 24,
  high: 8,
  critical: 2,
};

export function computeSlaDeadline(priority: TicketPriority, now = new Date()): string {
  const due = new Date(now.getTime() + PRIORITY_HOURS[priority] * 60 * 60 * 1000);
  return due.toISOString();
}

const FIRST_RESPONSE_HOURS: Record<TicketPriority, number> = {
  low: 8,
  normal: 4,
  high: 2,
  critical: 1,
};

export function computeFirstResponseDueAt(priority: TicketPriority, now = new Date()): string {
  const due = new Date(now.getTime() + FIRST_RESPONSE_HOURS[priority] * 60 * 60 * 1000);
  return due.toISOString();
}

export function computePriorityScore(priority: TicketPriority, status: TicketStatus): number {
  const base = priority === "critical" ? 90 : priority === "high" ? 70 : priority === "normal" ? 50 : 30;
  if (status === "escalated") return Math.min(100, base + 10);
  if (status === "assigned") return Math.min(100, base + 5);
  return base;
}

export function computeSlaBreach(args: {
  status: TicketStatus;
  support_sla_deadline?: string | null;
  support_first_response_at?: string | null;
  support_first_response_due_at?: string | null;
  now?: Date;
}): { breached: boolean; late_response: boolean; response_due_missed: boolean } {
  const now = args.now ?? new Date();
  const deadlineMs = args.support_sla_deadline ? new Date(args.support_sla_deadline).getTime() : NaN;
  const firstResponseMs = args.support_first_response_at ? new Date(args.support_first_response_at).getTime() : NaN;
  const firstResponseDueMs = args.support_first_response_due_at ? new Date(args.support_first_response_due_at).getTime() : NaN;
  if (!Number.isFinite(deadlineMs)) return { breached: false, late_response: false, response_due_missed: false };
  const lateResponse = !Number.isFinite(firstResponseMs) && now.getTime() > deadlineMs;
  const breached = args.status !== "resolved" && now.getTime() > deadlineMs;
  const responseDueMissed = !Number.isFinite(firstResponseMs) && Number.isFinite(firstResponseDueMs) && now.getTime() > firstResponseDueMs;
  return { breached, late_response: lateResponse, response_due_missed: responseDueMissed };
}
