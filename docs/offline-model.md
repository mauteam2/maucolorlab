# ELIFORA offline foundations

Offline storage contains pending user intent, never a second business database.
The authoritative record, actor, tenant, permission, subscription, availability,
stock balance and financial facts remain on the server. No authenticated HTML
cache or service worker is introduced.

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
verified scope, 64 KiB command payload and 10 MiB supported photo attachment.
Keys are domain-separated on the server and returned only after authenticated
membership resolution. They are non-exportable WebCrypto handles in memory;
no provider/signing key is sent to the browser or written to local storage.
Device UUIDs are random identifiers, not authority.

Sign-out/workspace switch broadcasts a memory lock. Backgrounding conceals the
draft panel and clears its key. Ciphertext is retained, requiring the same user's
fresh authorized membership to reopen. Another account or organization receives
a different key and scope. The panel explains retention; explicit discard warns
before deleting unsynced intent. Server-key rotation intentionally prevents
decrypting older ciphertext unless an explicit key-retention migration is provided.

Android: the domain controller resolves authenticated user and fresh memberships
before binding/restoring. Keystore-backed per-scope encryption is behind a data
repository and explicit DI. Hair commands are journaled before transport. Lifecycle
concealment/sign-out invalidates late results. This is a foundation, not offline
feature parity for Live, ColorLab, Finance or Stock.
