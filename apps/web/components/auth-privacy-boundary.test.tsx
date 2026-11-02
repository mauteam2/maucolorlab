import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
const m = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => m }));
import { AuthPrivacyBoundary } from "./auth-privacy-boundary";
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it("conceals stale private context on offline/logout and reveals only a fresh server render", () => {
  const { rerender } = render(<AuthPrivacyBoundary verificationKey="server-one"><p>Private salon</p></AuthPrivacyBoundary>);
  expect(screen.getByText("Private salon")).toBeVisible();
  act(() => window.dispatchEvent(new Event("elifora-offline-lock")));
  expect(screen.queryByText("Private salon")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Erişimi yeniden kontrol et" }));
  expect(m.refresh).toHaveBeenCalledOnce();
  rerender(<AuthPrivacyBoundary verificationKey="server-one"><p>Private salon</p></AuthPrivacyBoundary>);
  expect(screen.queryByText("Private salon")).toBeNull();
  rerender(<AuthPrivacyBoundary verificationKey="server-two"><p>Fresh salon</p></AuthPrivacyBoundary>);
  expect(screen.getByText("Fresh salon")).toBeVisible();
});
it("revalidates a restored browser page without refreshing ordinary initial pageshow", () => {
  render(<AuthPrivacyBoundary verificationKey="server-one"><p>Private salon</p></AuthPrivacyBoundary>);
  act(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false })));
  expect(m.refresh).not.toHaveBeenCalled();
  act(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  expect(m.refresh).toHaveBeenCalledOnce();
  expect(screen.queryByText("Private salon")).toBeNull();
});
