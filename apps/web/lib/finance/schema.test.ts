import {it,expect} from "vitest";
import {z} from "zod";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import * as m from "./model";
import {financeFixture} from "@/test/finance-fixtures";
it("shared finance shapes are generated from exact runtime validators",()=>{
 const schemas=Object.fromEntries(Object.entries({Money:m.money,FinanceCommand:m.financeCommand,FinanceReadRequest:m.financeReadRequest,FinanceCharge:m.financeCharge,FinancePayment:m.financePayment,PaymentAllocation:m.paymentAllocation,Deposit:m.deposit,Refund:m.refund,Expense:m.expense,ClientBalance:m.clientBalance,CashSession:m.cashSession,FinanceSummary:m.financeSummary,FinanceSnapshot:m.financeSnapshot,FinanceResult:m.financeResult,FinanceError:m.financeError}).map(([name,s])=>{const schema=z.toJSONSchema(s,{io:"input",unrepresentable:"any"});delete schema.$schema;return [name,schema];}));
 const path=resolve("../../contracts/finance.schemas.json"),fixturePath=resolve("../../contracts/fixtures/finance-contract.json"),f=financeFixture();
 if(process.env.ELIFORA_REGENERATE_FINANCE_CONTRACT==="1"){writeFileSync(path,JSON.stringify(schemas,null,2)+"\n");writeFileSync(fixturePath,JSON.stringify({snapshot:f.snapshot,command:f.command},null,2)+"\n");}
 expect(JSON.parse(readFileSync(path,"utf8"))).toEqual(schemas);const fixture=JSON.parse(readFileSync(fixturePath,"utf8"));m.financeCommand.parse(fixture.command);m.financeSnapshot.parse(fixture.snapshot);
});
