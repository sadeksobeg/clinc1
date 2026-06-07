/** Editable synonym maps for pure-rules WhatsApp normalizer (no AI). */

export type MessageIntent =
  | "BOOKING_REQUEST"
  | "DOCTOR_REQUEST"
  | "PRICE_INQUIRY"
  | "TIME_INQUIRY"
  | "AFFIRMATION"
  | "NEGATION"
  | "CANCEL_APPOINTMENT"
  | "RESCHEDULE"
  | "EMERGENCY"
  | "GREETING"
  | "THANKS"
  | "OUT_OF_CONTEXT"
  | "UNKNOWN";

/** Higher index = lower priority when resolving conflicts. */
export const INTENT_PRIORITY: MessageIntent[] = [
  "EMERGENCY",
  "CANCEL_APPOINTMENT",
  "RESCHEDULE",
  "PRICE_INQUIRY",
  "BOOKING_REQUEST",
  "DOCTOR_REQUEST",
  "TIME_INQUIRY",
  "GREETING",
  "THANKS",
  "AFFIRMATION",
  "NEGATION",
  "OUT_OF_CONTEXT",
  "UNKNOWN",
];

export const BOOKING_SYNONYMS = [
  "حجز",
  "احجز",
  "أحجز",
  "بحجز",
  "بدي أحجز",
  "بدي احجز",
  "أريد موعد",
  "اريد موعد",
  "بدي موعد",
  "عايز موعد",
  "عاوز موعد",
  "محتاج موعد",
  "أبي موعد",
  "ابي موعد",
  "أبغى موعد",
  "ابغى موعد",
  "كشف",
  "اكشف",
  "أكشف",
  "عيادة",
  "زيارة",
  "مراجعة",
  "أراجع",
  "اراجع",
  "براجع",
  "appointment",
  "book",
  "reserve",
  "حجزت",
  "حاجز",
];

export const AFFIRMATION_SYNONYMS = [
  "نعم",
  "أيوه",
  "ايوه",
  "أيوا",
  "ايوا",
  "آه",
  "اه",
  "أه",
  "اي",
  "أي",
  "يي",
  "إي",
  "تمام",
  "تمام يسلمو",
  "ماشي",
  "ماشي تمام",
  "موافق",
  "موافقة",
  "صح",
  "صحيح",
  "أكيد",
  "اكيد",
  "بالتأكيد",
  "طبعاً",
  "طبعا",
  "حسناً",
  "حسنا",
  "اوك",
  "اوكي",
  "ok",
  "okay",
  "yes",
  "يلا",
  "يلا تمام",
  "هيا",
  "اتفقنا",
  "عال",
  "عالي",
  "ممتاز",
  "حلو",
  "زين",
];

export const NEGATION_SYNONYMS = [
  "لا",
  "لأ",
  "لا شكراً",
  "لا شكرا",
  "لا مشكور",
  "مو",
  "مش",
  "ما",
  "ماأبي",
  "ما أبغى",
  "ما ابغى",
  "مو حاجة",
  "مش عارف",
  "بعدين",
  "لاحقاً",
  "لاحقا",
  "إلغاء",
  "الغاء",
  "ألغي",
  "الغِ",
  "إلغِ",
  "no",
  "nope",
  "cancel",
  "لا أريد",
  "لا اريد",
  "مش ناوي",
  "مو محتاج",
  "ما حاجة",
];

export const EMERGENCY_SYNONYMS = [
  "طوارئ",
  "إسعاف",
  "اسعاف",
  "نجدة",
  "مستعجل",
  "عاجل",
  "حالة طارئة",
  "ألم شديد",
  "الم شديد",
  "ألم قوي",
  "الم قوي",
  "وجع كثير",
  "ما أقدر أتحرك",
  "ما اقدر اتحرك",
  "تنفس",
  "اتنفس",
  "أتنفس",
  "اتنفس",
  "حادث",
  "إغماء",
  "اغماء",
  "ضيق تنفس",
  "صعوبة تنفس",
  "قلبي",
  "جلطة",
  "نزيف",
  "كسر",
  "حروق",
  "emergency",
  "urgent",
  "help",
  "ساعدني",
];

export const PRICE_SYNONYMS = [
  "سعر",
  "كم السعر",
  "كم الكشف",
  "كم التكلفة",
  "كم أدفع",
  "كم ادفع",
  "بكم",
  "بكام",
  "الأجر",
  "الاجر",
  "الأتعاب",
  "الاتعاب",
  "تكلفة",
  "رسوم",
  "فلوس",
  "كم تكلف",
  "كم يكلف",
  "price",
  "cost",
  "fee",
  "كم حق",
  "اسعار",
  "أسعار",
];

