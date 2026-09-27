import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/hair-passport/load", () => ({ loadPassport: vi.fn(), PassportLoadError: class extends Error { constructor(public code: string) { super(code); } } }));
import { loadPassport, PassportLoadError } from "@/lib/hair-passport/load";
import { HairPassportWorkspace } from "./hair-passport-workspace";
import { hairTr as t } from "@/lib/i18n/hair-tr";
const loaded = { client: { full_name: "Sentetik müşteri", status: "ARCHIVED" }, snapshot: null } as Awaited<ReturnType<typeof loadPassport>>;
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it("conceals identity on initial load, then renders archived no-passport state", async () => {
 let resolve!: (value: typeof loaded) => void;
 vi.mocked(loadPassport).mockImplementation(() => new Promise(r => { resolve = r; }));
 render(<HairPassportWorkspace clientId="test" />);
 expect(screen.queryByText(loaded.client.full_name)).toBeNull(); expect(screen.getByRole("status")).toHaveTextContent(t.loading);
 await act(async () => { await Promise.resolve(); resolve(loaded); });
 expect(screen.getByText(t.archived)).toBeVisible(); expect(screen.getByText(t.emptyTitle)).toBeVisible();
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
