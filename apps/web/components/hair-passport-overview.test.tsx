import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HairPassportOverview, EvidenceBadge, TechnicalStateCard } from "./hair-passport-overview";
import { hairSnapshot } from "@/lib/hair-passport/contracts";
import { readFixtures } from "@/test/hair-passport-fixtures";
import { hairTr as t } from "@/lib/i18n/hair-tr";
const snapshot = () => hairSnapshot.parse(structuredClone(readFixtures.populated.data));
afterEach(cleanup);
it("renders recorded core values and distinguishes unknown, unassessed and inapplicable", () => {
 render(<TechnicalStateCard assessment={snapshot().core} />);
 expect(screen.getByText("Doğal seviye").nextElementSibling).toHaveTextContent("5");
 expect(screen.getAllByText(t.states.UNKNOWN).length).toBeGreaterThan(0);
 expect(screen.getAllByText(t.states.NOT_ASSESSED).length).toBeGreaterThan(0);
 expect(screen.getAllByText(t.states.NOT_APPLICABLE).length).toBeGreaterThan(0);
});
it("renders a fully populated core without inventing aggregate confidence", () => {
 const s = snapshot(); if (s.core.state !== "ASSESSED") throw Error();
 const values = s.core.observation;
 Object.assign(values, { perceived_level: { state: "KNOWN", value: 6 }, grey_ratio: { state: "KNOWN", value: .25 }, thickness: { state: "KNOWN", value: "FINE" }, density: { state: "KNOWN", value: "HIGH" }, porosity: { state: "KNOWN", value: "LOW" }, elasticity: { state: "KNOWN", value: "NORMAL" }, tone: { state: "KNOWN", value: "Bakır" } });
 render(<TechnicalStateCard assessment={s.core} />);
 for (const value of ["%25", "İnce", "Yüksek", "Düşük", "Normal", "Bakır"]) expect(screen.getByText(value)).toBeVisible();
 expect(screen.queryByText(/Case Confidence|risk skoru/)).toBeNull();
});
it("renders default and custom regions plus partial unverified state", () => {
 const s = hairSnapshot.parse(readFixtures.empty.data);
 s.regions = (["ROOT", "MID_LENGTHS", "ENDS", "CUSTOM"] as const).map((type, index) => ({ id: `b2000000-0000-4000-8000-00000000005${index}`, type, label: type === "CUSTOM" ? "Uzun özel bölge açıklaması" : null, status: "ACTIVE", version: 1, updated_at: s.passport.updated_at, assessment: { state: "NOT_ASSESSED", observation: null } }));
 s.regions.reverse();
 render(<HairPassportOverview snapshot={s} change={vi.fn()} />);
 for (const name of ["Dip", "Boylar", "Uçlar", "Özel bölge · Uzun özel bölge açıklaması"]) expect(screen.getByRole("heading", { name })).toBeVisible();
 expect(screen.getAllByRole("heading", { level: 3 }).map(heading => heading.textContent)).toEqual(["Dip", "Boylar", "Uçlar", "Özel bölge · Uzun özel bölge açıklaması"]);
 for (const text of [t.noObservations, t.noTests, t.noHistory]) expect(screen.getByText(text)).toBeVisible();
});
it.each(Object.keys(t.sources) as Array<keyof typeof t.sources>)("labels %s evidence and displays only canonical confidence", source => {
 const e = snapshot().history.items[0]!.evidence; e.source = source;
 e.confidence = { state: "UNKNOWN", value: null };
 render(<EvidenceBadge evidence={e} />);
 expect(screen.getByText(t.sources[source])).toBeVisible(); expect(screen.getByText(t.noConfidence)).toBeVisible();
});
it("shows physical tests, approximate and unknown history dates, and evidence", () => {
 const s = snapshot(); const h = s.history.items[0]!;
 h.performed_on = { state: "APPROXIMATE", value: "2025-01-01" };
 s.history.items.push({ ...h, id: crypto.randomUUID(), performed_on: { state: "UNKNOWN", value: null } });
 render(<HairPassportOverview snapshot={s} change={vi.fn()} />);
 expect(screen.getByText(/Yaklaşık ·/)).toBeVisible(); expect(screen.getByText(t.unknownDate)).toBeVisible();
 expect(screen.getByRole("heading", { name: t.testTypes[s.physical_tests.items[0]!.type] })).toBeVisible();
 expect(screen.getAllByText(/Kayıtlı güven düzeyi/).length).toBeGreaterThan(0);
 expect(screen.queryByText(s.passport.id)).toBeNull();
});
it("paginates tests independently with bounded controls", () => {
 const s = snapshot(); s.physical_tests.has_more = true; s.physical_tests.next_offset = 10;
 const change = vi.fn(); render(<HairPassportOverview snapshot={s} change={change} />);
 fireEvent.click(within(screen.getByRole("navigation", { name: t.tests })).getByText(t.next));
 expect(change).toHaveBeenCalledWith("tests_offset", 10);
 expect(within(screen.getByRole("navigation", { name: t.history })).getByText(t.next)).toBeDisabled();
});
it("shows unverified partial core without claiming an observation", () => {
 const s = snapshot(); if (s.core.state !== "ASSESSED") throw Error();
 render(<TechnicalStateCard assessment={{ state: "UNVERIFIED", values: s.core.observation }} />);
 expect(screen.getByText(t.states.UNVERIFIED)).toBeVisible(); expect(screen.queryByText(t.sources.AI_ESTIMATE)).toBeNull();
});