export const CANCEL_SYNONYMS = [
  "إلغاء الموعد",
  "الغاء الموعد",
  "ألغي موعدي",
  "الغي موعدي",
  "ما راح أجي",
  "ما راح اجي",
  "مو جاي",
  "إلغاء",
  "الغاء",
  "الغِ موعدي",
  "cancel appointment",
  "ألغ",
  "الغ",
];

export const RESCHEDULE_SYNONYMS = [
  "تأجيل",
  "تاجيل",
  "غير الموعد",
  "غير موعدي",
  "reschedule",
  "موعد ثاني",
  "وقت ثاني",
];

export const TIME_INQUIRY_SYNONYMS = [
  "مواعيد",
  "المواعيد",
  "أوقات",
  "اوقات",
  "متى",
  "امتى",
  "متى الموعد",
  "availability",
  "when",
];

export const GREETING_SYNONYMS = [
  "مرحبا",
  "مرحباً",
  "اهلا",
  "أهلا",
  "أهلاً",
  "السلام عليكم",
  "سلام",
  "صباح الخير",
  "مساء الخير",
  "hi",
  "hello",
  "hey",
];

export const THANKS_SYNONYMS = ["شكرا", "شكراً", "يسلمو", "thanks", "thank you", "ممنون"];

export const OUT_OF_CONTEXT_SYNONYMS = [
  "الطقس",
  "طقس",
  "weather",
  "كرة",
  "مباراة",
  "football",
  "سياسة",
  "election",
  "بitcoin",
];

export const DOCTOR_KEYWORDS = ["دكتور", "د.", "د ", "طبيب", "الدكتور", "doctor", "dr"];

export const SPECIALTY_PATTERNS: Array<{ pattern: RegExp; slug: string }> = [
  { pattern: /قلب|قلبية|cardiolog/i, slug: "cardiology" },
  { pattern: /عيون|بصريات|ophthal/i, slug: "ophthalmology" },
  { pattern: /أطفال|اطفال|pediatr/i, slug: "pediatrics" },
  { pattern: /نساء|توليد|ولادة|gynec/i, slug: "gynecology" },
  { pattern: /عظام|عظم|ortho/i, slug: "orthopedics" },
  { pattern: /جلد|جلدية|dermat/i, slug: "dermatology" },
  { pattern: /أنف|انف|أذن|اذن|حنجرة|ent/i, slug: "ent" },
  { pattern: /باطنة|باطني|internal/i, slug: "internal_medicine" },
  { pattern: /أسنان|اسنان|سنان|dental/i, slug: "dentistry" },
  { pattern: /مخ|أعصاب|اعصاب|neuro/i, slug: "neurology" },
  { pattern: /نفس|نفسية|psych/i, slug: "psychiatry" },
  { pattern: /تغذية|حمية|diet/i, slug: "nutrition" },
];

export const DATE_PATTERNS: Array<{ pattern: RegExp; hint: string }> = [
  { pattern: /اليوم|today/i, hint: "today" },
  { pattern: /غداً|غدا|بكرا|بكره|tomorrow/i, hint: "tomorrow" },
  { pattern: /بعد غد|بعد\s*غد|day after/i, hint: "day_after" },
  { pattern: /الأحد|الاحد|sunday/i, hint: "sunday" },
  { pattern: /الاثنين|monday/i, hint: "monday" },
  { pattern: /الثلاثاء|tuesday/i, hint: "tuesday" },
  { pattern: /الأربعاء|الاربعاء|wednesday/i, hint: "wednesday" },
  { pattern: /الخميس|thursday/i, hint: "thursday" },
  { pattern: /الجمعة|friday/i, hint: "friday" },
  { pattern: /السبت|saturday/i, hint: "saturday" },
];

export const TIME_PATTERNS: Array<{ pattern: RegExp; hint: string }> = [
  { pattern: /الصبح|الصباح|morning|باكر/i, hint: "morning" },
  { pattern: /الضهر|الظهر|noon|midday/i, hint: "noon" },
  { pattern: /العصر|afternoon/i, hint: "afternoon" },
  { pattern: /المغرب|المساء|evening/i, hint: "evening" },
];

export const INTENT_SYNONYM_MAP: Record<
  Exclude<MessageIntent, "UNKNOWN" | "DOCTOR_REQUEST" | "OUT_OF_CONTEXT">,
  readonly string[]
> = {
  BOOKING_REQUEST: BOOKING_SYNONYMS,
  AFFIRMATION: AFFIRMATION_SYNONYMS,
  NEGATION: NEGATION_SYNONYMS,
  EMERGENCY: EMERGENCY_SYNONYMS,
  PRICE_INQUIRY: PRICE_SYNONYMS,
  CANCEL_APPOINTMENT: CANCEL_SYNONYMS,
  RESCHEDULE: RESCHEDULE_SYNONYMS,
  TIME_INQUIRY: TIME_INQUIRY_SYNONYMS,
  GREETING: GREETING_SYNONYMS,
  THANKS: THANKS_SYNONYMS,
};
