# ELIFORA offline foundations

Offline storage contains pending user intent, never a second business database.
The authoritative record, actor, tenant, permission, subscription, availability,
stock balance and financial facts remain on the server. No authenticated HTML
cache or service worker is introduced.

Command classification (the dispatcher allowlist, not the draft's domain label,
decides whether a captured command can be sent):

| Classification | Commands / boundary |
| --- | --- |
| SAFE_OFFLINE_DRAFT | Controlled Hair intent, CRM note/preference, appointment preparation and bounded Live contribution |
| REQUIRES_ONLINE_COMMIT | Client/Color preparation review; stock intake/count/consumption acceptance |
| SAFETY_CRITICAL_ONLINE | Recipe approval/revision/execution, Live START/step/timer/COMPLETE decisions; never generic offline dispatch |
| FINANCIAL_ONLINE | Payments, refunds, expenses, cash close, authoritative cost/commission facts |
| RECOVERY_ALLOWED | Online authorized RECOVER_CONTROL, safety abort and existing-work reconciliation under the existing service rules |

RECOVERY_ALLOWED is a lifecycle/entitlement allowance, not offline authority.
Only bounded factual reconciliation may be journaled locally; controller recovery
and safety decisions still require a current authoritative connection.

The shared envelope is `OfflineDraftMetadata` in `contracts/offline.schemas.json`.
It carries a stable draft/mutation identity, domain, organization, location, user,
membership, device, workspace reference, optional entity/session/version/epoch,
timestamps, canonical payload hash, state, dependencies and attempt diagnostics.
UNKNOWN and measured zero retain distinct payloads. Form preparation is explicitly
different from an accepted command.

| Domain | Local capability | Acceptance |
| --- | --- | --- |
| Hair core/regions | Validated intent with original expected version | Existing Hair mutation service; explicit conflict |
| Hair observation | Original version, evidence and confidence | Existing observation service; no rebase |
| Physical test/history | Original immutable factual append identity | Permanent Hair receipt replay |
| Client | Encrypted form preparation | Fresh duplicate/identity review in the existing form |
| CRM note/preference | Typed intent, visibility and original version | Existing CRM service; no merge/archive sync |
| Appointment | Typed booking/edit intent | Existing service repeats hours, staff, resource and slot checks |
| Color target | Encrypted definition preparation | Fresh Hair/Risk/ColorLab review; no offline plan/execution |
| Live | Bounded note/checkpoint/usage/photo/reconciliation intents | Original command/epoch; existing signed service |
| Stock intake/count | Form preparation | Fresh online review; recount after intervening movements |
| Stock usage | Live usage intent; authoritative consumption remains derived | Online stock processing, never a local balance write |
| Payment/expense/cash close | Encrypted form preparation | Fresh online review; closure/ledger facts never auto-finalize |
| Cost/commission/report/SaaS | No offline business facts | Server-derived / online authority |

START, recipe revision/execution, transfer/recovery, COMPLETE, payment/refund,
inventory movement/count confirmation and subscription administration never become
offline commits. Local preparation cannot grant those permissions or entitlements.

Web: AES-GCM ciphertext in `elifora-offline-intents` IndexedDB, max 100 intents per
verified scope, 64 KiB command payload and 4 MiB supported photo attachment.
Accepted local copies are pruned on subsequent writes once no pending child needs
their acceptance marker. This prevents ordinary online saves exhausting the local
intent budget; permanent business replay remains in authoritative server receipts.
Keys are domain-separated on the server and returned only after authenticated
membership resolution. They are non-exportable WebCrypto handles in memory;
no provider/signing key is sent to the browser or written to local storage.
Device UUIDs are random identifiers, not authority.

Legacy Live IndexedDB intents are sealed atomically before their plaintext is
removed. A server-derived public ECDH key allows sealing without granting the
current account access to another member's draft. Recovering the wrapped content
key requires a fresh authenticated match to the original membership/location;
the authenticated scope is AES-GCM additional data. Original IDs, epochs, versions
and photo bytes survive conversion into the common envelope. Unsupported legacy
commands remain sealed for explicit review, never auto-executed or discarded.

Sign-out/workspace switch broadcasts a memory lock. Backgrounding conceals the
draft panel and clears its key. Ciphertext is retained, requiring the same user's
fresh authorized membership to reopen. Another account or organization receives
a different key and scope. The panel explains retention; explicit discard warns
before deleting unsynced intent. Server-key rotation intentionally prevents
decrypting older ciphertext unless an explicit key-retention migration is provided.

Hair supports the already-open controlled editor during a connection loss.
Appointment, Client and Color preparation is deliberately narrower: capture the
form intent before leaving the validated screen; the private schedule/profile is
concealed on connection/lifecycle changes. Preparing or inspecting a local draft
does not imply offline navigation or full form restoration. Financial/stock form
preparations remain explicit manual review/re-entry in their fresh domain screens.

Android: the domain controller resolves authenticated user and fresh memberships
before binding/restoring. Keystore-backed per-scope encryption is behind a data
repository and explicit DI. Hair commands are journaled before transport. Lifecycle
concealment/sign-out invalidates late results. This is a foundation, not offline
feature parity for Live, ColorLab, Finance or Stock.
