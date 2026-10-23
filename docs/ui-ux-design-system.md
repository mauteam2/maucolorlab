# ELIFORA professional workspace design system

This frontend slice makes ELIFORA a professional color instrument and a practical salon workspace. It does not change a domain decision, permission, contract, engine rule or financial calculation.

## Foundations

`apps/web/app/professional.css` scopes the design system to `.salon-layout`. It follows the existing domain styles in the root layout. Sign-in, its 1500 ms intro and the approved integrated f/brush logo assets are deliberately outside this layer.

| Role | Token / value | Usage |
| --- | --- | --- |
| Canvas | `--surface-base: #F7F1EB` | Quiet ivory workspace |
| Panel | `--surface-panel: #FFFDF9` | Working document or task surface |
| Inset | `--surface-inset: #F0E7DE` | Region map and contextual work |
| Primary ink | `--ink: #3B2432` | Headlines, primary action, active navigation |
| Secondary ink | `--ink-secondary: #655B60` | Readable labels and supporting text |
| Copper | `--copper: #925637` | Technical accents, links and focus |
| Champagne | `--champagne: #E8D8CC` | Quiet separators |
| Success | `--signal-success: #296044` | Explicit satisfied/known state |
| Warning | `--signal-warning: #88531C` | A condition requiring attention |
| Risk | `--signal-risk: #9A3241` | High risk or blocked progress |
| Unknown | `--signal-unknown: #635C6B` | Incomplete or unverified information |

Status always includes text; colored hair-family samples have no safety meaning. Unknown quantity, confidence or cost is never represented as zero or a success state.

## Type, spacing and depth

Editorial Georgia headings use a restrained 30–46 px page scale, 25 px sections and 20 px technical subsections. The established system sans stack serves labels, tables, body and controls. Financial and timer values use tabular numerals. The existing spacing scale is retained; 12–24 px task spacing and 28–36 px major separation establish grouping without adding containers around every field.

Panels use an 8 px radius; controls use 5 px. Metrics are open compositions with a baseline separator. Technical histories use ruled rows. The only panel shadow is `0 3px 16px #3b243205`; no glass, glow, neon or decoration-driven animation is introduced.

## Primitives

Existing `SalonHeading`, `SalonCard`, `SalonStat`, native dialogs and form components remain the base. `professional-ui.tsx` adds only shared, used patterns: `StatusBadge`, `TechnicalNotice`, `EmptyState`, `LoadingState`, `ActionItem`, `WorkflowRail`. Workflow position does not grant permission or imply that a server gate was passed. Loading placeholders contain a readable status and static skeleton; they do not introduce an animation dependency.

## Accessibility and preservation

Controls have visible keyboard focus, text labels and a 44 px minimum height (50 px in Live). Navigation supplies `aria-current`, a skip link and an Escape-close focus return. Reduced motion disables workspace transitions. Existing confirmation, error, recovery, offline privacy and authorization behavior remains authoritative. Do not hide critical validation or replace explicit human approval with a decorative completion indicator.
