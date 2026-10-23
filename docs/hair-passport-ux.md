# ELIFORA Hair Passport UX

Hair Passport is a structured technical dossier. General assessment, regional assessments, observations, tests and history remain distinct, with existing creation/editing and append-only correction behavior unchanged.

## Current canvas and regions

Assessment fields use readable definition rows: natural/apparent level, grey ratio, structure, density, porosity, elasticity, tone, chemical and color histories, and integrity notes. Two-column desktop grouping collapses on small screens without removing fields. Each field keeps its state and value together; measured zero remains a value.

A restrained strand diagram introduces the regional record map. Links come from actual ordered regions, including custom and archived regions, and scroll to the matching assessment. The drawing does not infer a hair shape, paint a simulated result or assign evidence to another region. Region state is shown as text.

## Knowledge language

| State | Meaning in this view |
| --- | --- |
| Kayıtlı | A recorded value; not a blanket guarantee of accuracy |
| Bilinmiyor | The field is explicitly unknown |
| Henüz değerlendirilmedi | Assessment has not been recorded |
| Uygulanamaz | Explicitly inapplicable; not zero |
| Doğrulanmamış bilgiler | Imported/unverified assessment |
| Geçerlilik tarihi geçti | The recorded evidence deadline precedes the view's opening time |
| Çelişen kanıt | Engine-requested review, shown in ColorLab; not inferred from display rows |

The evidence-deadline label is an informational date comparison, not a new confidence rule. Authoritative freshness and conflicts remain in the existing engine. Evidence source, stated confidence, professional attestation, observation date and validity deadline remain available. No aggregate confidence score is fabricated.

## History and editing

Ruled observation/test/history records preserve date, region, evidence and correction attribution. Existing pagination avoids pretending a page is a lifetime total. General and regional edit forms, physical tests, observations and historical corrections retain validation and their service boundaries. Empty assessments explain how to record an observation or test. No critical field, warning or historical value is removed for visual simplicity.
