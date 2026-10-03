# ELIFORA Pigment Vector Foundation

Version: `pigment-vector/1.0.0`. This foundation represents documented observations; it is not a chemical concentration model or a color mixing simulator.

The independent channels are level effect, neutral, ash, blue, violet, green, red, copper, gold, pearl, beige, natural base, opacity, coverage strength, deposit strength and lift behavior. Each numeric channel uses its documented **source scale** and carries its own source reference, verification, version, verifier, timestamp and confidence. Values from different scales must not be added, normalized into percentages or interpolated. No numerical conversion or manufacturer default exists.

`readPigmentVector` returns every channel. Missing or unverified channels remain `value: null`, `source: UNKNOWN`, `verificationStatus: UNVERIFIED`; absence never means zero. A recorded zero can be a real source observation. A verification confidence of zero does not qualify a fact for matching.

Product operating facts use explicit units: shade level / LEVEL, tone family / CATEGORY, mixing ratio / RATIO, processing time / MINUTES, developer strength / PERCENT, documented lift / LEVELS, and coverage/deposit claims / BOOLEAN. The percentage unit applies to the documented developer label, never to inferred pigment concentration. Type/unit consistency is enforced in Zod, OpenAPI and database constraints.

Sources: `MANUFACTURER_DOCUMENTATION`, `ELIFORA_EXPERT_VALIDATED`, `SALON_VALIDATED`, `IMPORTED_UNVERIFIED`, `UNKNOWN`. Verified observations require a non-null value, unit, reference, verifier, time and confidence. Imported and unknown observations do not become verified through a confidence score.

No real manufacturer data ships with Phase 2A. `contracts/fixtures/brand-contract.json`, the golden fixtures and `apps/web/test/brand-fixtures.ts` contain explicitly fictional test values. They are not application seed data.

Future quantitative matching requires documented scale calibration, validated mixing behavior and further reviewed golden cases. Phase 2A deliberately does not estimate missing chemistry.
