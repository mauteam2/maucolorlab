import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CatalogDiscoverySelector, ColorRegistryLibrary } from "./color-registry";
import { unsupportedRegistryMessage } from "@/lib/brand/registry-model";
const row = { id: "c2000000-0000-4000-8000-000000000001", lineId: "keune-tinta", line: "Tinta Color", brandId: "keune", brand: "Keune", manufacturer: "Keune", region: "GB", state: "SOURCE_COLLECTED", lastReviewedAt: null, recipeSupport: false, catalogId: null, shadeCount: 0, developerCount: 0, ruleCount: 0, sources: [] };
const fetcher = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetcher); fetcher.mockReset().mockResolvedValue(Response.json({ data: { schemaVersion: 1, total: 1, offset: 0, limit: 25, brands: [{ id: "keune", name: "Keune" }], regions: ["GB"], items: [row] } })); });
it("information-only ColorLab selection never calls any recipe mutation", async () => {
 render(<CatalogDiscoverySelector/>);
 expect(fetcher).not.toHaveBeenCalled();
 await act(async () => { fireEvent.click(screen.getByText("Listelenen serileri incele")); });
 await screen.findByRole("option", { name: "Keune · Tinta Color · GB" });
 fireEvent.change(screen.getByLabelText("Listelenen seri"), { target: { value: row.id } });
 expect(screen.getByText(unsupportedRegistryMessage)).toBeVisible();
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(fetcher.mock.calls[0]![1].method).toBeUndefined();
});
it("library distinguishes metadata and technical support and submits regional filters", async () => {
 render(<ColorRegistryLibrary/>);
 await screen.findByText(unsupportedRegistryMessage);
 expect(screen.getByText(/Ton metadata: 0/)).toBeVisible();
 fireEvent.change(screen.getByLabelText("Pazar"), { target: { value: "GB" } });
 fireEvent.click(screen.getByRole("button", { name: "Filtrele" }));
 await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
 expect(fetcher.mock.calls[1]![0]).toContain("region=GB");
});
