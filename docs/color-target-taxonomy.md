# ELIFORA target taxonomy

`color-target-taxonomy/1.0.0` is qualitative desired intent, never a manufacturer chart.
Its shared representation remains TargetDefinition schema 1 and RegionalColorTarget.
Depth is independently selectable on the existing 1–10 model, with existing fractional
levels retained in the regional editor. No new scale or intensity unit is introduced.

| UI family | Canonical tone intent | Warmth |
|---|---|---|
| Doğal / nötr | NEUTRAL | NEUTRAL |
| Küllü / soğuk | ASH_COOL | COOL |
| Bej | MIXED: NEUTRAL + GOLD_WARM | NEUTRAL |
| Altın / sıcak | GOLD_WARM | WARM |
| Karamel | MIXED: GOLD_WARM + COPPER | WARM |
| Bakır | COPPER | WARM |
| Kızıl | RED | WARM |
| Viyole | VIOLET | COOL |

Beige/caramel are editable house target descriptions, not claims about any brand's
beige/caramel product composition. Blue and green directions remain available in the
existing professional editor. Combined directions are unordered, with no quantitative
dominance or mixing ratio. Secondary direction is a convenience editor for the same
canonical MIXED set; there is no unsupported primary/secondary concentration model.

Fast presets: natural, warm and cool brunette (depth 5), caramel/copper (7), beige,
gold and cool blonde (9). Every preset expands to explicit regional fields; no preset
identifier is persisted as engine authority. Brown/blonde describe depth and chosen
tonal direction, rather than competing tone enums. Colorists may change every depth.

Every active ROOT, MID_LENGTHS, ENDS and supported custom region requires its own
objective or explicit preservation. Grey BLEND/COVER, correction kind, intermediate
level, warmth, isolation and supported target modes retain their original semantics.
No region is silently averaged into a global target. Browsing presets is unmetered;
successful authoritative Color Plan generation retains established SaaS metering.
