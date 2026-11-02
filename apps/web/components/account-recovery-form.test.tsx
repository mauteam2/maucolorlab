import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const m = vi.hoisted(() => ({ code: "", action: vi.fn() }));
vi.mock("react", async original => ({ ...await original<object>(), useActionState: () => [{ code: m.code }, m.action, false] }));
vi.mock("@/app/auth/recovery/actions", () => ({ requestRecovery: vi.fn(), updateRecoveredPassword: vi.fn() }));
vi.mock("@/lib/offline/vault", () => ({ lockDraftVault: vi.fn() }));
import { AccountRecoveryForm } from "./account-recovery-form";
beforeEach(() => { m.code="";vi.stubGlobal("BroadcastChannel",undefined); });
afterEach(() => { cleanup();vi.unstubAllGlobals(); });
it("never offers password update when the server cannot validate the recovery session", () => {
  render(<AccountRecoveryForm update validSession={false}/>);
  expect(screen.getByRole("heading", {name:"Kurtarma oturumu kullanılamıyor"})).toBeVisible();
  expect(screen.queryByLabelText("Yeni parola",{exact:true})).toBeNull();
});
it("keeps the real completion result after cookie revocation re-renders session validity", () => {
  const {rerender}=render(<AccountRecoveryForm update validSession/>);
  expect(screen.getByLabelText("Yeni parola",{exact:true})).toHaveAttribute("autocomplete","new-password");
  m.code="RECOVERY_COMPLETE";rerender(<AccountRecoveryForm update validSession={false}/>);
  expect(screen.getByRole("status")).toHaveTextContent("Parolanız güncellendi. Yeniden oturum açın.");
  expect(screen.queryByLabelText("Yeni parola",{exact:true})).toBeNull();
  expect(screen.queryByText("Kurtarma oturumu kullanılamıyor")).toBeNull();
});
it("does not claim old sessions were closed when the real action cannot confirm revocation", () => {
  m.code="RECOVERY_REVOKE_REQUIRED";render(<AccountRecoveryForm update validSession={false}/>);
  expect(screen.getByRole("alert")).toHaveTextContent("önceki oturumların kapatıldığı doğrulanamadı");
  expect(screen.queryByRole("button",{name:"Parolayı güncelle"})).toBeNull();
});
