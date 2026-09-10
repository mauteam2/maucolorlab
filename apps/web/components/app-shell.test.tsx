import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("exposes the ELIFORA identity and a keyboard skip link", () => {
    render(<AppShell><main id="main-content">İçerik</main></AppShell>);

    expect(screen.getByRole("link", { name: "ELIFORA ana sayfa" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "İçeriğe geç" })).toHaveAttribute("href", "#main-content");
  });
});

