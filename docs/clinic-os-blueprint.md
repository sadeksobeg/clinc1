# Clinic OS Blueprint (UI/UX + State + Interactions)

Date: 2026-04-29  
Scope: تحويل الواجهات من “صفحات” إلى “Operational Workspace” بدون إضافة APIs/Routes أو تغيير business logic.

## 0) قواعد غير قابلة للكسر

- **No fake data**: أي بيانات غير مؤكدة = skeleton/empty/error واضح، بدون أرقام 0 مضللة.
- **No new features**: لا حقول جديدة تُغيّر الـ flows أو تضيف أسئلة/مراحل جديدة للمريض. (نحسّن العرض والتفاعل فقط)
- **No new APIs**: نفس endpoints الحالية فقط.
- **Subtle/Safe motion**: 120–180ms transitions، بدون flashy animation.
- **Optimistic UX = Pending state**: لا “ادّعاء نجاح”؛ نعرض `pending` مع rollback واضح عند الفشل.

## 1) State Model (كما نعرضه، وليس كـ feature جديد)

### 1.1 Conversation Operational State (Derived)
يُشتق بالكامل من البيانات الموجودة في `InboxRow` + `ConversationDetail.routing`:

- **Urgent / Emergency**: `last_inbound_is_urgent` أو `intent` يحتوي emergency أو `routing.last_emergency_event`
- **Booking**: `last_inbound_intent === booking` أو `suggested_actions` فيها `CREATE_APPOINTMENT`
- **Needs review**: `last_decision_type === unknown` أو `blocked reasons`
- **Open/Closed**: `thread.status` + `thread.state`

هدفه: “ما الذي يجب فعله الآن؟” بدون إنشاء حالات جديدة على السيرفر.

### 1.2 Appointment Visual Status (Derived)
بدون تغيير قاعدة البيانات، نلوّن/نرمّز حسب:

- `status` (confirmed/cancelled/completed…)
- `source_channel` (whatsapp_emergency)

لا نضيف حالات جديدة مثل arrived/in_progress… في هذه المرحلة لأن ذلك feature.

## 2) Interaction System (Global)

### 2.1 Motion Rules
- **hover**: 120–180ms ease-out
- **press**: scale 0.98 (خفيف)
- **focus**: ring واضح (accessibility)
- **success**: highlight خفيف (border/flash) عند الحاجة

مناطق التطبيق:
- `apps/web/components/ui/button.tsx`
- `apps/web/components/ui/card.tsx`
- `apps/web/components/layout/WorkspacePanel.tsx`

### 2.2 Perceived Speed (Optimistic-with-Pending)
نُطبّق optimistic حيث يمكن rollback بشكل حاسم:
- **Inbox reply/template**: إضافة bubble pending ثم إزالة/تأكيد.
- **Inbox actions**: “جار التنفيذ…” في UI (زر disabled + badge pending) ثم refresh.
- **Appointments reschedule/cancel**: موجودة فعليًا (optimistic + rollback).
- **Settings/Billing**: pending on button (disabled) + inline hint “جار الحفظ/الإرسال” (بدون تغيير البيانات محليًا بشكل خاطئ).

## 3) Keyboard-first UX (Power)

### 3.1 Global shortcuts (بدون مكتبات جديدة)
- `/` → focus global search (إن وُجد) أو البحث داخل الصفحة الحالية (Inbox list search مثلًا)
- `g` ثم:
  - `i` → Inbox
  - `a` → Appointments
  - `p` → Patients
  - `s` → Settings
  - `b` → Billing
  - `d` → Dashboard
- `Esc` → blur/close transient focus (مثل search) أو إغلاق panel صغير إن وُجد.

### 3.2 Inbox-local shortcuts
- ↑/↓ داخل قائمة المحادثات للتنقل
- Enter في صندوق الرد للإرسال، وShift+Enter لسطر جديد

## 4) Inbox Blueprint (Control Center)

### 4.1 Layout Architecture (Split Zones)
الهدف: الصفحة لا scroll بالكامل؛ الرسائل فقط هي التي scroll.

#### Structure

```
-----------------------------------------------+
| LeftList | ThreadHeader(sticky)              |
| (scroll) | Messages(scroll internal)         |
|          | ReplyBox(sticky)                  |
|          |                                   |
|          | ContextPanel (scroll as needed)   |
-----------------------------------------------+
```

### 4.2 Timeline feel (بدون feature جديد)
- Grouping بصري للرسائل المتتالية من نفس الاتجاه (inbound/outbound).
- Day separators (اختياري): إذا استطعنا من `created_at` دون تعقيد.
- System markers (اختياري): من routing/decision timeline الموجود.

### 4.3 Conversation State Bar
شريط بسيط أعلى الـ thread:
- `🚑 طارئة` / `📅 حجز` / `🧠 يحتاج مراجعة` / `✅ مغلقة`…  
مبني بالكامل من derived state.

### 4.4 Optimistic send UX
عند Send:
- bubble تظهر فورًا مع `pending` badge.
- عند success: pending يختفي + refresh.
- عند fail: bubble تُزال + toast “فشل الإرسال”.

## 5) Appointments Blueprint (Operational Grid)

### 5.1 Visual grid rules
بدون تغيير البيانات:
- الآن grid موجود (أيام × ساعات). نقوّي:
  - “الآن” (now emphasis)
  - drag feedback
  - كثافة أفضل (compact)

### 5.2 Color rules (Derived)
- emergency: danger
- confirmed: primary
- cancelled/completed: muted/outline

## 6) Dashboard Blueprint (Decision Surface)

### 6.1 KPI as navigation
KPI cards تكون “actionable” وتُشير بوضوح أن الضغط ينقلك للتفاصيل.

### 6.2 Alerts priority
نقدّم urgent/open/unknown cues قبل نصائح عامة.

## 7) Mapping إلى ملفات المشروع

- Inbox:
  - `apps/web/features/inbox/inbox-workspace.tsx`
  - `apps/web/app/(app)/inbox/page.tsx`
  - `apps/web/app/(app)/inbox/[id]/page.tsx`
- Appointments:
  - `apps/web/features/appointments/appointments-board.tsx`
  - `apps/web/app/(app)/appointments/page.tsx`
- Dashboard:
  - `apps/web/features/dashboard/kpi-cards.tsx`
  - `apps/web/features/dashboard/widgets.tsx`
- Shared:
  - `apps/web/components/ui/button.tsx`
  - `apps/web/components/ui/card.tsx`
  - `apps/web/components/layout/WorkspacePanel.tsx`

## 8) Non-goals (لتجنب creep)

- لا نضيف “نوع الحالة” (new/review/emergency) كحقل إدخال.
- لا نضيف durations جديدة أو قواعد scheduling جديدة.
- لا نضيف automation messages جديدة (delay/feedback) في هذه المرحلة.
- لا نضيف realtime sockets. (نعتمد على perceived speed + refresh)

