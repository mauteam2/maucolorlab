import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HairPhysicalTestForm } from "./hair-physical-test-form";
import { newPhysicalTestDraft } from "@/lib/hair-passport/physical-test-editor";
import { hairSnapshot } from "@/lib/hair-passport/contracts";
import { readFixtures } from "@/test/hair-passport-fixtures";
import { hairPhysicalTestTr as p } from "@/lib/i18n/hair-tr";

afterEach(cleanup);
const snapshot = () => hairSnapshot.parse(structuredClone(readFixtures.populated.data));
function form(draft = newPhysicalTestDraft(), change = vi.fn()) {
 render(<HairPhysicalTestForm snapshot={snapshot()} draft={draft} change={change} save={vi.fn()} cancel={vi.fn()} saving={false} error={null} fieldError={null} reload={vi.fn()} />);
 return change;
}
it("offers type-specific porosity and elasticity choices and a separate strand finding", () => {
 const change = form();
 expect(screen.getByLabelText(p.porosityResult)).toHaveTextContent("Düşük");
 fireEvent.change(screen.getByLabelText(p.type), { target: { value: "ELASTICITY" } });
 expect(change).toHaveBeenCalledWith(expect.objectContaining({ type: "ELASTICITY", value: "" }));
 cleanup(); form({ ...newPhysicalTestDraft(), type: "ELASTICITY" });
 expect(screen.getByLabelText(p.elasticityResult)).toHaveTextContent("Normal");
 cleanup(); form({ ...newPhysicalTestDraft(), type: "STRAND" });
 expect(screen.getByLabelText(p.strandResult).tagName).toBe("TEXTAREA");
 expect(screen.queryByLabelText(p.porosityResult)).toBeNull();
});
it("only offers active, human-readable regions and hides known value for unknown state", () => {
 form({ ...newPhysicalTestDraft(), state: "UNKNOWN" });
 expect(screen.getByLabelText(p.region)).toHaveTextContent("Dip");
 expect(screen.getByLabelText(p.region).textContent).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}/);
 expect(screen.queryByLabelText(p.porosityResult)).toBeNull();
});
it("renders accessible validation and backend errors", () => {
 render(<HairPhysicalTestForm snapshot={snapshot()} draft={newPhysicalTestDraft()} change={vi.fn()} save={vi.fn()} cancel={vi.fn()} saving={false} error="HAIR_REGION_NOT_FOUND" fieldError="result" reload={vi.fn()} />);
 expect(screen.getAllByRole("alert").map(item => item.textContent).join(" ")).toContain(p.validation.result);
 expect(screen.getAllByRole("alert").map(item => item.textContent).join(" ")).toContain(p.errors.HAIR_REGION_NOT_FOUND);
});
