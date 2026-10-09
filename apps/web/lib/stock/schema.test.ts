import {it,expect} from "vitest";
import {z} from "zod";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import * as m from "./model";
import {stockFixture} from "@/test/stock-fixtures";
it("stock shared schemas and fixture match runtime",()=>{
 const schemas=Object.fromEntries(Object.entries({StockDefinition:m.stockDefinition,StockCommand:m.stockCommand,StockReadRequest:m.stockReadRequest,StockItem:m.stockItem,StockLot:m.stockLot,StockMovement:m.stockMovement,StockEvent:m.stockEvent,StockAction:m.stockAction,StockCount:m.stockCount,StockSnapshot:m.stockSnapshot,StockResult:m.stockResult,StockError:m.stockError,StockBalance:m.stockBalance,StockReceipt:m.stockReceipt,StockAdjustment:m.stockAdjustment,StockCountLine:m.stockCountLine,StockSignal:m.stockSignal,StockSourceStatus:m.stockSourceStatus}).map(([name,s])=>{const schema=z.toJSONSchema(s,{io:"input",unrepresentable:"any"});delete schema.$schema;return [name,schema];}));
 const path=resolve("../../contracts/stock.schemas.json"),fixturePath=resolve("../../contracts/fixtures/stock-contract.json"),fixture=stockFixture();
 if(process.env.ELIFORA_REGENERATE_STOCK_CONTRACT==="1"){writeFileSync(path,JSON.stringify(schemas,null,2)+"\n");writeFileSync(fixturePath,JSON.stringify({snapshot:fixture.snapshot,command:fixture.command},null,2)+"\n");}
 expect(JSON.parse(readFileSync(path,"utf8"))).toEqual(schemas);const payload=JSON.parse(readFileSync(fixturePath,"utf8"));m.stockSnapshot.parse(payload.snapshot);m.stockCommand.parse(payload.command);
});
