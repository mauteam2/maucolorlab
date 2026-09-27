import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HairHistoryForm } from "./hair-history-form";
import { newHistoryDraft, type HistoryDraft } from "@/lib/hair-passport/history-editor";
import { hairSnapshot } from "@/lib/hair-passport/contracts";
import { readFixtures } from "@/test/hair-passport-fixtures";
import { hairHistoryTr as h, hairTr as t } from "@/lib/i18n/hair-tr";

afterEach(cleanup);
const snapshot = () => hairSnapshot.parse(structuredClone(readFixtures.populated.data));
function form(draft: HistoryDraft = newHistoryDraft(), change = vi.fn()) {
 render(<HairHistoryForm snapshot={snapshot()} draft={draft} change={change} save={vi.fn()} cancel={vi.fn()} saving={false} error={null} fieldError={null} reload={vi.fn()} />);
 return change;
}
it("shows all seven categories with natural labels", () => {
 form();
 const select = screen.getByLabelText(h.category);
 for (const label of Object.values(t.categories)) expect(select).toHaveTextContent(label);
 expect(select.textContent).not.toContain("BLEACH_LIGHTENING");
});
it("reveals exact or approximate date and hides it for unknown", () => {
 const change = form();
 expect(screen.queryByLabelText(h.exactDate)).toBeNull();
 fireEvent.change(screen.getByLabelText(h.dateState), { target: { value: "EXACT" } });
 expect(change).toHaveBeenCalledWith(expect.objectContaining({ dateState: "EXACT", date: "" }));
 cleanup(); form({ ...newHistoryDraft(), dateState: "EXACT" });
 expect(screen.getByLabelText(h.exactDate)).toHaveAttribute("type", "date");
 cleanup(); form({ ...newHistoryDraft(), dateState: "APPROXIMATE" });
 expect(screen.getByLabelText(h.approximateDate)).toHaveAttribute("type", "date");
 expect(screen.getByText(h.approximateHelp)).toBeVisible();
});
it("only shows product detail when known and supports active multi-region selection without duplicates", () => {
 const change = form({ ...newHistoryDraft(), productState: "KNOWN" });
 expect(screen.getByLabelText(h.product)).toBeVisible();
 fireEvent.click(screen.getByLabelText("Dip"));
 expect(change).toHaveBeenCalledWith(expect.objectContaining({ regionIds: [expect.any(String)] }));
 cleanup(); form({ ...newHistoryDraft(), regionIds: [snapshot().regions[0]!.id], productState: "NOT_APPLICABLE" });
 expect(screen.queryByLabelText(h.product)).toBeNull();
 expect(screen.getByLabelText("Dip")).toBeChecked();
 expect(screen.getByRole("group", { name: h.regions }).textContent).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}/);
});
it("renders accessible validation and mapped region errors", () => {
 render(<HairHistoryForm snapshot={snapshot()} draft={newHistoryDraft()} change={vi.fn()} save={vi.fn()} cancel={vi.fn()} saving={false} error="HAIR_REGION_NOT_FOUND" fieldError="description" reload={vi.fn()} />);
 expect(screen.getAllByRole("alert").map(item => item.textContent).join(" ")).toContain(h.validation.description);
 expect(screen.getAllByRole("alert").map(item => item.textContent).join(" ")).toContain(h.errors.HAIR_REGION_NOT_FOUND);
});
