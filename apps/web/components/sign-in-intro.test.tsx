import { StrictMode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("sign-in intro", () => {
  const animate = vi.fn();
  let reduced = false;
  const listeners = new Set<() => void>();
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    sessionStorage.clear();
    reduced = false;
    listeners.clear();
    animate.mockReset().mockImplementation(() => ({ cancel: vi.fn(), currentTime: 0, onfinish: null }));
    vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }));
    Element.prototype.animate = animate;
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("guards form controls in the server HTML before hydration can start the intro", async () => {
    const { SignInIntro } = await import("./sign-in-intro");
    const html = renderToStaticMarkup(<SignInIntro><form><input name="email" /><button>Submit</button></form></SignInIntro>);
    expect(html).toContain('data-intro-gate="true" disabled=""');
    render(<SignInIntro><input aria-label="Hydration gate" /></SignInIntro>);
    expect(screen.getByLabelText("Hydration gate")).toBeDisabled();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByLabelText("Hydration gate")).toBeEnabled();
  });

  it("uses one 1500ms clock, makes the form usable at the deadline, and does not replay on render or remount", async () => {
    const { SignInIntro } = await import("./sign-in-intro");
    const view = render(<SignInIntro><input aria-label="E-posta" /></SignInIntro>);
    const main = screen.getByRole("main");
    const card = screen.getByLabelText("E-posta").closest("section")!;
    expect(main).toHaveAttribute("data-intro", "playing");
    expect(card.inert).toBe(true);
    expect(animate).toHaveBeenCalledTimes(5);
    for (const call of animate.mock.calls) expect(call[1].duration).toBe(1500);
    act(() => { vi.advanceTimersByTime(1499); });
    expect(card.inert).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(main).toHaveAttribute("data-intro", "complete");
    expect(card.inert).toBe(false);
    view.rerender(<SignInIntro><p role="alert">Hatalı parola</p><input aria-label="E-posta" /></SignInIntro>);
    expect(animate).toHaveBeenCalledTimes(5);
    view.unmount();
    render(<SignInIntro><input aria-label="E-posta" /></SignInIntro>);
    expect(animate).toHaveBeenCalledTimes(5);
  });

  it("resumes the same clock under Strict Mode and clears animations on unmount", async () => {
    const { SignInIntro } = await import("./sign-in-intro");
    const view = render(<StrictMode><SignInIntro><input /></SignInIntro></StrictMode>);
    expect(screen.getByRole("main")).toHaveAttribute("data-intro", "playing");
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByRole("main")).toHaveAttribute("data-intro", "complete");
    view.unmount();
    for (const result of animate.mock.results) expect(result.value.cancel).toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it("skips reduced motion immediately and remembers that visit", async () => {
    reduced = true;
    const { SignInIntro, INTRO_SESSION_KEY } = await import("./sign-in-intro");
    render(<SignInIntro><input /></SignInIntro>);
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByRole("main")).toHaveAttribute("data-intro", "complete");
    expect(sessionStorage.getItem(INTRO_SESSION_KEY)).toBe("played");
  });

  it("honors a previous visit in the same tab after a full document reload", async () => {
    sessionStorage.setItem("elifora.sign-in-intro.v1", "played");
    const { SignInIntro } = await import("./sign-in-intro");
    render(<SignInIntro><input /></SignInIntro>);
    expect(animate).not.toHaveBeenCalled();
  });

  it("keeps the preview idle until requested and does not consume the real login visit", async () => {
    const { SignInIntro, INTRO_SESSION_KEY } = await import("./sign-in-intro");
    const view = render(<SignInIntro preview="idle"><input /></SignInIntro>);
    expect(animate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(INTRO_SESSION_KEY)).toBeNull();
    view.unmount();
    render(<SignInIntro><input /></SignInIntro>);
    expect(animate).toHaveBeenCalledTimes(5);
  });

  it("allows an explicitly requested preview with reduced motion and an already consumed visit", async () => {
    reduced = true;
    sessionStorage.setItem("elifora.sign-in-intro.v1", "played");
    const { SignInIntro } = await import("./sign-in-intro");
    render(<SignInIntro preview="play"><input /></SignInIntro>);
    expect(animate).toHaveBeenCalledTimes(5);
    expect(screen.getByRole("main")).toHaveAttribute("data-intro", "playing");
    expect(screen.getByRole("main")).toHaveAttribute("data-preview", "true");
    expect(screen.getByRole("textbox")).toBeDisabled();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByRole("main")).toHaveAttribute("data-intro", "complete");
    expect(screen.getByRole("textbox")).toBeEnabled();
  });

  it("falls back to one play in the document if storage is unavailable", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Disabled"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Disabled"); });
    const { SignInIntro } = await import("./sign-in-intro");
    const view = render(<SignInIntro><input /></SignInIntro>);
    view.unmount();
    render(<SignInIntro><input /></SignInIntro>);
    expect(animate).toHaveBeenCalledTimes(5);
    get.mockRestore(); set.mockRestore();
  });
});
