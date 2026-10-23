import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { StatusBadge, TechnicalNotice, WorkflowRail } from "./professional-ui";
import { liveLabel } from "@/lib/live/display";
import { operationalStatus } from "@/lib/i18n/operational-status";

afterEach(cleanup);
it("expresses unknown and safety in text without relying on color", () => {
 render(<><StatusBadge tone="unknown">Miktar bilinmiyor</StatusBadge><TechnicalNotice title="Güvenlik nedeniyle durduruldu" tone="risk"><p>Fiziksel test gerekli.</p></TechnicalNotice></>);
 expect(screen.getByText("Miktar bilinmiyor")).toHaveAttribute("data-tone", "unknown");
 expect(screen.getByText("Güvenlik nedeniyle durduruldu")).toBeVisible();
 expect(screen.getByText("Fiziksel test gerekli.")).toBeVisible();
});
it("workflow orientation is not an executable shortcut or a completed gate", () => {
 render(<WorkflowRail steps={["Müşteri", "Hedef", "Değerlendirme", "Reçete"]} current={2}/>);
 expect(screen.getByText("Değerlendirme")).toHaveAttribute("aria-current", "step");
 expect(screen.getByText("Reçete")).toHaveAttribute("data-complete", "false");
 expect(screen.queryByRole("button")).toBeNull();
});
it("future technical statuses fail cautiously rather than claiming approval", () => {
 expect(liveLabel("NEW_UNKNOWN_GATE")).toBe("Teknik inceleme gerekli");
 expect(liveLabel("PROCEED")).toBe("İlerlemeye uygun");
 expect(liveLabel("PENDING")).toBe("Bekliyor");
 expect(operationalStatus("UNKNOWN")).toBe("Bilinmiyor");
 expect(operationalStatus("DEPOSIT")).toBe("Depozito");
});
