"use client";

import Link from "next/link";
import { AlertTriangle, Archive, Bot, Calendar, Check, CheckCircle2, ClipboardList, MessageSquare, MoreHorizontal, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DateTime } from "luxon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatArabicDate, formatPatientContactLine, whatsappChatIdIsLid } from "@/lib/format";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { mergeInboxRows } from "@/lib/inbox-sync";
import { localizeApiError } from "@/lib/i18n/errors";
import { statusLabel } from "@/lib/i18n/status";
import { buildDecisionTimeline, type TimelineTone } from "@/lib/decision-timeline";
import type { InboxRow } from "@/lib/ops-server";
import { WorkspacePanel } from "@/components/layout/WorkspacePanel";
import { cn } from "@/lib/utils";
import { usePeriodicRefresh } from "@/hooks/usePeriodicRefresh";
import { useUiPreferences } from "@/hooks/use-ui-preferences";
import type {
  ConversationDetail,
  ConversationMessage,
  DecisionFeedbackSnapshot,
  DecisionExecutionSnapshot,
  DecisionLayerSnapshot,
  EmergencyEventSnapshot,
  SuggestedDecisionAction,
} from "@/types/ops";

type InboxWorkspaceProps = {
  rows: InboxRow[];
  selectedId?: number;
  detail?: ConversationDetail;
  messages?: ConversationMessage[];
};

type UiMessage = ConversationMessage & { clientStatus?: "pending" | "failed" };

type RenderItem =
  | { kind: "separator"; id: string; label: string }
  | { kind: "cluster"; id: string; lane: "inbound" | "outbound" }
  | { kind: "message"; id: string; message: UiMessage };

function messageBubbleTopMargin(prev: RenderItem | undefined, message: UiMessage): string {
  if (!prev || prev.kind === "separator") return "mt-cg-3";
  if (prev.kind === "cluster") return "mt-cg-1";
  if (prev.kind === "message") return prev.message.direction === message.direction ? "mt-cg-1" : "mt-cg-3";
  return "mt-cg-3";
}

