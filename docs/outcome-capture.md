# ELIFORA professional outcome capture

Completion review requires one result per applied region: achieved level,
achieved tone, uniformity, hair integrity and professional assessment; usage,
deviations and finished timers are reviewed explicitly. Five independent
profile fields record COLOR_ACCURACY, UNIFORMITY, HAIR_INTEGRITY,
PROCESS_EFFICIENCY and FORMULA_STABILITY. UNKNOWN is preserved; no composite
score or AI judgement is invented. Current pilot application is one ROOT
region; preserved MID/ENDS targets are still shown as planning context.

The original Color Plan target snapshot and actual region results provide
before/after comparison without relabeling custom region IDs. Actual process
seconds are server completion time minus server start time: elapsed session
wall time, including session pauses. Individual processing timers separately
record active processing intervals. No single manufacturer processing time is
chosen by the engine.

COMPLETE atomically appends an existing Hair Passport COLOR history event and
one immutable `session_outcomes` row. The outcome links the history event,
client/passport, original and current recipe versions, actual product usage,
regional outcome, photos and deviations. Historic observations and formula
versions are not rewritten. The stored session history is client-specific
Recipe Memory; previous results are reference only. A subsequent visit must
create a current plan and re-run Confidence/Risk/Color/catalog validation.

Permissions remain distinct from technical competency. Outcome source is the
authenticated professional; no caller-supplied outcome source, audit actor or
completion-validity flag is accepted. Uploads/photos have no automatic blur or
crop. Current pilot does not require a photo for every case; all voluntarily
reserved photo uploads must be complete before finalization.
