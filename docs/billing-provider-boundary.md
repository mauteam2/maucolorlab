# ELIFORA billing provider boundary

No live provider, secret, price, checkout or subscription payment is configured.
The server-only BillingProviderAdapter verifies original bounded raw bytes and
headers before producing a strict normalized subscription command. Mutation of the
signature bytes is rejected. An internal verification marker cannot be recreated
by JSON. ProviderEventStore is injected; no browser credentials or platform-admin
route are introduced. An absent adapter fails closed.

Private operator-only customer links map provider/customer references to an actual
organization; webhook payloads do not choose tenant ownership. The inbox stores
provider/event ID, organization, verified flag, receive time and raw payload hash.
It stores no raw payment body/card number. Immutable processing results retain
APPLIED/REJECTED outcomes. Same event ID/hash returns the original result once;
changed payload hash is an integrity conflict. Expected subscription version rejects
out-of-order state changes. Link/subscription changes are actor/reason audited.

Provider failures and quota/subscription rejections are separate control-plane
diagnostics. They are not salon-business performance or Finance transactions.
Actual provider signature schemes, credentials, reconciliation and production
retention require separately approved integration work.
