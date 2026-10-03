# ELIFORA Phase 2C — accepted scope

Status: accepted on 2026-10-03. The user selected controlled professional shade
selection and documented ratio arithmetic. This phase delivers a Web workflow
and shared service contracts; Android receives no second chemistry calculator
and its existing build/tests remain required regression checks.

## Verified baseline

- Phase 2B HEAD: `950b939c6779e50bb348cc35715a79df2df7d6a7`.
- CI run `37125010063`: all four jobs passed.
- Phase 2C branch: `codex/phase-2c-controlled-brand-recipe`.
- One source-qualified pilot: Schwarzkopf Professional / IGORA ROYAL ABSOLUTES.
- 29 documented shades, two documented developers, three official documents,
  58 conditional compatibility rules.
- Numeric pigment dimensions remain UNKNOWN. Phase 2A/2B results remain
  non-executable and require professional review.

## Accepted first slice

A professional selects one verified shade, one documented compatible developer,
and a color quantity. The server computes developer quantity using the actual
verified manufacturer ratio; it does not infer dosage, pigment strengths,
neutralization weights, expected final color, or an optimized shade blend.

Limit initial support to the existing pilot's simple, single-region regrowth
context. Reuse current source evidence and its restrictions. Read the white-hair
ratio and technical context from the authorized Hair Passport; do not accept a
client assertion that manufacturer conditions or safety checks are satisfied.
Missing, conflicting, stale, or unverified context must prevent a ready draft.

Processing guidance remains the documented range. No arbitrary single processing
time, heat instruction, additional chemical system, or cross-brand substitute is
introduced. A professional-specified quantity is an input, not a manufacturer
recommended dosage.

## Required implementation invariants

- Re-evaluate the current Confidence → Risk → Color path before creation.
- Bind the draft to the latest target revision, current passport evidence,
  published catalog fingerprint, selected product/developer versions, exact
  compatibility rule, official sources, authenticated actor, and tenant/location.
- Keep historical drafts immutable; changes create a new recorded draft/version.
- Distinguish professional selection from an engine recommendation.
- Keep execution false. Professional review must not silently override a blocked
  safety gate or introduce unverified manufacturer claims.
- Validate and compute on the server. Persist through an authorized boundary with
  conflict handling, idempotency, audit, and real RLS allow/deny tests.
- Publish shared additive contracts before introducing Web/Android API shapes.
- Preserve the approved logo, intro, Salon Design System, and earlier contracts.
- Keep live application, timing, consumption, outcome capture, and session control
  in Phase 3.

## Deferred scope

Numeric pigment calibration, optimized blends, live application, timers,
consumption, result capture, and session execution remain outside Phase 2C.
Phase 3 has not started. Manufacturer processing guidance remains 30�45 minutes.
