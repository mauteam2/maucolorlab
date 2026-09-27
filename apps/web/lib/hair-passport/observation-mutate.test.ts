import { afterEach, expect, it, vi } from "vitest";
import fixtures from "../../../../contracts/fixtures/hair-observation-mutation.json";
import { sendObservation } from "./observation-mutate";
import { observationCommand } from "./observations";

const command = observationCommand.parse(fixtures.valid[2]!);
const reference = "b7000000-0000-4000-8000-000000000041:b7000000-0000-4000-8000-000000000051";
const context = { membership_id: reference.split(":")[0], location_id: reference.split(":")[1], organization_id: "b7000000-0000-4000-8000-000000000001", organization_name: "Test", location_name: "Test", role: "colorist", membership_status: "active", permissions: ["hair_passport.add_observation"] };
afterEach(() => vi.unstubAllGlobals());
it("checks current permission and sends the validated payload to the existing endpoint", async () => {
 const fetch = vi.fn().mockResolvedValueOnce(Response.json({ context })).mockResolvedValueOnce(Response.json(fixtures.results[2]));
 vi.stubGlobal("fetch", fetch);
 await sendObservation(command, reference, new AbortController().signal);
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(fetch.mock.calls[1]![0]).toBe(`/api/clients/${command.client_id}/hair-passport/observations`);
 expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual(command.payload);
});
it("denies mutation before POST when permission was removed", async () => {
 const fetch = vi.fn().mockResolvedValueOnce(Response.json({ context: { ...context, permissions: [] } }));
 vi.stubGlobal("fetch", fetch);
 await expect(sendObservation(command, reference, new AbortController().signal)).rejects.toMatchObject({ code: "FORBIDDEN" });
 expect(fetch).toHaveBeenCalledTimes(1);
});
it("preserves network uncertainty as retryable and surfaces domain rejection", async () => {
 const fetch = vi.fn().mockResolvedValueOnce(Response.json({ context })).mockRejectedValueOnce(new Error("offline"));
 vi.stubGlobal("fetch", fetch);
 await expect(sendObservation(command, reference, new AbortController().signal)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
 fetch.mockReset().mockResolvedValueOnce(Response.json({ context })).mockResolvedValueOnce(Response.json({ code: "HAIR_REGION_NOT_FOUND", message: "private", correlationId: crypto.randomUUID() }, { status: 404 }));
 await expect(sendObservation(command, reference, new AbortController().signal)).rejects.toMatchObject({ code: "HAIR_REGION_NOT_FOUND" });
});
