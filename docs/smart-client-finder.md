# ELIFORA controlled smart finder

The finder is a deterministic Turkish grammar that returns an editable `ClientSearchFilter` AST, explanations and ambiguities. It resolves service/staff names only against the authenticated location's actual directory. It does not call a language model, produce SQL, invent a person, assign a commercial score or send a message.

| Example | Interpreted filter |
| --- | --- |
| 60 gündür gelmeyen müşteriler | Last completed visit at least 60 days ago |
| 2 aydır dip boya yaptırmayan müşteriler | Recorded dip-color service history; its latest completion at least 60 days ago |
| Balayage yaptıran ve gelecek randevusu olmayan müşteriler | Actual completed matching service and no future active appointment |
| Selin'i tercih eden müşteriler | Actual uniquely resolved preferred membership, explicit preference takes priority |
| Selin'e gelen müşteriler | Completed appointment history for uniquely resolved membership |
| Recovery takibi gereken müşteriler | Existing recovery reassessment technical signal, subject to technical permission |
| Son randevusuna gelmeyen müşteriler | Latest terminal appointment is NO_SHOW |

“Month” explicitly means a thirty-day filter unit, not a hidden calendar inference. Service recency and any-service visit recency are separate fields: a recent haircut does not reset an older dip-color completion. Missing history does not fabricate a last visit. Service history and other filters combine with AND.

Ambiguous names, absent service, unsupported words/operators, finance/VIP/score requests, SQL and message-send intent return `NEEDS_CLARIFICATION`. A recognized fragment must not silently discard an unsupported clause. Interpreted results never automatically run: the operator reviews and edits the visible filters and explicitly applies them. Unsupported text can be replaced with structured filters or ordinary name/phone/email search.

Server filters cover record/relationship status, last visit, service recency, future booking, preferred staff, historical staff, completed service, latest no-show and authorized technical follow-up. Strict schemas reject extra tenant/role/SQL fields. Reads use the 200-candidate scan boundary with an explicit next scan offset and a maximum fifty-row page; a scan page without matches may still have a next slice. Identity search uses existing normalized/indexed client fields. Technical-media loading is not part of a CRM search.
