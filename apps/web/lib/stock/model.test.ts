import {describe,it,expect} from "vitest";
import {stockCommand,stockReadRequest,stockPermission} from "./model";
const id="c4000000-0000-4000-8000-000000000101";
const move={type:"RECEIPT",mutation_id:id,stock_item_id:id,lot_id:null,quantity:10.25,unit:"GRAM",occurred_at:"2026-10-09T12:00:00Z",reference:null,reason:"Measured receipt"};
describe("stock input safety",()=>{
 it("accepts actual decimal receipt",()=>expect(stockCommand.safeParse(move).success).toBe(true));
 for(const key of ["organization_id","location_id","actor","balance","source_event_id","source_session_id","stock_sync_status"])it(`rejects forged ${key}`,()=>expect(stockCommand.safeParse({...move,[key]:id}).success).toBe(false));
 for(const quantity of [-1,0,0.001,Infinity,NaN,1e15])it(`rejects invalid receipt quantity ${quantity}`,()=>expect(stockCommand.safeParse({...move,quantity}).success).toBe(false));
 it("keeps measured zero opening",()=>expect(stockCommand.safeParse({...move,type:"OPENING",quantity:0}).success).toBe(true));
 it("rejects fractional pieces",()=>expect(stockCommand.safeParse({...move,unit:"UNIT",quantity:1.5}).success).toBe(false));
 it("does not coerce string quantities",()=>expect(stockCommand.safeParse({...move,quantity:"10"}).success).toBe(false));
 it("requires factual effective date",()=>expect(stockCommand.safeParse({...move,occurred_at:"2026-10-09"}).success).toBe(false));
 it("rejects forged count basis",()=>expect(stockCommand.safeParse({type:"COUNT_CREATE",mutation_id:id,id,reason:"Count",lines:[{stock_item_id:id,lot_id:null,counted_quantity:0,ledger_quantity:10}]}).success).toBe(false));
 it("rejects duplicate count scope",()=>expect(stockCommand.safeParse({type:"COUNT_CREATE",mutation_id:id,id,reason:"Count",lines:Array(2).fill({stock_item_id:id,lot_id:null,counted_quantity:0})}).success).toBe(false));
 it("bounds read and worker batches",()=>{expect(stockReadRequest.safeParse({offset:10001}).success).toBe(false);expect(stockCommand.safeParse({type:"PROCESS_BATCH",mutation_id:id,limit:21}).success).toBe(false);});
 it("does not accept density conversion hints",()=>expect(stockCommand.safeParse({...move,density:1}).success).toBe(false));
 it("separates view and write permissions",()=>{expect(stockPermission("RECEIPT")).toBe("stock.receive");expect(stockPermission("COUNT_CONFIRM")).toBe("stock.count");expect(stockPermission("PROCESS_BATCH")).toBe("stock.adjust");});
});
