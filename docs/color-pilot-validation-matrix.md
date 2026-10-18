# ELIFORA deterministic pilot validation matrix

`contracts/fixtures/color-pilot-matrix.json` defines 25 synthetic professional cases,
executed by `apps/web/lib/color/pilot.test.ts` through the actual Confidence, Risk and
Color Engine chain. These are deterministic product verification fixtures, not
clinical/scientific validation, manufacturer calibration or pilot feedback.

Cases: virgin hair; grey coverage; previous permanent color; bleached hair; porous
ends; root/mid/end mismatch; banding; healthy darker transformation; same-level tone;
warm brunette; cool brunette; caramel; copper; red; violet; beige blonde; gold blonde;
cool blonde; high-risk lightening; strand-test-required; recovery-required; multi-session;
blocked cosmetic scope; unknown history; missing manufacturer mapping.

Each asserts current engine/model version, regional target interpretation, actual
upstream risk/confidence, safety preservation, deterministic repetition and absence
of invented chemistry. Focused assertions retain regional differences, intermediate
checkpoints, non-executable drafts and missing mapping. All eight families also face
UNKNOWN and high-risk inputs. Eight presets round-trip the canonical target model.
Historical 1.0.0 reads remain unchanged and new-version missing interpretation fails.

Existing safety and brand golden suites remain required, including wrong developer,
unverified or retired products, unknown ratio/pigment values, stale catalog/source,
signatures, immutable historical catalog attribution and Live authorization. No old
test or concurrency case is removed. The 89 real DB races remain mandatory.

Production-build/start browser gate runs expanded simple presets, structured regional
secondary/correction/grey targets, high risk, strand testing and multi-session, plus
the existing verified controlled recipe/Live journey extended with an actual unmapped
caramel target. Both browser profiles and 320 px are checked with retries=0.
Full E2E, Phase 8 ten repetitions, Phase 9 security, source inventory, real catalog
grant audit, secrets, Android and builds remain required before completion.
