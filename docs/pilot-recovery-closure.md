# Controlled recovery procedure

Only synthetic staging data is authorized in this slice. Canonical project:
earjtmuhghmbzwychorf. Dedicated isolated drill target: ynfsbgvilkyvmpyncufx,
elifora-recovery-synthetic, outbound email providers disabled. Failed historical
target yzpjexdkhzahqhsumsxq is retained, empty and paused to free a Free-plan slot.
It must not be linked to the application, CI or canonical operator commands.

Backup separately captures schema, all application/private/Auth/Storage data,
immutable source facts, keys, catalog state, migration history, safe Auth/deployment
inventory, object bytes and a hash manifest. Archive encryption is AES-256-GCM;
plaintext exists only in operator memory. Store ciphertext outside the checkout
and the active cloud project. Custody/escrow of its encryption key must survive
the selected failure model; machine-bound local wrapping is not off-site escrow.
Never print DSNs with passwords, key material, auth rows or SQL dump errors.

Recreate schema using the exact ordered LF migrations and verify definition/ACL/
RLS evidence before restoring data. Provider migration metadata is recorded and
compared separately, never replaced with fabricated history. Preserve provider
Auth/Storage migration compatibility. Restore source facts with triggers disabled
only on the isolated synthetic target; the source is never truncated or reset.
Restore object bytes separately through Storage, then validate paths/relationships
and hashes; provider-generated version/etag metadata can change during re-upload.

The drill must reconcile nonempty finance, stock, audit, catalog and signed
history; validate two-tenant and revoked access; verify an actual image byte hash;
rebuild derived reports; and perform a new authorized controlled operation.
Record observed snapshot consistency, loss window and duration. Missing populated
domain or byte verification means PARTIALLY_CLOSED, not a complete backup gate.

No PITR or automatic external schedule is claimed. Before real admission appoint
the backup owner, external key custodian, retention and failure-alert process.
Suggested RPO/RTO are targets until a complete drill measures them. Free-plan
project pausing and quotas remain operational limitations, not hidden guarantees.
