import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { fixtureId } from "@/test/confidence-fixtures";
import { makeDraft, payloadHash, sameScope, type OfflineDraft, type OfflineIdentity } from "./model";
import { SyncCoordinator, syncFailure } from "./coordinator";
const identity: OfflineIdentity = { user_id: fixtureId(1), organization_id: fixtureId(2), location_id: fixtureId(3), membership_id: fixtureId(4), device_id: fixtureId(5), workspace_reference: `${fixtureId(4)}:${fixtureId(3)}` };
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
async function draft(index = 10, dependencies: string[] = []) { return makeDraft(identity, "HAIR_HISTORY", { payload: { request_id: fixtureId(index), description: "Synthetic historical intent", performed_on: { state: "UNKNOWN", value: null } } }, fixtureId(index), { base_version: 2, dependencies }); }
function harness(drafts: OfflineDraft[], dispatch = vi.fn().mockResolvedValue({}), fresh = vi.fn().mockResolvedValue(identity), clock = () => 1000000000000) {
 const records = new Map(drafts.map(d => [d.draft_id, structuredClone(d)]));
 const put = vi.fn(async (d: OfflineDraft) => { records.set(d.draft_id, structuredClone(d)); });
 return { records, dispatch, fresh, put, coordinator: new SyncCoordinator({ list: async () => [...records.values()], put }, dispatch, fresh, clock) };
}
it("canonical hashes preserve UNKNOWN and measured zero while ignoring object insertion order", async () => {
 expect(await payloadHash({ b: 0, a: null })).toBe(await payloadHash({ a: null, b: 0 }));
 expect(await payloadHash({ value: null })).not.toBe(await payloadHash({ value: 0 }));
});
it("commit without response retries the same mutation and expected version after process recovery", async () => {
 const original = await draft(), dispatch = vi.fn().mockRejectedValueOnce(new Error("NETWORK_ERROR")).mockResolvedValue({ correlationId: fixtureId(90) });
 let now = 1000000000000; const h = harness([original], dispatch, undefined, () => now);
 const first = await h.coordinator.batch(identity, new AbortController().signal);
 expect(first[0]?.status).toBe("PENDING_SYNC"); expect(first[0]?.attempt_count).toBe(1);
 expect(await h.coordinator.batch(identity, new AbortController().signal)).toHaveLength(0);
 now += 3 * 86400000;
 const recovered = harness([...h.records.values()], dispatch, undefined, () => now);
 expect((await recovered.coordinator.batch(identity, new AbortController().signal))[0]?.status).toBe("SYNCED");
 expect(dispatch.mock.calls[0]![0].mutation_id).toBe(dispatch.mock.calls[1]![0].mutation_id);
 expect(dispatch.mock.calls[1]![0]).toMatchObject({ base_version: 2, payload_hash: original.payload_hash });
});
it("process loss while SYNCING recovers pending intent without allocating an identity", async () => {
 const original = { ...await draft(), status: "SYNCING" as const }, h = harness([original]);
 expect((await h.coordinator.batch(identity, new AbortController().signal))[0]?.mutation_id).toBe(original.mutation_id);
 expect(h.dispatch).toHaveBeenCalledOnce();
});
it("version conflict preserves original payload and never automatically retries or rebases", async () => {
 const original = await draft(), h = harness([original], vi.fn().mockRejectedValue(new Error("CONFLICT")));
 expect((await h.coordinator.batch(identity, new AbortController().signal))[0]).toMatchObject({ status: "CONFLICT", conflict: "VERSION_CHANGED", base_version: 2, payload: original.payload });
 await h.coordinator.batch(identity, new AbortController().signal); expect(h.dispatch).toHaveBeenCalledOnce();
});
it("parent acceptance precedes child dispatch; rejected parent blocks child", async () => {
 const parent = await draft(10), child = await draft(11, [parent.draft_id]);
 const h = harness([parent, child]); await h.coordinator.batch(identity, new AbortController().signal);
 expect(h.dispatch.mock.calls.map(args => args[0].draft_id)).toEqual([parent.draft_id, child.draft_id]);
 const failed = harness([parent, child], vi.fn().mockRejectedValue(new Error("FORBIDDEN")));
 expect((await failed.coordinator.batch(identity, new AbortController().signal)).map(d => d.status)).toEqual(["REJECTED", "DEPENDENCY_BLOCKED"]);
 expect(failed.dispatch).toHaveBeenCalledOnce();
});
it("account and organization switching cannot dispatch another identity's intent", async () => {
 for (const field of ["user_id", "organization_id", "location_id", "membership_id", "device_id"] as const) {
  const other = { ...identity, [field]: fixtureId(99) }, h = harness([await draft()], undefined, vi.fn().mockResolvedValue(other));
  expect(sameScope(identity, other)).toBe(false);
  expect((await h.coordinator.batch(identity, new AbortController().signal))[0]).toMatchObject({ status: "REJECTED", conflict: "WORKSPACE_CHANGED" });
  expect(h.dispatch).not.toHaveBeenCalled();
 }
});
it("changed payload cannot reuse the persisted mutation identity", async () => {
 const h = harness([{ ...await draft(), payload: { changed: true } }]);
 expect((await h.coordinator.batch(identity, new AbortController().signal))[0]).toMatchObject({ status: "REJECTED", conflict: "PAYLOAD_CHANGED" });
 expect(h.dispatch).not.toHaveBeenCalled();
});
it.each(["PAYMENT", "EXPENSE", "CASH_CLOSE", "STOCK_COUNT", "STOCK_INTAKE", "STOCK_USAGE"] as const)("%s remains a draft requiring fresh explicit domain review", async domain => {
 const h = harness([{ ...await draft(), domain }]); expect((await h.coordinator.batch(identity, new AbortController().signal))[0]?.status).toBe("REVIEW_REQUIRED"); expect(h.dispatch).not.toHaveBeenCalled();
});
it.each(["MEMBERSHIP_REVOKED", "SESSION_EXPIRED", "CLIENT_ARCHIVED"])("%s stops sync without destroying unsynced intent", async code => {
 const h = harness([await draft()], vi.fn().mockRejectedValue(new Error(code))); expect((await h.coordinator.batch(identity, new AbortController().signal))[0]).toMatchObject({ status: "REJECTED", conflict: "AUTHORITY_EXPIRED" });
});
it("bounded batch processes at most ten and abort prevents dispatch", async () => {
 const h = harness(await Promise.all(Array.from({ length: 12 }, (_, i) => draft(10 + i))));
 expect(await h.coordinator.batch(identity, new AbortController().signal)).toHaveLength(10);
 const controller = new AbortController(); controller.abort(); expect(await h.coordinator.batch(identity, controller.signal)).toHaveLength(0);
 await expect(h.coordinator.batch(identity, controller.signal, 11)).rejects.toThrow("SYNC_BATCH_LIMIT");
});
it("subscription, controller, availability, stock and cash conflicts remain distinct", () => {
 expect(syncFailure("SUBSCRIPTION_RESTRICTED")).toMatchObject({ status: "REVIEW_REQUIRED", conflict: "SUBSCRIPTION_CHANGED" });
 expect(syncFailure("LIVE_CONTROLLER_CONFLICT").conflict).toBe("CONTROL_EPOCH_CHANGED");
 expect(syncFailure("APPOINTMENT_CONFLICT").conflict).toBe("AVAILABILITY_CHANGED");
 expect(syncFailure("STOCK_CONFLICT").conflict).toBe("STOCK_CHANGED");
 expect(syncFailure("CASH_CONFLICT").conflict).toBe("CASH_CHANGED");
});
