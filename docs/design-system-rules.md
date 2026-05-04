# Clinic OS — قواعد نظام التصميم (التزام تنفيذي)

هذا الملف يحدد **الانضباط** وليس الاقتراحات. أي PR يخالف القواعد يجب أن يُعاد طلب تعديله حتى يتم الالتزام أو إضافة استثناء موثّق.

## 1) Spacing — شبكة 8px (Tailwind: `cg-*`)

- **مسموح:** `p-cg-*`, `m-cg-*`, `gap-cg-*`, `space-x-cg-*`, `space-y-cg-*`، والأسماء الدلالية `stack-tight`, `stack-default`, `panel-gap`, `section-gap`.
- **ممنوع:** مقياس Tailwind الافتراضي للمسافات على هذه الخصائص مثل `p-3`, `gap-4`, `mt-7`، والقيم العشوائية مثل `mt-[13px]`.

الإنفاذ: `pnpm lint` داخل `apps/web` (قاعدة ESLint `clinic-os/no-non-cg-spacing`).

## 2) Typography — مقياس `ds-*`

- **مسموح:** `text-ds-h1` … `text-ds-label` فقط لأحجام النصوص.
- **ممنوع:** `text-xs`, `text-sm`, `text-base`, … و `text-[11px]`.

الإنفاذ: `clinic-os/no-non-ds-typography`.

## 3) Colors — دلالية فقط

- **مسموح:** `primary`, `secondary`, `success`, `danger`, `warning`, `info`, `muted`, `background`, `foreground`, `border`, `card`, إلخ (عبر متغيرات CSS أو ألوان المشروع).
- **ممنوع:** لوحة Tailwind الخام مثل `bg-red-500`, `text-slate-400` (ما لم يُسجّل استثناء لمكوّن legacy).

الإنفاذ: `clinic-os/no-raw-palette-colors` (تحذير؛ يُرفع لاحقًا إلى خطأ بعد تنظيف الصفحات العامة).

## 4) Motion — تفاعل موحّد

- أي عنصر تفاعلي يجب أن يستخدم: `clinic-motion duration-ds-normal ease-ds-out` (أو `ds-fast` حسب الحالة).
- لا تضيف مدة/ease عشوائية بدون مبرر في نفس المكوّن.

## 5) Component contract

كل مكوّن reusable يعرّف في أعلى الملف (تعليق قصير أو `cva`) القيم الثابتة:

- padding / gap / radius / typography الافتراضية.
- لا تُعدّل هذه القيم من الخارج عبر `className` إلا لأسباب نادرة ومحددة.

## 6) Operational UI (شاشات التشغيل)

- **NOW:** أكبر وأوضح بصريًا.
- **NEXT:** واضح دون ضوضاء.
- **REST:** ثانوي بصريًا (ألوان وهوامش أخف).

## 7) مستويات الخطأ في CI

- مرحلة التبني: القواعد على مستوى **warn** في ESLint لتسهيل الهجرة.
- بعد تنظيف المجلدات الحرجة (`features/`, `components/layout/`): رفع القواعد إلى **error** في `eslint.config.mjs`.

## 8) مسار الهجرة التدريجي (منطّق تنفيذي)

1. **تم:** `components/layout/*` + `features/appointments/*` (استخدام `cg-*` و `ds-*` مع الحفاظ على السلوك).
2. **التالي المقترح:** `components/ui/*` الأساسية (Button, Badge, Input…) ثم `features/dashboard/*` ثم `features/patients/*`.
3. **لاحقًا:** `features/inbox/*` على أجزاء (header → قائمة → الرسائل → الرد) لتقليل مخاطر الانحدار.

للتحقق من نطاق موجّه:

`pnpm exec eslint components/layout features/appointments`
