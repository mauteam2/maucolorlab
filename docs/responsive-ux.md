# ELIFORA responsive UX verification

The design has six required widths: 1440, 1280, 1024, 768, 390 and 320 px.

## Composition

At desktop widths the shell uses a 222 px sidebar (200 px on compact desktop), a restrained topbar and bounded content. The selected module alone has a filled plum navigation state. Below 900 px the sidebar becomes an explicit menu; Escape closes it and returns focus to the trigger. Organization/location/role context remains readable on mobile.

ColorLab stacks its two working columns on compact desktop. Region lists move from three columns to two and then one; the diagram stays illustrative. Live stacks sequence/timer/material sections and retains large controls. Mobile appointments use a chronological agenda instead of forcing the entire weekly grid into a 320 px viewport. Business tables retain existing responsive row labels or contained scrolling. Dialogs remain native, keyboard-operable and bounded to the viewport.

## Regression evidence

`apps/web/e2e/design-deepening.spec.ts` traverses actual authenticated workspace routes using disposable local Supabase fixtures. It checks document overflow, visible main content and exactly one current menu item at all six widths, and captures 1440/390/320 px evidence. It covers dashboard, clients, profile, Hair Passport, ColorLab target/result, catalog, appointments, stock, finance, reports and sign-in. The existing controlled-recipe/Live journey supplies active Live screenshots and checks the same six widths.

The sign-in check explicitly enables reduced motion and verifies the final usable form. Existing intro timing/replay tests continue to test the approved 1500 ms behavior. Existing role, revoked-membership, session-concealment, offline and functional journeys remain required; screenshots alone are not functional verification.

## Performance and acceptance

No animation or component dependency is added. The stylesheet is workspace scoped; shared primitives are small React/HTML compositions. Record the actual build, lint, typecheck, unit, browser and bundle results in the delivery report. A test's presence does not imply it passed. Final evidence must distinguish local preview images, real authenticated disposable-database screenshots and protected hosted-staging checks.

This design work does not close the Phase 10 human/infrastructure gates or authorize production/pilot onboarding.
