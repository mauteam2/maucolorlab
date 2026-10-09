import {it,expect,vi,afterEach} from "vitest";
import {render,screen,cleanup} from "@testing-library/react";
import {RecipeStockAvailability} from "./recipe-stock-availability";
import {stockFixture} from "@/test/stock-fixtures";
import {workspaceReference} from "@/lib/tenant/context";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("out-of-stock verified selection is visible without a substitute or mutation",async()=>{const f=stockFixture();f.snapshot.items[0]!.on_hand=0;f.snapshot.items[0]!.stock_status="OUT";const fetcher=vi.fn(async()=>Response.json({context:f.context,data:f.snapshot}));vi.stubGlobal("fetch",fetcher);render(<RecipeStockAvailability productId={crypto.randomUUID()} developerId={crypto.randomUUID()} reference={workspaceReference(f.context)}/>);expect((await screen.findAllByText(/OUT_OF_STOCK/)).length).toBe(2);expect(fetcher.mock.calls).toHaveLength(2);expect(screen.getByText(/Ürün veya geliştirici otomatik değiştirilmez/)).toBeVisible();});
it("missing or forbidden stock remains UNKNOWN",async()=>{const f=stockFixture();vi.stubGlobal("fetch",vi.fn(async()=>Response.json({code:"FORBIDDEN"},{status:403})));render(<RecipeStockAvailability productId={crypto.randomUUID()} developerId={crypto.randomUUID()} reference={workspaceReference(f.context)}/>);expect((await screen.findAllByText(/UNKNOWN/)).length).toBe(2);expect(screen.queryByText(/Yeterli/)).toBeNull();});
it("another workspace response is never shown as available",async()=>{const f=stockFixture();vi.stubGlobal("fetch",vi.fn(async()=>Response.json({context:f.context,data:f.snapshot})));render(<RecipeStockAvailability productId={crypto.randomUUID()} developerId={crypto.randomUUID()} reference="different-workspace"/>);expect((await screen.findAllByText(/UNKNOWN/)).length).toBe(2);});