function intentToken(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

function inboxRowIsUrgent(r: InboxRow): boolean {
  if (r.last_inbound_is_urgent) return true;
  const i = intentToken(r.last_inbound_intent);
  if (i === "urgent" || i === "emergency" || i.includes("emergency")) return true;
  return isConfirmedEmergencyRow(r) || isUncertainEmergencyRow(r);
}

function inboxRowIsBooking(r: InboxRow): boolean {
  return intentToken(r.last_inbound_intent) === "booking";
}

function isUncertainEmergencyRow(r: InboxRow): boolean {
  const severity = Number(r.last_inbound_severity ?? 0);
  const confidence = Number(r.last_inbound_confidence ?? 0);
  const reason = intentToken(r.last_decision_reason);
  if (reason.includes("emergency:uncertain_")) return true;
  return severity >= 4 && confidence > 0 && confidence < 0.7;
}

function isConfirmedEmergencyRow(r: InboxRow): boolean {
  if (isUncertainEmergencyRow(r)) return false;
  const severity = Number(r.last_inbound_severity ?? 0);
  const confidence = Number(r.last_inbound_confidence ?? 0);
  if (severity >= 5 && confidence >= 0.7) return true;
  return intentToken(r.last_decision_type) === "emergency" && severity >= 4;
}

function needsReviewRow(r: InboxRow): boolean {
  return intentToken(r.last_decision_type) === "unknown";
}

function triageRank(r: InboxRow): number {
  if (isConfirmedEmergencyRow(r)) return 0;
  if (isUncertainEmergencyRow(r)) return 1;
  if (r.unread) return 2;
  return 3;
}

function rowPrimaryBadge(
  r: InboxRow,
): { label: string; variant: "danger" | "warning" | "outline" | "secondary" } | null {
  if (isConfirmedEmergencyRow(r)) {
    const mr = localizeMedicalReason(r.last_decision_primary_medical_reason ?? r.last_decision_reason ?? null);
    return { label: mr ? `🚑 طارئة — ${mr}` : "🚑 طارئة", variant: "danger" };
  }
  if (isUncertainEmergencyRow(r)) return { label: "⚠️ غير مؤكدة", variant: "warning" };
  if (inboxRowIsBooking(r)) return { label: "📅 حجز", variant: "outline" };
  if (needsReviewRow(r)) return { label: "🧠 يحتاج مراجعة", variant: "secondary" };
  return null;
}

function sortInboxRows(list: InboxRow[]): InboxRow[] {
  return [...list].sort((a, b) => {
    const ra = triageRank(a);
    const rb = triageRank(b);
    if (ra !== rb) return ra - rb;
    const ta = a.last_message_at ? DateTime.fromISO(a.last_message_at).toMillis() : 0;
    const tb = b.last_message_at ? DateTime.fromISO(b.last_message_at).toMillis() : 0;
    return tb - ta;
  });
}

function lastInboundMessage(messages: ConversationMessage[]): ConversationMessage | undefined {
  return [...messages].reverse().find((m) => m.direction !== "outbound");
}

function formatRelativeAge(ts: string | null | undefined): string {
  const raw = String(ts ?? "");
  if (!raw) return "—";
  const t = DateTime.fromISO(raw);
  if (!t.isValid) return "—";
  const delta = DateTime.now().diff(t).as("milliseconds");
  if (delta < 60_000) return "الآن";
  const min = Math.round(delta / 60_000);
  if (min < 60) return `${min}د`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}س`;
  const d = Math.round(hr / 24);
  return `${d}ي`;
}

function isoDayKey(ts: string): string {
  const d = DateTime.fromISO(ts);
  return d.isValid ? (d.toISODate() ?? "unknown") : "unknown";
}

function dayLabelAr(ts: string): string {
  const d = DateTime.fromISO(ts);
  if (!d.isValid) return "—";
  const today = DateTime.now().startOf("day");
  if (d.hasSame(today, "day")) return "اليوم";
  return d.setLocale("ar-SA").toFormat("cccc dd LLLL");
}

function messageIsUrgent(m: ConversationMessage): boolean {
  if (m.is_urgent) return true;
  const i = intentToken(m.intent ?? undefined);
  return i === "urgent" || i === "emergency" || i.includes("emergency");
}

function localizeDecisionBlockedReason(reason: string): string {
  if (reason === "expired") return "الاقتراح منتهي الصلاحية.";
  if (reason === "already_has_appointment") return "يوجد موعد نشط مسبقًا لهذا المريض.";
  if (reason === "slot_unavailable") return "الوقت المقترح لم يعد متاحًا.";
  if (reason === "invalid_action_payload") return "بيانات الاقتراح غير مكتملة.";
  return reason;
}

function localizeMedicalReason(reason: string | null | undefined): string | null {
  const r = (reason ?? "").toLowerCase();
  if (!r) return null;
  if (r.includes("breathing_issue")) return "صعوبة تنفس";
  if (r.includes("bleeding")) return "نزيف";
  if (r.includes("loss_of_consciousness")) return "فقدان وعي";
  if (r.includes("severe_pain")) return "ألم شديد";
  if (r.includes("trauma")) return "إصابة/حادث";
  if (r.includes("infection_signs")) return "علامات عدوى";
  if (r.includes("mobility_issue")) return "صعوبة حركة";
  if (r.includes("psychological_distress")) return "ضائقة نفسية";
  return null;
}

const MEDICAL_SIGNAL_KEYS = [
  "breathing_issue",
  "bleeding",
  "severe_pain",
  "loss_of_consciousness",
  "trauma",
  "infection_signs",
  "mobility_issue",
  "psychological_distress",
] as const;

type MedicalSignalKey = (typeof MEDICAL_SIGNAL_KEYS)[number];

const MEDICAL_SIGNAL_LABELS: Record<MedicalSignalKey, string> = {
  breathing_issue: "صعوبة تنفس",
  bleeding: "نزيف",
  severe_pain: "ألم شديد",
  loss_of_consciousness: "فقدان وعي",
  trauma: "إصابة/حادث",
  infection_signs: "علامات عدوى",
  mobility_issue: "صعوبة حركة",
  psychological_distress: "ضائقة نفسية",
};

const PATIENT_CONTEXT_LABELS = {
  is_child: "طفل",
  is_elderly: "كبير سن",
  chronic_condition: "حالة مزمنة",
} as const;

function isUncertainEmergencyDecision(decision: DecisionLayerSnapshot | null): boolean {
  if (!decision) return false;
  const reason = (decision.reason ?? "").toLowerCase();
  if (reason.startsWith("emergency:uncertain_")) return true;
  const actions = Array.isArray(decision.actions) ? decision.actions.map((a) => a.toUpperCase()) : [];
  return decision.type === "UNKNOWN" && actions.includes("PRIORITIZE") && reason.includes("emergency");
}

function formatSyncClock(ms: number): string {
  return DateTime.fromMillis(ms).setLocale("ar-SA").toFormat("HH:mm:ss");
}

export function InboxWorkspace({ rows, selectedId, detail, messages = [] }: InboxWorkspaceProps) {
  const { density, workspaceMode } = useUiPreferences();
  const isCompact = density === "compact";
  const isDoctorMode = workspaceMode === "doctor";
  const searchParams = useSearchParams();
  const [localRows, setLocalRows] = useState<InboxRow[]>(rows);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const pendingListScrollRef = useRef<number | null>(null);
  const pendingMessagesScrollRef = useRef<number | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const queryRef = useRef<HTMLInputElement | null>(null);
  const replyRef = useRef<HTMLTextAreaElement | null>(null);
  const keyChordRef = useRef<{ gArmedAt: number | null }>({ gArmedAt: null });
  const prefillDoneRef = useRef(false);
  const outboundReplyInFlightRef = useRef(false);
  const router = useRouter();

  const captureScrollPositions = useCallback(() => {
    if (listRef.current) pendingListScrollRef.current = listRef.current.scrollTop;
    if (messagesScrollRef.current) pendingMessagesScrollRef.current = messagesScrollRef.current.scrollTop;
  }, []);

  const softRefresh = useCallback(() => {
    captureScrollPositions();
    router.refresh();
  }, [captureScrollPositions, router]);

  usePeriodicRefresh({
    intervalMs: 20_000,
    enabled: true,
    beforeRefresh: captureScrollPositions,
    shouldRefresh: () => {
      const ae = document.activeElement;
      return ae !== replyRef.current && ae !== queryRef.current;
    },
  });

  useEffect(() => {
    setLocalRows((prev) => mergeInboxRows(prev, rows));
  }, [rows]);

  useEffect(() => {
    setLastSyncAt(Date.now());
  }, [rows]);

  useLayoutEffect(() => {
    const yL = pendingListScrollRef.current;
    const yM = pendingMessagesScrollRef.current;
    if (yL != null && listRef.current) {
      listRef.current.scrollTop = yL;
      pendingListScrollRef.current = null;
    }
    if (yM != null && messagesScrollRef.current) {
      messagesScrollRef.current.scrollTop = yM;
      pendingMessagesScrollRef.current = null;
    }
  }, [rows]);
  const showMedicalQaPanel = process.env.NEXT_PUBLIC_SHOW_MEDICAL_QA_PANEL === "1";
  const [query, setQuery] = useState("");
  const [inboxTab, setInboxTab] = useState("all");
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "bookings" || t === "unread" || t === "urgent" || t === "all") setInboxTab(t);
  }, [searchParams]);
  const [draft, setDraft] = useState("");
  const [templateKey, setTemplateKey] = useState<string>("welcome");
  const [isSending, setIsSending] = useState(false);
  const [doctorOptions, setDoctorOptions] = useState<Array<{ id: number; display_name: string }>>([]);
  const [assignedDoctorId, setAssignedDoctorId] = useState<string>("none");
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [decisionActionId, setDecisionActionId] = useState<string | null>(null);
  const [blockedReasons, setBlockedReasons] = useState<string[] | null>(null);
  const [isRegeneratingSuggestion, setIsRegeneratingSuggestion] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [correctedDecision, setCorrectedDecision] = useState<"EMERGENCY" | "BOOKING" | "NORMAL" | "UNKNOWN">("UNKNOWN");
  const [correctedSeverity, setCorrectedSeverity] = useState("3");
  const [correctedMedicalSignals, setCorrectedMedicalSignals] = useState<Record<MedicalSignalKey, boolean>>({
    breathing_issue: false,
    bleeding: false,
    severe_pain: false,
    loss_of_consciousness: false,
    trauma: false,
    infection_signs: false,
    mobility_issue: false,
    psychological_distress: false,
  });
  const [correctedPrimarySignal, setCorrectedPrimarySignal] = useState<MedicalSignalKey | "none">("none");
  const [correctedPatientContext, setCorrectedPatientContext] = useState<{
    is_child: boolean;
    is_elderly: boolean;
    chronic_condition: boolean;
  }>({
    is_child: false,
    is_elderly: false,
    chronic_condition: false,
  });
  const [feedbackNote, setFeedbackNote] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<UiMessage[]>([]);

  const renderedMessages = useMemo((): UiMessage[] => {
    const base: UiMessage[] = messages.map((m) => ({ ...m }));
    if (!optimisticMessages.length) return base;
    return [...base, ...optimisticMessages];
  }, [messages, optimisticMessages]);

  const renderItems = useMemo((): RenderItem[] => {
    const out: RenderItem[] = [];
    let lastDay: string | null = null;
    let lastLane: "inbound" | "outbound" | null = null;
    for (const m of renderedMessages) {
      const key = isoDayKey(m.created_at);
      if (key !== lastDay) {
        out.push({ kind: "separator", id: `sep:${key}:${out.length}`, label: dayLabelAr(m.created_at) });
        lastDay = key;
        lastLane = null;
      }
      const lane: "inbound" | "outbound" = m.direction === "outbound" ? "outbound" : "inbound";
      if (lastLane !== lane) {
        out.push({ kind: "cluster", id: `cl:${lane}:${m.id}:${out.length}`, lane });
        lastLane = lane;
      }
      out.push({ kind: "message", id: `msg:${m.id}`, message: m });
    }
    return out;
  }, [renderedMessages]);

  const virtualizer = useVirtualizer({
    count: renderItems.length,
    getScrollElement: () => messagesScrollRef.current,
    estimateSize: (idx) => {
      const it = renderItems[idx];
      if (!it) return 72;
      if (it.kind === "separator") return 40;
      if (it.kind === "cluster") return 30;
      return 88;
    },
    overscan: 10,
  });

  function scrollToLatest() {
    if (!renderItems.length) return;
    // Keep the operator anchored near the latest message by default.
    virtualizer.scrollToIndex(renderItems.length - 1, { align: "end" });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return localRows;
    return localRows.filter((r) => (r.display_name ?? r.chat_id).toLowerCase().includes(q));
  }, [localRows, query]);

  const sortedFiltered = useMemo(() => sortInboxRows(filtered), [filtered]);

  const tabRows = useMemo(() => {
    if (inboxTab === "unread") return sortedFiltered.filter((r) => r.unread);
    if (inboxTab === "urgent") return sortedFiltered.filter(inboxRowIsUrgent);
    if (inboxTab === "bookings") return sortedFiltered.filter(inboxRowIsBooking);
    return sortedFiltered;
  }, [sortedFiltered, inboxTab]);

  const selectedThread = localRows.find((r) => r.conversation_id === selectedId) ?? tabRows[0];
  const selectedConversationId = selectedThread?.conversation_id ?? selectedId;

  useEffect(() => {
    if (!selectedConversationId) return;
    const t = setTimeout(() => replyRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [selectedConversationId]);

  useEffect(() => {
    if (prefillDoneRef.current) return;
    const raw = searchParams.get("draft");
    if (!raw) return;
    // Use the param once, then let the user edit/send normally.
    prefillDoneRef.current = true;
    setDraft(raw);
    const t = setTimeout(() => replyRef.current?.focus(), 0);
    // Clean the URL so refresh/polling doesn't keep re-prefilling.
    if (selectedConversationId) router.replace(`/inbox/${selectedConversationId}`);
    return () => clearTimeout(t);
  }, [router, searchParams, selectedConversationId]);

  useEffect(() => {
    function onGlobalKeyDown(e: KeyboardEvent) {
      // Inbox-local shortcuts only (keep global shortcuts for shell later).
      const active = document.activeElement as HTMLElement | null;
      const typing =
        active?.tagName === "INPUT" ||
        active?.tagName === "TEXTAREA" ||
        (active as HTMLElement | null)?.getAttribute?.("contenteditable") === "true";

      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (typing) return;
        e.preventDefault();
        queryRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        keyChordRef.current.gArmedAt = null;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
          active.blur();
        }
        return;
      }

      // g + <key> navigation chord (power users).
      const now = Date.now();
      const armedAt = keyChordRef.current.gArmedAt;
      if (!typing && e.key.toLowerCase() === "g") {
        keyChordRef.current.gArmedAt = now;
        return;
      }
      if (!typing && armedAt && now - armedAt < 1200) {
        const k = e.key.toLowerCase();
        const map: Record<string, string> = {
          i: "/inbox",
          a: "/appointments",
          p: "/patients",
          s: "/settings",
          b: "/billing",
          d: "/dashboard",
        };
        const dest = map[k];
        keyChordRef.current.gArmedAt = null;
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
      }
    }
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [router]);

  useEffect(() => {
    // Clear any local optimistic messages when conversation changes/refetches.
    setOptimisticMessages([]);
  }, [selectedConversationId, messages.length]);

  const showEmergencyBanner = useMemo(() => {
    const li = lastInboundMessage(messages);
    return li ? messageIsUrgent(li) : selectedThread ? inboxRowIsUrgent(selectedThread) : false;
  }, [messages, selectedThread]);

  const lastDecision = (detail?.routing?.last_decision ?? null) as DecisionLayerSnapshot | null;
  const patientFlowBadges = useMemo(() => {
    const out: Array<{ label: string; variant: "danger" | "warning" | "secondary" | "outline" }> = [];
    if (selectedThread && inboxRowIsUrgent(selectedThread)) out.push({ label: "طارئ", variant: "danger" });
    const known = lastDecision?.patient_context?.known_patient;
    if (known === false) out.push({ label: "جديد", variant: "outline" });
    else if (known === true) out.push({ label: "مراجعة", variant: "secondary" });
    return out;
  }, [selectedThread, lastDecision?.patient_context?.known_patient]);
  const contextContactLine = useMemo(() => {
    const pe = detail?.phone_e164 ?? null;
    const cid = detail?.chat_id ?? selectedThread?.chat_id ?? null;
    return formatPatientContactLine(pe, cid);
  }, [detail?.phone_e164, detail?.chat_id, selectedThread?.chat_id]);
  const contactIsLidWithoutPhone = useMemo(() => {
    const digits = String(detail?.phone_e164 ?? "").replace(/\D/g, "");
    const hasCrmPhone = digits.length >= 8;
    return !hasCrmPhone && whatsappChatIdIsLid(detail?.chat_id ?? selectedThread?.chat_id);
  }, [detail?.phone_e164, detail?.chat_id, selectedThread?.chat_id]);
  const showUncertainEmergencyBanner = useMemo(() => isUncertainEmergencyDecision(lastDecision), [lastDecision]);
  const conversationStateBadges = useMemo(() => {
    const out: Array<{ label: string; tone: "danger" | "warning" | "outline" | "secondary" }> = [];
    if (showEmergencyBanner) out.push({ label: "🚑 طارئة", tone: "danger" });
    if (showUncertainEmergencyBanner) out.push({ label: "⚠️ غير مؤكدة", tone: "warning" });
    if (selectedThread && inboxRowIsBooking(selectedThread)) out.push({ label: "📅 حجز", tone: "outline" });
    if (selectedThread && needsReviewRow(selectedThread)) out.push({ label: "🧠 يحتاج مراجعة", tone: "secondary" });
    if (selectedThread?.unread) out.push({ label: "غير مقروءة", tone: "warning" });
    return out.slice(0, 3);
  }, [selectedThread, showEmergencyBanner, showUncertainEmergencyBanner]);
  const suggestedActions = useMemo(() => {
    const raw = detail?.routing?.suggested_actions;
    if (!Array.isArray(raw)) return [] as SuggestedDecisionAction[];
    return raw as SuggestedDecisionAction[];
  }, [detail?.routing?.suggested_actions]);
  const pendingSuggestedActions = suggestedActions.filter((a) => (a.status ?? "pending") === "pending");
  const lastDecisionExecution = (detail?.routing?.last_decision_execution ?? null) as DecisionExecutionSnapshot | null;
  const lastEmergencyEvent = (detail?.routing?.last_emergency_event ?? null) as EmergencyEventSnapshot | null;
  const lastDecisionFeedback = (detail?.routing?.decision_feedback ?? null) as DecisionFeedbackSnapshot | null;
  const effectiveBlockedReasons = blockedReasons ?? (lastDecisionExecution?.status === "blocked" ? lastDecisionExecution.reason ?? [] : []);
  const timelineItems = useMemo(() => buildDecisionTimeline(detail), [detail]);
  const activeMedicalSignals = useMemo(() => {
    const signals = (lastDecision?.medical_signals ?? {}) as Partial<Record<MedicalSignalKey, boolean>>;
    return MEDICAL_SIGNAL_KEYS.filter((k) => Boolean(signals[k]));
  }, [lastDecision?.medical_signals]);
  const activePatientContext = useMemo(() => {
    const ctx = lastDecision?.patient_context ?? null;
    if (!ctx) return [] as Array<keyof typeof PATIENT_CONTEXT_LABELS>;
    return (Object.keys(PATIENT_CONTEXT_LABELS) as Array<keyof typeof PATIENT_CONTEXT_LABELS>).filter((k) => Boolean(ctx[k]));
  }, [lastDecision?.patient_context]);

  useEffect(() => {
    const typed = String(lastDecision?.type ?? "").toUpperCase();
    if (typed === "EMERGENCY" || typed === "BOOKING" || typed === "NORMAL" || typed === "UNKNOWN") {
      setCorrectedDecision(typed);
    }
    if (lastDecision?.severity != null) {
      setCorrectedSeverity(String(lastDecision.severity));
    }
    const signals = (lastDecision?.medical_signals ?? {}) as Partial<Record<MedicalSignalKey, boolean>>;
    setCorrectedMedicalSignals({
      breathing_issue: Boolean(signals.breathing_issue),
      bleeding: Boolean(signals.bleeding),
      severe_pain: Boolean(signals.severe_pain),
      loss_of_consciousness: Boolean(signals.loss_of_consciousness),
      trauma: Boolean(signals.trauma),
      infection_signs: Boolean(signals.infection_signs),
      mobility_issue: Boolean(signals.mobility_issue),
      psychological_distress: Boolean(signals.psychological_distress),
    });
    const primaryRaw = String(lastDecision?.primary_medical_reason ?? "");
    if (MEDICAL_SIGNAL_KEYS.includes(primaryRaw as MedicalSignalKey)) setCorrectedPrimarySignal(primaryRaw as MedicalSignalKey);
    else setCorrectedPrimarySignal("none");
    const patientContext = lastDecision?.patient_context ?? null;
    setCorrectedPatientContext({
      is_child: Boolean(patientContext?.is_child),
      is_elderly: Boolean(patientContext?.is_elderly),
      chronic_condition: Boolean(patientContext?.chronic_condition),
    });
  }, [lastDecision]);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetchWithRetry("/api/ops/doctors", { cache: "no-store" });
        const out = (await res.json()) as { ok?: boolean; rows?: Array<{ id: number; display_name: string }> };
        if (!out.ok || !out.rows) return;
        setDoctorOptions(out.rows);
      } catch {
        // non-blocking enhancement
      }
    };
    void run();
  }, []);

  useEffect(() => {
    const val = detail && typeof detail === "object" ? (detail as { routing?: { assigned_doctor_id?: number } }).routing?.assigned_doctor_id : undefined;
    if (typeof val === "number") setAssignedDoctorId(String(val));
    else setAssignedDoctorId("none");
  }, [detail]);

  const OPS_CLIENT_TIMEOUT_MS = 12_000;

  async function postOutboundReply(text: string, optimisticId: number) {
    if (!selectedConversationId) return;
    if (outboundReplyInFlightRef.current) return;
    outboundReplyInFlightRef.current = true;
    setOptimisticMessages((cur) =>
      cur.map((m) => (m.id === optimisticId ? { ...m, clientStatus: "pending" as const } : m)),
    );
    setIsSending(true);
    try {
      const idem = `reply-${selectedConversationId}-${optimisticId}`;
      const res = await fetchWithRetry(
        `/api/ops/conversations/${selectedConversationId}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, idempotency_key: idem }),
        },
        { timeoutMs: OPS_CLIENT_TIMEOUT_MS },
      );
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !out.ok) {
        setOptimisticMessages((cur) =>
          cur.map((m) => (m.id === optimisticId ? { ...m, clientStatus: "failed" as const } : m)),
        );
        toast.error(localizeApiError(out.error) || "تعذر إرسال الرد.");
        return;
      }
      toast.success("تم إرسال الرد بنجاح.");
      setOptimisticMessages((cur) => cur.filter((m) => m.id !== optimisticId));
      scrollToLatest();
      softRefresh();
    } catch {
      setOptimisticMessages((cur) =>
        cur.map((m) => (m.id === optimisticId ? { ...m, clientStatus: "failed" as const } : m)),
      );
      toast.error("تعذر الاتصال بالشبكة.");
    } finally {
      outboundReplyInFlightRef.current = false;
      setIsSending(false);
    }
  }

  async function sendReply() {
    if (isSending || outboundReplyInFlightRef.current) return;
    if (!selectedConversationId) return toast.error("اختر محادثة أولًا.");
    const text = draft.trim();
    if (!text) return toast.error("اكتب رسالة قبل الإرسال.");

    const optimisticId = -Date.now();
    const optimisticMsg: UiMessage = {
      id: optimisticId,
      direction: "outbound",
      text,
      created_at: DateTime.utc().toISO() ?? "",
      clientStatus: "pending",
    };
    setOptimisticMessages((cur) => [...cur, optimisticMsg]);
    setDraft("");
    scrollToLatest();
    await postOutboundReply(text, optimisticId);
  }

  function retryFailedOutbound(msg: UiMessage) {
    if (msg.direction !== "outbound" || !msg.clientStatus) return;
    if (outboundReplyInFlightRef.current) return;
    scrollToLatest();
    void postOutboundReply(msg.text, msg.id);
  }

  function appendDraftLine(line: string) {
    setDraft((d) => {
      const cur = d.trim();
      const next = cur ? `${cur}\n${line}` : line;
      return next;
    });
    replyRef.current?.focus();
  }

  async function sendTemplate(overrideKey?: string) {
    if (isSending) return;
    if (!selectedConversationId) return toast.error("اختر محادثة أولًا.");
    const key = overrideKey ?? templateKey;
    setIsSending(true);
    try {
      const res = await fetchWithRetry(
        `/api/ops/conversations/${selectedConversationId}/template`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template_key: key,
            idempotency_key: `template-${selectedConversationId}-${key}-${Date.now()}`,
          }),
        },
        { timeoutMs: OPS_CLIENT_TIMEOUT_MS },
      );
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !out.ok) {
        toast.error(localizeApiError(out.error) || "تعذر إرسال القالب.");
        return;
      }
      toast.success("تم إرسال القالب.");
      softRefresh();
    } catch (e) {
      toast.error("تعذر الاتصال بالشبكة.");
    } finally {
      setIsSending(false);
    }
  }

  async function conversationAction(payload: Record<string, unknown>, successMsg: string) {
    if (!selectedConversationId) return toast.error("اختر محادثة أولًا.");
    try {
      const res = await fetchWithRetry(`/api/ops/conversations/${selectedConversationId}/actions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: `action-${selectedConversationId}-${Date.now()}`,
          ...payload,
        }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !out.ok) return toast.error(localizeApiError(out.error) || "تعذر تنفيذ الإجراء.");
      toast.success(successMsg);
      softRefresh();
    } catch (e) {
      toast.error("تعذر الاتصال بالشبكة.");
    }
  }

  async function suggestAiReply() {
    if (!selectedConversationId) return toast.error("اختر محادثة أولًا.");
    const lastInbound = [...messages].reverse().find((m) => m.direction !== "outbound")?.text ?? "";
    const seedText = draft.trim() || lastInbound;
    if (!seedText) return toast.error("لا يوجد نص كافٍ لتوليد اقتراح.");
    setIsSuggesting(true);
    try {
      const res = await fetchWithRetry(`/api/ops/conversations/${selectedConversationId}/ai-suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: seedText }),
      });
      const out = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        interpret?: { summary?: string; intent?: string; needs_human?: boolean };
        error?: string;
      };
      if (!res.ok || !out.ok || !out.interpret) {
        toast.error(localizeApiError(out.error) || "تعذر توليد اقتراح الذكاء.");
        return;
      }
      const suggestion = out.interpret.summary
        ? `${out.interpret.summary}`
        : out.interpret.intent
          ? `اقتراح رد بناءً على النية: ${out.interpret.intent}`
          : "تم توليد اقتراح عام من الذكاء الاصطناعي.";
      setDraft(suggestion);
      toast.success("تم توليد اقتراح الذكاء.");
    } catch (e) {
      toast.error("تعذر الاتصال بالشبكة.");
    } finally {
      setIsSuggesting(false);
    }
  }

  async function executeSuggestedAction(action: SuggestedDecisionAction, decision: "confirm" | "reject") {
    if (!selectedConversationId) return toast.error("اختر محادثة أولًا.");
    if (!action.id) return toast.error("الاقتراح غير صالح.");
    setDecisionActionId(`${action.id}:${decision}`);
    try {
      const res = await fetchWithRetry("/api/ops/decision/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: selectedConversationId,
          action_id: action.id,
          decision,
        }),
      });
      const out = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        reason?: string[];
        appointment_id?: number;
        bridge_send_ok?: boolean;
        queued_outbox_id?: number | null;
        error?: string;
      };
      if (out.status === "blocked") {
        setBlockedReasons(out.reason ?? []);
        toast.error("لا يمكن تنفيذ الاقتراح الحالي. حدّث الاقتراح ثم أعد المحاولة.");
        return;
      }
      if (!res.ok || !out.ok) {
        toast.error(localizeApiError(out.error) || "تعذر تنفيذ الاقتراح.");
        return;
      }
      setBlockedReasons(null);
      if (decision === "reject") {
        toast.success("تم رفض الاقتراح.");
      } else if (out.bridge_send_ok === false && out.queued_outbox_id) {
        toast.success("تم إنشاء الموعد وتمت جدولة رسالة التأكيد عبر الطابور.");
      } else if (out.appointment_id) {
        toast.success("تم تأكيد الموعد وإرسال رسالة واتساب.");
      } else {
        toast.success("تم تنفيذ الاقتراح.");
      }
      softRefresh();
    } catch {
      toast.error("تعذر الاتصال بالشبكة.");
    } finally {
      setDecisionActionId(null);
    }
  }

  async function regenerateSuggestion() {
    if (!selectedConversationId) return toast.error("اختر محادثة أولًا.");
    setIsRegeneratingSuggestion(true);
    try {
      const res = await fetchWithRetry("/api/ops/decision/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: selectedConversationId,
        }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !out.ok) {
        toast.error(localizeApiError(out.error) || "تعذر تحديث الاقتراح.");
        return;
      }
      setBlockedReasons(null);
      toast.success("تم تحديث الاقتراح بناءً على أحدث المواعيد.");
      softRefresh();
    } catch {
      toast.error("تعذر الاتصال بالشبكة.");
    } finally {
      setIsRegeneratingSuggestion(false);
    }
  }

  async function submitDecisionFeedback(isCorrect: boolean) {
    if (!selectedConversationId) return toast.error("اختر محادثة أولًا.");
    setIsSubmittingFeedback(true);
    try {
      const payload: Record<string, unknown> = {
        conversation_id: selectedConversationId,
        is_correct: isCorrect,
        reviewed_by: "ops_staff",
      };
      if (!isCorrect) {
        payload.corrected_decision = correctedDecision;
        payload.corrected_severity = Math.max(1, Math.min(5, Number(correctedSeverity) || 3));
        if (showMedicalQaPanel) {
          payload.corrected_medical_signals = correctedMedicalSignals;
          payload.corrected_primary_signal = correctedPrimarySignal === "none" ? null : correctedPrimarySignal;
          payload.corrected_patient_context = correctedPatientContext;
        }
        if (feedbackNote.trim()) payload.note = feedbackNote.trim();
      }
      const res = await fetchWithRetry("/api/ops/decision/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !out.ok) {
        toast.error(localizeApiError(out.error) || "تعذر حفظ تقييم القرار.");
        return;
      }
      toast.success(isCorrect ? "تم تسجيل أن القرار صحيح." : "تم حفظ تصحيح القرار.");
      setFeedbackOpen(false);
      softRefresh();
    } catch {
      toast.error("تعذر الاتصال بالشبكة.");
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  function toggleCorrectedSignal(key: MedicalSignalKey) {
    setCorrectedMedicalSignals((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleCorrectedPatientContext(key: keyof typeof PATIENT_CONTEXT_LABELS) {
    setCorrectedPatientContext((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function timelineToneClass(tone: TimelineTone): string {
    if (tone === "danger") return "border-danger/40 bg-danger/5";
    if (tone === "warning") return "border-warning/50 bg-warning/10";
    if (tone === "success") return "border-emerald-500/40 bg-emerald-500/5";
    return "border-border/70 bg-muted/20";
  }

  function onDraftKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    if (e.shiftKey) return;
    e.preventDefault();
    void sendReply();
  }

  function onConversationListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!tabRows.length) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const idx = Math.max(0, tabRows.findIndex((r) => r.conversation_id === selectedConversationId));
    const next = e.key === "ArrowDown" ? Math.min(tabRows.length - 1, idx + 1) : Math.max(0, idx - 1);
    const id = tabRows[next]?.conversation_id;
    if (id) router.push(`/inbox/${id}`);
  }

  return (
    <div className="grid h-full min-h-0 flex-1 gap-cg-4 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)_320px]">
      <WorkspacePanel
        title="المحادثات"
        subtitle={isDoctorMode ? "تركيز على المريض — قائمة مُبسّطة" : "Scan سريع حسب الأولوية"}
        className="flex min-h-0 flex-col"
        contentClassName="flex min-h-0 flex-col p-cg-0"
      >
        <div className={cn("flex flex-col gap-cg-3", isCompact ? "p-cg-3" : "p-cg-4")}>
          <Input
            ref={queryRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في المحادثات... (/) "
          />
          <Tabs value={inboxTab} onValueChange={setInboxTab}>
            <TabsList className="w-full">
              <TabsTrigger value="all">الكل</TabsTrigger>
              <TabsTrigger value="unread">غير المقروءة</TabsTrigger>
              <TabsTrigger value="urgent">العاجلة</TabsTrigger>
              <TabsTrigger value="bookings">الحجوزات</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div
          ref={listRef}
          tabIndex={0}
          onKeyDown={onConversationListKeyDown}
          className={cn(
            "flex-1 overflow-auto border-t border-border/60 outline-none focus:ring-2 focus:ring-primary/30",
            isCompact ? "p-cg-1.5" : "p-cg-2",
          )}
        >
          {tabRows.length === 0 ? (
            <p className="p-cg-3 text-ds-body text-muted-foreground">لا توجد محادثات في هذا التبويب.</p>
          ) : (
            <div className="flex flex-col gap-cg-1">
              {tabRows.map((item) => {
                const isActive = item.conversation_id === selectedThread?.conversation_id;
                const urgent = inboxRowIsUrgent(item);
                const primaryBadge = rowPrimaryBadge(item);
                return (
                  <Link
                    key={item.conversation_id}
                    href={`/inbox/${item.conversation_id}`}
                    className={cn(
                      "block rounded-2xl border transition",
                      isCompact ? "px-cg-2 py-cg-1.5" : "px-cg-3 py-cg-2",
                      isActive ? "border-primary bg-primary/5" : "border-border/80 hover:bg-muted/40",
                      urgent ? "border-danger/40 bg-danger/5" : "",
                    )}
                  >
                    <div className="flex items-start justify-between gap-cg-2">
                      <div className="min-w-0">
                        <p className="truncate text-ds-body font-semibold">{item.display_name ?? item.chat_id}</p>
                        <p className="mt-cg-1 line-clamp-1 text-ds-small text-muted-foreground">{item.last_message ?? "لا يوجد معاينة للرسالة."}</p>
                      </div>
                      <span className="shrink-0 text-ds-label text-muted-foreground">{formatRelativeAge(item.last_message_at ?? null)}</span>
                    </div>
                    <div className="mt-cg-2 flex flex-wrap items-center gap-cg-1">
                      {primaryBadge ? <Badge variant={primaryBadge.variant}>{primaryBadge.label}</Badge> : null}
                      {item.unread ? <Badge variant="warning">غير مقروءة</Badge> : null}
                      {item.status ? <Badge variant="outline">{statusLabel(item.status)}</Badge> : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        title={detail?.display_name ?? selectedThread?.display_name ?? selectedThread?.chat_id ?? "المحادثة"}
        subtitle={selectedThread ? statusLabel(detail?.status ?? selectedThread?.status ?? "active") : "اختر محادثة"}
        right={<Badge variant="secondary">الذكاء مفعل</Badge>}
        className="flex min-h-0 flex-col"
        contentClassName="flex min-h-0 flex-col p-cg-0"
      >
        <div className="sticky top-0 z-10 border-b border-border/60 bg-background/80 px-cg-4 py-cg-3 backdrop-blur-sm">
          <div className="flex items-center gap-cg-3">
            <Avatar>
              <AvatarFallback>{(selectedThread?.display_name ?? "P").slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-ds-body font-semibold">
                {detail?.display_name ?? selectedThread?.display_name ?? selectedThread?.chat_id ?? "اختر محادثة"}
              </p>
              <p className="mt-cg-1 truncate text-ds-small text-muted-foreground" dir="ltr">
                {formatPatientContactLine(detail?.phone_e164, selectedThread?.chat_id ?? detail?.chat_id)}
              </p>
              {lastSyncAt != null ? (
                <p className="mt-cg-1 text-ds-label text-muted-foreground">آخر مزامنة {formatSyncClock(lastSyncAt)}</p>
              ) : null}
            </div>
          </div>
          {conversationStateBadges.length ? (
            <div className="mt-cg-2 flex flex-wrap gap-cg-1">
              {conversationStateBadges.map((b) => (
                <Badge key={b.label} variant={b.tone}>
                  {b.label}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        {showEmergencyBanner ? (
          <div
            role="alert"
            className="mb-cg-3 rounded-xl border border-danger/50 bg-danger/10 px-cg-3 py-cg-2 text-ds-body text-danger"
          >
            حالة عاجلة — يجب الرد فورًا
          </div>
        ) : null}

        {showUncertainEmergencyBanner ? (
          <div className="mb-cg-3 rounded-xl border border-warning/50 bg-warning/10 px-cg-3 py-cg-3 text-ds-body">
            <p className="font-medium text-foreground">⚠️ حالة طارئة غير مؤكدة</p>
            <p className="mt-cg-1 text-ds-small text-muted-foreground">
              النظام رصد احتمال طوارئ بثقة منخفضة. تم رفع الأولوية للحالة مع إيقاف أي تصعيد آلي خطر حتى مراجعة الفريق.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-cg-3"
              onClick={() => conversationAction({ mark_unread: true }, "تم تعليم الحالة كمراجعة سريعة للفريق.")}
            >
              تحويل لمراجعة سريعة
            </Button>
          </div>
        ) : null}

        {lastEmergencyEvent?.status ? (
          <div className="mb-cg-3 rounded-xl border border-danger/40 bg-danger/5 px-cg-3 py-cg-2 text-ds-small text-danger">
            <p className="font-medium">🚑 حالة طارئة (Priority override)</p>
            <p className="mt-cg-1">
              {lastEmergencyEvent.status === "allocated" ? "تم تفعيل مسار الطوارئ وإنشاء موعد بأولوية قصوى." : "تم تصعيد الحالة يدويًا للفريق الطبي."}
            </p>
            {lastEmergencyEvent.outcome === "allocated_next_day_override" ? (
              <p className="mt-cg-1 text-ds-label">تم تفعيل استثناء عدم توفر شاغر اليوم وتخصيص أقرب موعد لاحق.</p>
            ) : null}
            {lastEmergencyEvent.bumped_count ? (
              <p className="mt-cg-1 text-ds-label">
                تم إعادة جدولة {lastEmergencyEvent.bumped_count} مريض، وإشعار {lastEmergencyEvent.bumped_notified ?? 0}.
              </p>
            ) : null}
          </div>
        ) : null}

        {lastDecision?.type ? (
          <div className="mb-cg-3 rounded-xl border border-border bg-muted/40 px-cg-3 py-cg-2 text-ds-body">
            <p className="font-medium text-foreground">قرار النظام</p>
            {showUncertainEmergencyBanner ? (
              <p className="mt-cg-1 text-ds-small text-warning">وضع حذر مفعل: طوارئ محتملة غير مؤكدة.</p>
            ) : null}
            <p className="mt-cg-1 text-ds-small text-muted-foreground">
              النوع: <span className="font-mono text-foreground">{lastDecision.type}</span>
              {lastDecision.priority != null ? (
                <>
                  {" "}
                  · الأولوية: <span className="font-mono text-foreground">{lastDecision.priority}</span>
                </>
              ) : null}
            </p>
            {lastDecision.actions?.length ? (
              <p className="mt-cg-1 text-ds-small text-muted-foreground">
                الإجراءات: <span className="font-mono text-foreground">{lastDecision.actions.join(", ")}</span>
              </p>
            ) : null}
            {lastDecision.reason ? (
              <p className="mt-cg-1 text-ds-small text-muted-foreground">
                السبب: <span className="text-foreground">{lastDecision.reason}</span>
              </p>
            ) : null}
            {localizeMedicalReason(lastDecision.primary_medical_reason ?? lastDecision.reason ?? null) ? (
              <p className="mt-cg-1 text-ds-small text-muted-foreground">
                السبب الطبي:{" "}
                <span className="text-foreground">
                  {localizeMedicalReason(lastDecision.primary_medical_reason ?? lastDecision.reason ?? null)}
                </span>
              </p>
            ) : null}
            {lastDecision.risk_score != null ? (
              <p className="mt-cg-1 text-ds-small text-muted-foreground">
                مؤشر الخطر: <span className="font-mono text-foreground">{lastDecision.risk_score}</span>
              </p>
            ) : null}
            {showMedicalQaPanel ? (
              <div className="mt-cg-2 rounded-lg border border-border/70 bg-background/70 p-cg-2 text-ds-small">
                <p className="font-medium text-foreground">🩺 الإشارات الطبية</p>
                <div className="mt-cg-2 flex flex-wrap gap-cg-1">
                  {activeMedicalSignals.length === 0 ? (
                    <span className="text-muted-foreground">لا توجد إشارات طبية واضحة.</span>
                  ) : (
                    activeMedicalSignals.map((k) => {
                      const isPrimary = lastDecision.primary_medical_reason === k;
                      return (
                        <Badge
                          key={k}
                          variant={isPrimary ? "danger" : "outline"}
                          className={isPrimary ? "font-medium" : "opacity-70"}
                        >
                          {isPrimary ? "🚑 " : "⚠️ "}
                          {MEDICAL_SIGNAL_LABELS[k]}
                          {isPrimary ? " (أساسي)" : " (ثانوي)"}
                        </Badge>
                      );
                    })
                  )}
                </div>
                <p className="mt-cg-2 text-muted-foreground">سياق المريض:</p>
                <div className="mt-cg-1 flex flex-wrap gap-cg-1">
                  {activePatientContext.length === 0 ? (
                    <span className="text-muted-foreground">غير متوفر.</span>
                  ) : (
                    activePatientContext.map((k) => (
                      <Badge key={k} variant="secondary">
                        {PATIENT_CONTEXT_LABELS[k]}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            ) : null}
            <div className="mt-cg-2 flex flex-wrap gap-cg-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => submitDecisionFeedback(true)}
                disabled={isSubmittingFeedback}
              >
                ✔️ القرار صحيح
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFeedbackOpen((v) => !v)}
                disabled={isSubmittingFeedback}
              >
                ✏️ تصحيح الفهم الطبي
              </Button>
            </div>
            {feedbackOpen ? (
              <div className="mt-cg-2 flex flex-col gap-cg-2 rounded-lg border border-border/70 bg-background/70 p-cg-2 text-ds-small">
                <div className="grid gap-cg-2 md:grid-cols-2">
                  <div>
                    <p className="mb-cg-1 text-muted-foreground">التصنيف المصحح</p>
                    <Select value={correctedDecision} onValueChange={(v) => setCorrectedDecision(v as "EMERGENCY" | "BOOKING" | "NORMAL" | "UNKNOWN")}>
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EMERGENCY">EMERGENCY</SelectItem>
                        <SelectItem value="BOOKING">BOOKING</SelectItem>
                        <SelectItem value="NORMAL">NORMAL</SelectItem>
                        <SelectItem value="UNKNOWN">UNKNOWN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="mb-cg-1 text-muted-foreground">Severity المصحح (1..5)</p>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={correctedSeverity}
                      onChange={(e) => setCorrectedSeverity(e.target.value)}
                      className="h-8"
                    />
                  </div>
                </div>
                {showMedicalQaPanel ? (
                  <>
                    <div>
                      <p className="mb-cg-1 text-muted-foreground">تصحيح الإشارات الطبية</p>
                      <div className="flex flex-wrap gap-cg-1">
                        {MEDICAL_SIGNAL_KEYS.map((k) => (
                          <Button
                            key={k}
                            type="button"
                            variant={correctedMedicalSignals[k] ? "danger" : "outline"}
                            size="sm"
                            className="h-7 px-cg-2 text-ds-label"
                            onClick={() => toggleCorrectedSignal(k)}
                          >
                            {MEDICAL_SIGNAL_LABELS[k]}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-cg-1 text-muted-foreground">الإشارة الأساسية المصححة</p>
                      <Select value={correctedPrimarySignal} onValueChange={(v) => setCorrectedPrimarySignal(v as MedicalSignalKey | "none")}>
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">بدون إشارة أساسية</SelectItem>
                          {MEDICAL_SIGNAL_KEYS.map((k) => (
                            <SelectItem key={k} value={k}>
                              {MEDICAL_SIGNAL_LABELS[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <p className="mb-cg-1 text-muted-foreground">تصحيح سياق المريض</p>
                      <div className="flex flex-wrap gap-cg-1">
                        {(Object.keys(PATIENT_CONTEXT_LABELS) as Array<keyof typeof PATIENT_CONTEXT_LABELS>).map((k) => (
                          <Button
                            key={k}
                            type="button"
                            variant={correctedPatientContext[k] ? "secondary" : "outline"}
                            size="sm"
                            className="h-7 px-cg-2 text-ds-label"
                            onClick={() => toggleCorrectedPatientContext(k)}
                          >
                            {PATIENT_CONTEXT_LABELS[k]}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
                <Textarea
                  rows={2}
                  placeholder="ملاحظة المراجع (اختياري)"
                  value={feedbackNote}
                  onChange={(e) => setFeedbackNote(e.target.value)}
                />
                <Button size="sm" onClick={() => submitDecisionFeedback(false)} disabled={isSubmittingFeedback}>
                  {isSubmittingFeedback ? "جار الحفظ..." : "حفظ التصحيح"}
                </Button>
              </div>
            ) : null}
            {lastDecisionFeedback?.reviewed_at ? (
              <p className="mt-cg-2 text-ds-label text-muted-foreground">
                آخر مراجعة: {lastDecisionFeedback.is_correct ? "صحيح" : "مصحح"} · {lastDecisionFeedback.reviewed_by ?? "ops_staff"} ·{" "}
                {formatArabicDate(lastDecisionFeedback.reviewed_at)}
                {lastDecisionFeedback.mismatch_detected ? " · يوجد اختلاف إشارات طبية" : ""}
              </p>
            ) : null}
          </div>
        ) : null}

        {pendingSuggestedActions.length > 0 ? (
          <div className="mb-cg-3 rounded-xl border border-primary/40 bg-primary/5 px-cg-3 py-cg-3 text-ds-body">
            <p className="font-medium text-foreground">اقتراحات التنفيذ</p>
            <div className="mt-cg-2 flex flex-col gap-cg-2">
              {pendingSuggestedActions.map((action) => (
                <div key={action.id} className="rounded-lg border border-border/70 bg-background/80 p-cg-2">
                  <p className="text-ds-small text-muted-foreground">
                    النوع: <span className="font-mono text-foreground">{action.type}</span>
                  </p>
                  {action.payload?.suggested_time ? (
                    <p className="mt-cg-1 text-ds-small text-muted-foreground">
                      الوقت المقترح: <span className="font-mono text-foreground">{formatArabicDate(action.payload.suggested_time)}</span>
                    </p>
                  ) : null}
                  {action.payload?.doctor_name ? (
                    <p className="mt-cg-1 text-ds-small text-muted-foreground">
                      الطبيب: <span className="text-foreground">{action.payload.doctor_name}</span>
                    </p>
                  ) : null}
                  <div className="mt-cg-2 flex items-center gap-cg-2">
                    <Button
                      size="sm"
                      onClick={() => executeSuggestedAction(action, "confirm")}
                      disabled={decisionActionId != null}
                    >
                      <Check className="h-4 w-4" />
                      {decisionActionId === `${action.id}:confirm` ? "جار التأكيد..." : "تأكيد الحجز"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => executeSuggestedAction(action, "reject")}
                      disabled={decisionActionId != null}
                    >
                      <X className="h-4 w-4" />
                      {decisionActionId === `${action.id}:reject` ? "جار الرفض..." : "رفض"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {effectiveBlockedReasons.length > 0 ? (
          <div className="mb-cg-3 rounded-xl border border-warning/50 bg-warning/10 px-cg-3 py-cg-3 text-ds-body">
            <p className="font-medium text-foreground">لا يمكن تنفيذ الاقتراح الحالي</p>
            <ul className="mt-cg-2 list-disc flex flex-col gap-cg-1 ps-cg-5 text-ds-small text-muted-foreground">
              {effectiveBlockedReasons.map((r) => (
                <li key={r}>{localizeDecisionBlockedReason(r)}</li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              className="mt-cg-3"
              onClick={regenerateSuggestion}
              disabled={isRegeneratingSuggestion}
            >
              {isRegeneratingSuggestion ? "جار تحديث الاقتراح..." : "تحديث الاقتراح"}
            </Button>
          </div>
        ) : null}

        {lastDecisionExecution?.action_id ? (
          <div className="mb-cg-3 rounded-xl border border-border/70 bg-muted/30 px-cg-3 py-cg-2 text-ds-small text-muted-foreground">
            آخر تنفيذ: <span className="font-mono text-foreground">{lastDecisionExecution.action_type ?? "N/A"}</span>
            {" · "}
            <span className="text-foreground">{lastDecisionExecution.decision}</span>
            {" · "}
            <span className="text-foreground">{lastDecisionExecution.status}</span>
            {lastDecisionExecution.appointment_id ? (
              <>
                {" · "}
                موعد #{lastDecisionExecution.appointment_id}
              </>
            ) : null}
          </div>
        ) : null}

        {timelineItems.length > 0 ? (
          <div className="mb-cg-3 rounded-xl border border-border/70 bg-background/70 px-cg-3 py-cg-3 text-ds-body">
            <div className="mb-cg-2 flex items-center justify-between gap-cg-2">
              <p className="font-medium text-foreground">Decision Timeline</p>
              <Button
                variant="outline"
                size="sm"
                onClick={regenerateSuggestion}
                disabled={isRegeneratingSuggestion}
              >
                {isRegeneratingSuggestion ? "جار إعادة التقييم..." : "🔄 إعادة التحليل"}
              </Button>
            </div>
            <div className="flex flex-col gap-cg-2">
              {timelineItems.map((item) => (
                <div key={item.id} className={`rounded-lg border px-cg-3 py-cg-2 ${timelineToneClass(item.tone)}`}>
                  <p className="text-ds-small font-medium text-foreground">{item.title}</p>
                  {item.ts ? <p className="mt-cg-1 text-ds-label text-muted-foreground">{formatArabicDate(item.ts)}</p> : null}
                  <div className="mt-cg-1 flex flex-col gap-cg-1 text-ds-small text-muted-foreground">
                    {item.lines.map((line) => (
                      <p key={`${item.id}:${line}`}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="sticky top-0 z-10 border-b border-border/60 bg-background/80 px-cg-4 py-cg-2 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-cg-2">
            <div className="min-w-0">
              <p className="truncate text-ds-body font-semibold text-foreground">
                {detail?.display_name ?? selectedThread?.display_name ?? selectedThread?.chat_id ?? "—"}
              </p>
              <p className="text-ds-label text-muted-foreground">
                آخر نشاط: <span className="font-medium text-foreground">{formatRelativeAge(selectedThread?.last_message_at ?? null)}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-cg-1">
              {patientFlowBadges.map((b) => (
                <Badge key={`flow:${b.label}`} variant={b.variant}>
                  {b.label}
                </Badge>
              ))}
              {conversationStateBadges.map((b) => (
                <Badge key={`state:${b.label}`} variant={b.tone}>
                  {b.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div
          ref={messagesScrollRef}
          className="min-h-0 flex-1 overflow-auto px-cg-4 pe-cg-4"
          style={{ contain: "strict", willChange: "transform" }}
        >
          {renderedMessages.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-cg-6 text-center text-ds-body text-muted-foreground">
              اختر محادثة لعرض السجل الكامل.
            </div>
          )}
          {renderedMessages.length > 0 ? (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((v) => {
                const item = renderItems[v.index];
                if (!item) return null;
                if (item.kind === "separator") {
                  return (
                    <div
                      key={item.id}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${v.start}px)`,
                      }}
                    >
                      <div className="my-cg-2 flex items-center justify-center">
                        <span className="rounded-full border border-border/60 bg-background/80 px-cg-3 py-cg-1 text-ds-label text-muted-foreground">
                          {item.label}
                        </span>
                      </div>
                    </div>
                  );
                }

                if (item.kind === "cluster") {
                  return (
                    <div
                      key={item.id}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${v.start}px)`,
                      }}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-cg-2 px-cg-1",
                          item.lane === "outbound" ? "justify-end" : "justify-start",
                        )}
                      >
                        {item.lane === "outbound" ? (
                          <>
                            <span className="text-ds-label font-medium text-muted-foreground">🟢 أنت</span>
                            <span className="size-2 shrink-0 rounded-full bg-primary" />
                          </>
                        ) : (
                          <>
                            <span className="size-2 shrink-0 rounded-full bg-muted-foreground/50" />
                            <span className="text-ds-label font-medium text-muted-foreground">👤 المريض</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                }

                const message = item.message;
                const outbound = message.direction === "outbound";
                const prevItem = v.index > 0 ? renderItems[v.index - 1] : undefined;
                const topMt = messageBubbleTopMargin(prevItem, message);
                const isOptimistic = message.id < 0;
                const pending = isOptimistic && message.clientStatus === "pending";
                const failed = isOptimistic && message.clientStatus === "failed";
                return (
                  <div
                    key={message.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${v.start}px)`,
                    }}
                  >
                    <div
                      className={cn(
                        "max-w-[70%] rounded-2xl p-cg-3 text-ds-body transition-opacity duration-200 ease-out",
                        outbound ? "ms-auto bg-primary text-primary-foreground" : "bg-muted",
                        topMt,
                        pending ? "opacity-60" : "opacity-100",
                        failed ? "ring-2 ring-danger/60" : "",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{message.text}</p>
                      <div
                        className={cn(
                          "mt-cg-2 flex flex-wrap items-center gap-cg-1 text-ds-label",
                          outbound ? "text-primary-foreground/80" : "text-muted-foreground",
                        )}
                      >
                        <span>{formatArabicDate(message.created_at)}</span>
                        {!outbound && message.intent ? <Badge variant="outline">{message.intent}</Badge> : null}
                        {!outbound && message.is_urgent ? <Badge variant="danger">عاجل</Badge> : null}
                        {pending ? <Badge variant="outline">جار الإرسال…</Badge> : null}
                        {failed ? (
                          <>
                            <Badge variant="danger">فشل الإرسال</Badge>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 border-danger/50 text-danger"
                              onClick={() => retryFailedOutbound(message)}
                              disabled={isSending}
                            >
                              <RotateCcw className="me-1 h-3 w-3" />
                              إعادة
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 border-t border-border/60 bg-background/85 px-cg-4 py-cg-4 backdrop-blur-sm">
          <div className="flex flex-col gap-cg-3">
            {!isDoctorMode ? (
              <div className="flex items-center gap-cg-2 text-ds-small text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span>اقتراح الرد بالذكاء متاح من «أدوات» أو من لوحة القرار أعلاه.</span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-cg-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-cg-1">
                    <MoreHorizontal className="h-4 w-4 shrink-0 opacity-90" />
                    إدارة المحادثة
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[13rem]">
                  <DropdownMenuItem
                    onClick={() => void conversationAction({ mark_unread: true }, "تم تعليم المحادثة كغير مقروءة.")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    تعليم كغير مقروءة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void conversationAction({ archive: true }, "تمت أرشفة المحادثة.")}>
                    <Archive className="h-4 w-4" />
                    أرشفة
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {!isDoctorMode ? (
                <Select
                  value={assignedDoctorId}
                  onValueChange={(value) => {
                    setAssignedDoctorId(value);
                    if (value !== "none") void conversationAction({ assign_doctor_id: Number(value) }, "تم إسناد المحادثة.");
                  }}
                >
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="إسناد طبيب" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون إسناد</SelectItem>
                    {doctorOptions.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
            {!isDoctorMode ? (
              <div className="flex flex-wrap items-center gap-cg-2 text-ds-small text-muted-foreground">
                <span className="text-ds-label shrink-0">اختصارات الرد</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-cg-1"
                  onClick={() =>
                    appendDraftLine("هل ترغب بتحديد موعد؟ أرسل اليوم والوقت المناسبين وسنؤكد لك فورًا.")
                  }
                  disabled={isSending || !selectedConversationId}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  حجز
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-cg-1 border-danger/40 text-danger hover:bg-danger/10"
                  onClick={() =>
                    appendDraftLine(
                      "للحالات العاجلة: إذا كانت الحالة خطيرة يرجى الاتصال مباشرة أو إيضاح الأعراض بوضوح.",
                    )
                  }
                  disabled={isSending || !selectedConversationId}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  طارئ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-cg-1"
                  onClick={() => appendDraftLine("شكرًا لتواصلك — نراجع طلبك وسنعود لك خلال دقائق.")}
                  disabled={isSending || !selectedConversationId}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  مراجعة
                </Button>
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-cg-1">
                    <MessageSquare className="h-4 w-4 shrink-0 opacity-90" />
                    عبارات جاهزة
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[16rem]">
                  <DropdownMenuItem
                    onClick={() =>
                      appendDraftLine("هل ترغب بتحديد موعد؟ أرسل اليوم والوقت المناسبين وسنؤكد لك فورًا.")
                    }
                    disabled={isSending || !selectedConversationId}
                  >
                    إدراج نص حجز
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      appendDraftLine(
                        "للحالات العاجلة: إذا كانت الحالة خطيرة يرجى الاتصال مباشرة أو إيضاح الأعراض بوضوح.",
                      )
                    }
                    disabled={isSending || !selectedConversationId}
                  >
                    إدراج نص طارئ
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => appendDraftLine("شكرًا لتواصلك — نراجع طلبك وسنعود لك خلال دقائق.")}
                    disabled={isSending || !selectedConversationId}
                  >
                    إدراج متابعة
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          <Textarea
            ref={replyRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onDraftKeyDown}
            placeholder="اكتب ردًا واضحًا أو أضف قالبًا أو ملاحظة... (Enter للإرسال، Shift+Enter لسطر جديد)"
          />
          {!draft.trim() && lastDecision?.type ? (
            <p className="text-ds-small text-muted-foreground">
              تلميح سريع: القرار الحالي <span className="font-mono text-foreground">{lastDecision.type}</span> — اكتب ردًا مباشرًا قصيرًا لتسريع التنفيذ.
            </p>
          ) : null}
          <div className="flex flex-wrap items-end justify-between gap-cg-3">
            <div className="flex flex-wrap items-center gap-cg-2">
              {!isDoctorMode ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => void suggestAiReply()} disabled={isSuggesting || isSending}>
                    <Bot className="h-4 w-4" />
                    {isSuggesting ? "جار التحليل..." : "اقتراح ذكي"}
                  </Button>
                  <Select value={templateKey} onValueChange={setTemplateKey}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="القالب" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="welcome">ترحيب</SelectItem>
                      <SelectItem value="ask_name">طلب الاسم</SelectItem>
                      <SelectItem value="ask_doctor">طلب الطبيب</SelectItem>
                      <SelectItem value="ask_time">طلب الوقت</SelectItem>
                      <SelectItem value="closed_hours">خارج أوقات الدوام</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => void sendTemplate()} disabled={isSending || !selectedConversationId}>
                    إرسال القالب
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDraft("شكرًا لتواصلك معنا. تم استلام طلبك وسنعود لك خلال دقائق.")}
                    disabled={isSending}
                  >
                    رد سريع
                  </Button>
                </>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="gap-cg-1">
                      <Bot className="h-4 w-4" />
                      أدوات
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[12rem]">
                    <DropdownMenuItem onClick={() => void suggestAiReply()} disabled={isSuggesting || isSending}>
                      {isSuggesting ? "جار التحليل..." : "اقتراح ذكي"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void sendTemplate("welcome")} disabled={isSending || !selectedConversationId}>
                      إرسال ترحيب
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void sendTemplate("ask_time")} disabled={isSending || !selectedConversationId}>
                      إرسال طلب وقت
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void sendTemplate("closed_hours")} disabled={isSending || !selectedConversationId}>
                      إرسال خارج الدوام
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setDraft("شكرًا لتواصلك معنا. تم استلام طلبك وسنعود لك خلال دقائق.")}
                      disabled={isSending}
                    >
                      إدراج رد سريع
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={() => void sendReply()}
              disabled={isSending || !selectedConversationId}
            >
              <Send className="h-4 w-4" />
              {isSending ? "جار الإرسال..." : "إرسال"}
            </Button>
          </div>
        </div>
        </div>
      </WorkspacePanel>

      <WorkspacePanel title="السياق" subtitle="ملخص سريع للحالة والملف" className="h-fit" contentClassName="p-cg-4">
        <div className="flex flex-col gap-cg-3 text-ds-body">
          <div className="rounded-xl bg-muted/50 p-cg-3">
            <p className="text-ds-small text-muted-foreground">الاسم</p>
            <p className="font-medium">{detail?.display_name ?? selectedThread?.display_name ?? "غير معروف"}</p>
          </div>
          {contextContactLine !== "—" ? (
            <div className="rounded-xl bg-muted/50 p-cg-3">
              <p className="text-ds-small text-muted-foreground">📞 واتساب / هاتف</p>
              <p dir="ltr" className="font-mono font-medium">
                {contextContactLine}
              </p>
              {contactIsLidWithoutPhone ? (
                <p className="mt-cg-2 text-ds-label text-warning">
                  المعروض معرّف واتساب داخلي (LID) وليس بالضرورة رقم الهاتف. إن وُجد رقم في ملف المريض سيظهر هنا بعد المزامنة.
                </p>
              ) : null}
            </div>
          ) : null}
          {patientFlowBadges.length > 0 ? (
            <div className="rounded-xl bg-muted/50 p-cg-3">
              <p className="mb-cg-2 text-ds-small text-muted-foreground">حالة المريض (من آخر تحليل)</p>
              <div className="flex flex-wrap gap-cg-1">
                {patientFlowBadges.map((b) => (
                  <Badge key={b.label} variant={b.variant}>
                    {b.label}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          <div className="rounded-xl bg-muted/50 p-cg-3">
            <p className="text-ds-small text-muted-foreground">حالة المحادثة</p>
            <p className="font-medium">{statusLabel(detail?.state ?? selectedThread?.state ?? "unassigned")}</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-cg-3">
            <p className="text-ds-small text-muted-foreground">آخر نشاط</p>
            <p className="font-medium text-muted-foreground">{formatRelativeAge(selectedThread?.last_message_at)}</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-cg-3">
            <p className="mb-cg-2 text-ds-small text-muted-foreground">ملخص الذكاء</p>
            <p className="leading-relaxed text-muted-foreground">
              {detail?.summary ?? "لا يوجد ملخص مخزَّن لهذه المحادثة."}
            </p>
          </div>
          {selectedThread?.patient_id ? (
            <div className="flex flex-col gap-cg-2">
              <Button variant="default" size="sm" className="w-full" asChild>
                <Link href={`/appointments?patient_id=${selectedThread.patient_id}`}>إنشاء موعد</Link>
              </Button>
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href={`/patients/${selectedThread.patient_id}`}>فتح الملف</Link>
              </Button>
            </div>
          ) : null}
          {selectedThread && inboxRowIsUrgent(selectedThread) ? (
            <div className="rounded-xl border border-danger/40 bg-danger/5 p-cg-3 text-ds-small text-danger">
              آخر رسالة واردة مُعلَّمة كعاجلة أو نية طوارئ — راجع السجل قبل الرد.
            </div>
          ) : null}
          <div className="rounded-xl bg-accent/10 p-cg-3 text-accent">
            <div className="mb-cg-1 flex items-center gap-cg-2">
              <MessageSquare className="h-4 w-4" />
              <span className="font-medium">ملاحظات</span>
            </div>
            <p className="text-ds-small text-muted-foreground">الحقول الداخلية للملف الكامل تظهر في صفحة المريض.</p>
          </div>
        </div>
      </WorkspacePanel>
    </div>
  );
}
