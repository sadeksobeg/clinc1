# UX Governance Checklist

Use this checklist before merging any UI change.

## Decision-first
- Every hero/panel answers: what should the user do now?
- Danger/warning/info signals are used when metrics indicate blockers.
- KPI cards include interpretation, not only raw numbers.

## Triage and urgency
- Lists are sorted by urgency, unread state, and age when relevant.
- SLA countdown is visible and color-coded.
- Ownership is explicit (`Assigned to you` / `Unassigned` / user id).

## Interaction contracts
- Clickable items use `mc-hover-lift`.
- Primary actions use active feedback (`mc-button-primary` / `mc-glow-button`).
- Empty states include a clear next action.
- Loading uses skeleton states instead of abrupt flashes.

## Consistency
- Styles use shared `mc-*` and `ui-*` classes; avoid ad-hoc patterns.
- Copy is synchronized in AR/EN i18n keys.
- New status labels are context-rich and not ambiguous.

## Technical gate
- Lints pass for all touched files.
- Frontend build passes.
- Core routes render and respond as expected.

