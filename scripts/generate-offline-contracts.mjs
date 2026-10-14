import { writeFileSync, readFileSync } from "node:fs";
import { z } from "../apps/web/node_modules/zod/index.js";
import * as model from "../apps/web/lib/offline/model.ts";
const id = z.uuid();
const recovery = z.strictObject({ type: z.literal("RECOVER_CONTROL"), mutation_id: id, device_id: id,
 expected_version: z.int().positive(), control_epoch: z.int().positive(), reason: z.string().trim().min(1).max(2000) });
const schemas = Object.fromEntries(Object.entries({ OfflineDraftMetadata: model.offlineDraftMetadata,
 SyncState: z.enum(model.syncStates), SyncResult: model.syncResult, ConflictType: z.enum(model.conflictTypes), ControllerRecovery: recovery
}).map(([name, schema]) => [name, z.toJSONSchema(schema, { target: "draft-2020-12" })]));
schemas.RecoveryResult = JSON.parse(readFileSync(new URL("../contracts/live-session.schemas.json", import.meta.url), "utf8")).LiveSession;
writeFileSync(new URL("../contracts/offline.schemas.json", import.meta.url), JSON.stringify(schemas, null, 2) + "\n");
const identity = { organization_id: "f8000000-0000-4000-8000-000000000001", location_id: "f8000000-0000-4000-8000-000000000002",
 user_id: "f8000000-0000-4000-8000-000000000003", device_id: "f8000000-0000-4000-8000-000000000004", membership_id: "f8000000-0000-4000-8000-000000000005", workspace_reference: "f8000000-0000-4000-8000-000000000005:f8000000-0000-4000-8000-000000000002" };
const draft = await model.makeDraft(identity, "HAIR_HISTORY", { value: null }, "f8000000-0000-4000-8000-000000000010");
const { payload, ...metadata } = draft;
writeFileSync(new URL("../contracts/fixtures/offline-contract.json", import.meta.url), JSON.stringify({ metadata,
 recovery: { type: "RECOVER_CONTROL", mutation_id: draft.mutation_id, device_id: identity.device_id, expected_version: 3, control_epoch: 1, reason: "Synthetic controller device lost" },
 result: { draft_id: draft.draft_id, status: "CONFLICT", conflict: "VERSION_CHANGED", correlation_id: null }
}, null, 2) + "\n");
