export type SlotOffer = {
  starts_at: string;
  ends_at: string;
  doctor_id: number;
  doctor_name: string;
};

export type InterpretResult = {
  intent: "booking" | "cancel" | "reschedule" | "urgent" | "question" | "unknown";
  specialty: string | null;
  doctor_hint: string | null;
  urgency: "low" | "normal" | "high";
  confidence: number;
  source: "ollama" | "heuristic";
};
