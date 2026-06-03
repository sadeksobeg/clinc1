/** Arabic UX copy for WhatsApp booking FSM (no free-form LLM). */

export function welcomeMainMenu(): string {
  return (
    "أهلاً بك في العيادة.\n" +
    "اختر ما تريد:\n" +
    "1) حجز موعد\n" +
    "2) الاستفسار عن الأسعار\n" +
    "3) التحدث مع موظف\n\n" +
    "أرسل رقم الخيار (1 أو 2 أو 3)."
  );
}

export function repromptMainMenu(): string {
  return "أرسل رقمًا من 1 إلى 3، أو اكتب «حجز» أو «سعر».";
}

export function confusedRecoveryMenu(): string {
  return "ما فهمت عليك تماماً.\nهل تريد:\n1) حجز موعد\n2) الاستفسار عن الأسعار أو التكلفة\n\nأرسل رقم الخيار، أو اكتب طلبك باختصار.";
}

export function repromptChooseClinic(maxIx: number): string {
  return `ممكن ترسل رقم العيادة من القائمة (1 إلى ${maxIx})؟ مثلاً 1 أو ٢.`;
}

export function repromptChooseDoctor(): string {
  return "ممكن ترسل رقم الطبيب من القائمة؟ (1، 2، …)";
}

export function repromptChooseSlot(maxIx: number): string {
  return `اختر رقم الموعد من القائمة (1 إلى ${maxIx}) لتأكيد الحجز، أو اكتب وقتًا مثل: 5:00.\nأوامر: 0 رجوع، مواعيد أخرى، تغيير اليوم.`;
}

export function handoffToSecretary(): string {
  return "سأحوّل طلبك لفريق السكرتارية لمتابعة أفضل. شكراً لتفهمك، وسيتواصل معك أحد الزملاء قريباً.";
}

export function askPatientFullName(): string {
  return "يرجى إرسال الاسم الكامل للمريض كما يظهر في الهوية أو الملف (ثلاثة أحرف على الأقل) لإكمال الحجز.";
}

export function chooseClinicIntro(lines: string): string {
  return `اختر العيادة المناسبة:\n${lines}\nأرسل رقم الخيار.`;
}

export function chooseDoctorIntro(lines: string): string {
  return `اختر الطبيب:\n${lines}\nأرسل رقم الخيار.`;
}

export function slotListIntro(lines: string): string {
  return `أقرب المواعيد المتاحة:\n${lines}\nأرسل رقم الخيار لتأكيد الحجز، أو اكتب وقتًا مثل: 5:00.\nأوامر: 0 رجوع، مواعيد أخرى، تغيير اليوم.`;
}

export function singleSlotConfirmLine(whenLabel: string, doctorName: string): string {
  return `أقرب موعد متاح: ${whenLabel} مع ${doctorName}.\nأرسل 1 للتأكيد.`;
}

export function chooseSpecialtyIntro(lines: string): string {
  return `أهلًا بك. اختر التخصص المناسب:\n${lines}\nأرسل رقم الخيار.`;
}

export function repromptSpecialty(maxIx: number): string {
  return `أرسل رقمًا بين 1 و ${maxIx}، أو اكتب اسم التخصص.`;
}

export function noDoctorsForSpecialty(specialtyLabel: string): string {
  return `لا يوجد أطباء متاحون لتخصص ${specialtyLabel} حاليًا. أرسل 0 للعودة لقائمة التخصصات.`;
}

export function returningPatientShortcut(doctorName: string): string {
  return `هل تريد متابعة الحجز مع د. ${doctorName} كالعادة؟\n1) نعم\n2) اختيار طبيب آخر`;
}
