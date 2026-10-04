# ELIFORA live session state machine

| From | Command | To / requirement |
| --- | --- | --- |
| PREPARING | READY | READY; pending professional sequence present |
| READY | START | IN_PROGRESS; fresh server safety/recipe validation |
| IN_PROGRESS | PAUSE | PAUSED; timestamps remain authoritative |
| PAUSED / CHECKPOINT_REQUIRED | RESUME | IN_PROGRESS; no unresolved risk or failed checkpoint; fresh safety |
| IN_PROGRESS | new band / lift | CHECKPOINT_REQUIRED; no further step start |
| IN_PROGRESS | elasticity concern | PAUSED; reassessment required |
| active | breakage / scalp concern | ABORTED; irreversible conservative STOP |
| PAUSED / CHECKPOINT_REQUIRED | REASSESS | PAUSED; required checkpoints PASS and fresh engine validation |
| IN_PROGRESS / PAUSED | COMPLETION_REVIEW | complete steps, required checkpoints, closed bowls, finished timers and regional outcome |
| COMPLETION_REVIEW | COMPLETE | COMPLETED; atomic immutable outcome and passport append |
| nonterminal | CANCEL / ABORT | CANCELLED / ABORTED; audited reason |

Invalid transitions, old versions and old control epochs fail server-side.
Completed/cancelled/aborted state and all technical history are immutable.
Terminal transitions stop running/paused timers; they never issue chemical
instructions. A failed checkpoint cannot be silently edited into PASS. Stop the
session and perform a new professional assessment if the concern persists.

Default required integrity checkpoint is a live workflow safety rule. Existing
Risk-required physical tests remain enforced before starting; a live visual
checkpoint cannot replace a missing required physical test. Professionals can
add required or optional checkpoints; required ones cannot be removed by
sequence edits. Optional checks do not block progression.
