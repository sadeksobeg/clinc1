/** Booking-oriented scheduling entrypoints (thin facade over lib until split deploy). */
export { runSchedulingDecision } from "@/lib/conversations/schedulingDecision";
export { startBookingDialogueFlow, tryConsumeBookingDialogueTurn } from "@/lib/conversations/bookingDialogueFlow";
