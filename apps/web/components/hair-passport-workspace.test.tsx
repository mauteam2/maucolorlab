import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/hair-passport/load", () => ({ loadPassport: vi.fn(), PassportLoadError: class extends Error { constructor(public code: string) { super(code); } } }));
vi.mock("@/lib/hair-passport/mutate", () => ({ sendHairMutation: vi.fn(), PassportMutationError: class extends Error { constructor(public code: string) { super(code); } } }));
import { loadPassport, PassportLoadError } from "@/lib/hair-passport/load";
import { sendHairMutation, PassportMutationError } from "@/lib/hair-passport/mutate";
import { HairPassportWorkspace } from "./hair-passport-workspace";
import { hairTr as t, hairEditTr as e } from "@/lib/i18n/hair-tr";
import { readFixtures } from "@/test/hair-passport-fixtures";
const loaded = { client: { full_name: "Sentetik müşteri", status: "ARCHIVED" }, snapshot: null, permissions: ["hair_passport.create", "hair_passport.update"], workspaceReference: "selection" } as Awaited<ReturnType<typeof loadPassport>>;
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it("conceals identity on initial load, then renders archived no-passport state", async () => {
 let resolve!: (value: typeof loaded) => void;
 vi.mocked(loadPassport).mockImplementation(() => new Promise(r => { resolve = r; }));
 render(<HairPassportWorkspace clientId="test" />);
 expect(screen.queryByText(loaded.client.full_name)).toBeNull(); expect(screen.getByRole("status")).toHaveTextContent(t.loading);
 await act(async () => { await Promise.resolve(); resolve(loaded); });
 expect(screen.getByText(t.archived)).toBeVisible(); expect(screen.getByText(t.emptyTitle)).toBeVisible();
 expect(screen.queryByRole("button", { name: e.create })).toBeNull();
});
it("offers a minimal create action only to an active authorized user and reloads server state", async () => {
 const active = { ...loaded, client: { ...loaded.client, status: "ACTIVE" as const } };
 vi.mocked(loadPassport).mockResolvedValueOnce(active).mockResolvedValue({ ...active, snapshot: readFixtures.populated.data as typeof active.snapshot });
 vi.mocked(sendHairMutation).mockResolvedValue({} as Awaited<ReturnType<typeof sendHairMutation>>);
 render(<HairPassportWorkspace clientId="test" />);
 fireEvent.click(await screen.findByRole("button", { name: e.create }));
 expect(screen.getByRole("heading", { name: e.createTitle })).toBeVisible();
 fireEvent.click(screen.getByRole("button", { name: e.save }));
 expect(await screen.findByText(e.saved)).toBeVisible();
 expect(vi.mocked(sendHairMutation).mock.calls[0]![0]).toMatchObject({ operation: "create_passport", payload: { request_id: expect.any(String) } });
 expect(screen.getAllByRole("heading", { name: "Dip" }).length).toBeGreaterThan(0);
});
it("keeps active read-only users free of mutation controls", async () => {
 vi.mocked(loadPassport).mockResolvedValue({ ...loaded, client: { ...loaded.client, status: "ACTIVE" }, permissions: ["hair_passport.read"] } as typeof loaded);
 render(<HairPassportWorkspace clientId="test" />);
 await screen.findByText(t.emptyTitle);
 expect(screen.queryByRole("button", { name: e.create })).toBeNull();
});
it("shows a version conflict and safe reload action without a saved notice", async () => {
 const active = { ...loaded, client: { ...loaded.client, status: "ACTIVE" as const } };
 vi.mocked(loadPassport).mockResolvedValue(active);
 vi.mocked(sendHairMutation).mockRejectedValue(new PassportMutationError("CONFLICT"));
 render(<HairPassportWorkspace clientId="test" />);
 fireEvent.click(await screen.findByRole("button", { name: e.create }));
 fireEvent.click(screen.getByRole("button", { name: e.save }));
 expect(await screen.findByText(e.errors.CONFLICT)).toBeVisible();
 expect(screen.queryByText(e.saved)).toBeNull();
 fireEvent.click(screen.getByRole("button", { name: e.reload }));
 expect(await screen.findByRole("button", { name: e.create })).toBeVisible();
});
it("rechecks access after mutation permission loss", async () => {
 const active = { ...loaded, client: { ...loaded.client, status: "ACTIVE" as const } };
 vi.mocked(loadPassport).mockResolvedValueOnce(active).mockResolvedValue({ ...active, permissions: ["hair_passport.read"] });
 vi.mocked(sendHairMutation).mockRejectedValue(new PassportMutationError("FORBIDDEN"));
 render(<HairPassportWorkspace clientId="test" />);
 fireEvent.click(await screen.findByRole("button", { name: e.create }));
 fireEvent.click(screen.getByRole("button", { name: e.save }));
 await screen.findByText(t.emptyTitle);
 expect(screen.queryByRole("button", { name: e.create })).toBeNull();
 expect(screen.queryByText(e.saved)).toBeNull();
});
it.each(["FORBIDDEN", "CLIENT_NOT_FOUND", "NETWORK_ERROR"])("conceals data on %s and allows retry", async code => {
 vi.mocked(loadPassport).mockRejectedValueOnce(new PassportLoadError(code)).mockResolvedValue(loaded);
 render(<HairPassportWorkspace clientId="test" />);
 expect(await screen.findByRole("alert")).toHaveTextContent(t.errors[code as keyof typeof t.errors]);
 expect(screen.queryByText(loaded.client.full_name)).toBeNull();
 fireEvent.click(screen.getByText(t.retry)); expect(await screen.findByText(loaded.client.full_name)).toBeVisible();
});
it("conceals prior identity during focus revalidation and ignores superseded responses", async () => {
 let resolve!: (value: typeof loaded) => void;
 vi.mocked(loadPassport).mockResolvedValueOnce(loaded).mockImplementation(() => new Promise(r => { resolve = r; }));
 render(<HairPassportWorkspace clientId="test" />); await screen.findByText(loaded.client.full_name);
 fireEvent.focus(window); expect(screen.queryByText(loaded.client.full_name)).toBeNull();
 fireEvent(window, new Event("offline"));
 await act(async () => resolve(loaded));
 expect(screen.queryByText(loaded.client.full_name)).toBeNull(); expect(screen.getByRole("alert")).toBeVisible();
});
