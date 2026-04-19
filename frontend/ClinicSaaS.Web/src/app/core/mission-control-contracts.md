# Mission Control Component Contracts

Use these primitives in dashboard/workspace pages to prevent layout drift.

## Allowed primitives
- `mc-panel`: the only allowed panel wrapper in Mission Control pages.
- `mc-signal`: required for operational danger/warning/info messages.
- `mc-empty`: required for empty states in operational pages.
- `mc-stack` / `mc-grid`: preferred route-level layout primitives over raw `flex/grid` wrappers.

## Required inputs
- `mc-panel`
  - `title` (required)
  - `state`: `loading | empty | error | ready`
  - optional empty/error config: `emptyTitle`, `emptyDescription`, `errorTitle`, `errorDescription`
- `mc-signal`
  - `type` (required): `danger | warning | info`
  - `title` (required)
  - optional: `description`, `ctaLabel`, `(cta)`
- `mc-empty`
  - `title` and `description` (required)
  - optional: `icon`, `ctaLabel`, `(cta)`

## Migration examples
- Raw panel:
  - from: `<div class="mc-panel mc-space-panel">...</div>`
  - to: `<mc-panel title="Operations">...</mc-panel>`
- Raw signal:
  - from: `<div class="mc-signal mc-signal-warning">...</div>`
  - to: `<mc-signal type="warning" title="..." description="..."></mc-signal>`
- Inline empty block:
  - from: `<div class="ui-empty">No data</div>`
  - to: `<mc-empty title="No data" description="Try another filter"></mc-empty>`
