import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/app/sign-in/actions", () => ({ logout: vi.fn() }));
vi.mock("@/app/workspaces/actions", () => ({ changeWorkspace: vi.fn() }));
import { WorkspaceShell } from "./workspace-shell";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("conceals tenant identity until a fresh session request completes", async () => {
  const fetch = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetch);
  render(<WorkspaceShell />);
  expect(screen.queryByRole("heading", { name: "Çalışma alanınız hazır." })).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("Erişiminiz doğrulanıyor");
  expect(fetch).toHaveBeenCalledWith("/api/session", expect.objectContaining({ cache: "no-store" }));
});
it("stays concealed when initial verification fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<WorkspaceShell />);
  expect(await screen.findByText(/Bağlantı kurulamadı/)).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Çalışma alanınız hazır." })).toBeNull();
});
