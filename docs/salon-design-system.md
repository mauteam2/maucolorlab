# ELIFORA salon UI

The nine approved screen references define the Web workspace presentation. No reference panel is used as a page background, and the approved raster wordmark and 1,500 ms sign-in intro are unchanged.

## Shared design

`apps/web/app/salon.css` scopes workspace tokens, responsive layouts, forms, tables, notices, editors and dialogs. Cream `#F7F1EB`, nude `#F3EAE2`, plum `#3B2432`, copper `#A36749`, border `#E8D8CC`; cards use warm white. Georgia supplies headings only; the approved logo remains the exact PNG through `BrandLogo`. Sans-serif supplies controls and body text. Desktop sidebar is 272 px, cards have 12 px corners, gaps are 14–24 px. Below 900 px the sidebar becomes a collapsible menu; below 600 px forms stack and wide tables/calendars scroll within their cards.

`SalonFrame` owns the accessible navigation, workspace search, breadcrumb and responsive menu. Only the active section carries `aria-current`. Live navigation labels unimplemented sections as upcoming without providing fake operational links.

## Reference mapping and operational boundary

| Reference | Live route / implementation | Development-only preview |
| --- | --- | --- |
| Ana panel | `/workspace`: freshly verified tenant identity and permission-based quick actions | `/preview/salon/dashboard` |
| Müşteri listesi | `/workspace/clients`: actual directory, masked phones, search, archive filter, pagination | `/preview/salon/clients` |
| Müşteri profili / Hair Passport | `/workspace/clients/[id]` and `/hair-passport`: all existing identity and technical fields, evidence, tests and history retained | `/preview/salon/profile` |
| ColorLab | `/workspace/colorlab`: existing regional target and Color Engine APIs, all regional target fields, permission-gated save/generate | `/preview/salon/colorlab` |
| Randevular | No appointment persistence service exists in Phase 1F | `/preview/salon/appointments` |
| Finans | No finance ledger/payment persistence service exists in Phase 1F | `/preview/salon/finance` |
| Raporlar | No salon reporting service exists in Phase 1F | `/preview/salon/reports` |
| Ekip | No team/scheduling management service exists in Phase 1F | `/preview/salon/team` |
| Ayarlar | No salon preferences/working-calendar persistence service exists in Phase 1F | `/preview/salon/settings` |

Preview data is synthetic and explicitly labelled. Preview changes live in React memory only, and messages state that they have not been saved to a server. Finance preview totals and payment distribution derive from its rows; CSV export contains sample data. Calendar hours are chronological and day/week/month controls are interactive. The ColorLab product/component editor in the preview demonstrates future presentation only; the live ColorLab uses existing brand-independent target/planning contracts and never invents manufacturer chemistry. A Brand Adapter is still required for an executable product recipe.

All `/preview/salon/*` and `/preview/workspace/*` routes return 404 outside development. The latter routes render the actual workspace components for local browser testing; their APIs retain normal authentication and tenant checks. They include no built-in data or auth bypass.

## Preserved behavior

Server authorization, membership revalidation, concealment on revoked/offline/hidden access, workspace references, correlation handling, idempotent requests, optimistic versions, duplicate review, archive/restore, and all Hair Passport mutation forms remain in their existing boundaries. No migrations, Android sources, signing secrets, dependency versions, or production data are changed by this work.

Browser captures and reference comparisons are local, ignored artifacts in `apps/web/captures/salon-design/`. UI fixture tests are separate from database-backed end-to-end coverage; a local Supabase instance is required for the latter.

### Validation on 2026-10-02

- Web lint, TypeScript check and optimized Next.js build passed.
- Full unit run: 664 passed, one Color Engine performance test exceeded its 5,000 ms limit by about 50 ms while build/browser work ran concurrently. Its isolated rerun passed all 31 Color Engine tests. Three new ColorLab UI tests passed, giving 668 individually verified unit cases; no timing threshold was changed.
- 30 distinct desktop/mobile Playwright cases passed, including the unchanged sign-in intro and the new settings controls. The settings cases were rerun after the final layout correction.
- All nine previews and five actual workspace components were captured at desktop, 390 px and 320 px: 42 layout combinations without document overflow. Actual components used synthetic intercepted API responses, with native validation, query forwarding, target preflight validation and a physical-test editor checked.
- Reference comparisons were inspected and mobile overflow, recipe spacing, settings layout and meter colors corrected.
- Production HTTP checks returned 404 for salon/workspace previews and the intro preview.
- No local Supabase instance was running, so fresh database-backed authentication, mutations and RLS end-to-end tests could not run. Database and Android code are unchanged; their builds/migrations were not rerun for this Web presentation slice.
