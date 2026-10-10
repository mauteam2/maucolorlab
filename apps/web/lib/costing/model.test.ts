import {it,expect} from "vitest";
import {z} from "zod";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import * as m from "./model";
import {costingFixture} from "@/test/costing-fixtures";
it("shares runtime schemas with the machine-readable costing contract",()=>{
 const schemas={CostStatus:m.costStatus,StockCostBasis:m.stockCostBasis,DirectCostFact:m.directCostFact,CommissionPolicy:m.commissionPolicy,CommissionAssignment:m.commissionAssignment,CommissionAccrual:m.commissionAccrual,CommissionAdjustment:m.commissionAdjustment,ProfitabilityStatus:m.profitabilityStatus,ProfitabilityBreakdown:m.profitabilityBreakdown,CostingCommand:m.costingCommand,CostingReadRequest:m.costingReadRequest,CostingSnapshot:m.costingSnapshot,CostingResult:m.costingResult};
 const generated=Object.fromEntries(Object.entries(schemas).map(([name,schema])=>[name,z.toJSONSchema(schema,{unrepresentable:"any"})]));const path=resolve("../../contracts/costing.schemas.json");
 if(process.env.ELIFORA_GENERATE_CONTRACTS==="true"){writeFileSync(path,JSON.stringify(generated,null,2)+"\n");writeFileSync(resolve("../../contracts/fixtures/costing-contract.json"),JSON.stringify(costingFixture(),null,2)+"\n");}
 expect(JSON.parse(readFileSync(path,"utf8"))).toEqual(generated);
});
it("accepts explicit unknown and preserves unavailable contribution",()=>{const r=m.profitabilityBreakdown.parse(costingFixture().breakdown);expect(r.direct_product_cost_minor).toBeNull();expect(r.margin_bps).toBeNull();});
it.each(["organization_id","location_id","direct_cost_minor","weighted_average","cost_basis_version","commission_amount","commission_policy_snapshot","profitability","margin","stock_movement_id","source_revenue","performed_by"])("rejects forged authoritative %s",key=>expect(m.costingCommand.safeParse({...costingFixture().command,[key]:"0"}).success).toBe(false));
it("does not accept float minor units",()=>expect(m.costingCommand.safeParse({...costingFixture().command,method:"FIXED_AMOUNT",rate_bps:null,fixed_minor:100}).success).toBe(false));
it("requires one percentage or fixed basis",()=>expect(m.costingCommand.safeParse({...costingFixture().command,fixed_minor:"100"}).success).toBe(false));
it("requires bounded exact list offset",()=>{expect(m.costingReadRequest.safeParse({offset:0.5}).success).toBe(false);expect(m.costingReadRequest.safeParse({offset:10001}).success).toBe(false);});
it("retains currency precision including zero and three exponents",()=>{for(const currency of ["JPY","KWD"]){expect(m.costingCommand.safeParse({...costingFixture().command,currency}).success).toBe(true);}});
