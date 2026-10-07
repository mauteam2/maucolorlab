# ELIFORA relationship signals

Signals are reproducible facts and configured windows, not customer scores. The snapshot records computation time, original source client IDs, appointment sources and policy versions.

| Signal | Basis |
| --- | --- |
| Completed visits / first / last | Actual completion timestamps of scoped completed appointments |
| Cancel / no-show | Stored statuses; neither counts as a visit |
| Visit interval | At least three of the last twelve completed appointments for the same last service; average consecutive completion intervals |
| Preferred staff | Explicit customer preference first; otherwise at least three of the last six completed visits and at least 75% for one membership; otherwise unknown |
| Usual services | Top five actual completed service counts |
| Upcoming | Earliest active appointment whose end has not passed |
| Return window | Last completed service and its explicit salon window; future appointment for the same service suppresses a new rebook signal |
| Inactivity | Overdue beyond this location's explicitly configured extra threshold |

Relationship display precedence: upcoming, recorded technical follow-up, no visits/new, configured inactive, overdue, at least two visits/returning, active. Underlying counts and signals remain visible even when one display status takes priority. No universal return period, customer value or health score is inferred.

Technical follow-up uses stored technical sources: the latest completed live outcome with concern/unacceptable hair integrity yields care check; concern/unacceptable color accuracy or formula stability yields color follow-up. A latest color plan requiring recovery yields recovery reassessment. Each signal identifies its actual source and recorded time. Role access applies before returning technical information. CRM does not rerun or replace the Risk Engine; appointment technical precheck uses the existing engine and explicitly remains `NOT_ASSESSED` until opened.

Read-time derivation does not create audit spam. Window/policy/preference edits audit their mutations. Action creation stores its current factual basis. New bookings and edited technical sources require rechecking before taking an action; historical actions remain visible rather than being retrospectively deleted.
