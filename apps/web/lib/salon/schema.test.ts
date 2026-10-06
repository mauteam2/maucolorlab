import { expect,it } from "vitest";
import { z } from "zod";
import { readFileSync,writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as m from "./model";
import { salonFixture } from "@/test/salon-fixtures";
it("shared salon schemas and synthetic fixture match runtime boundaries",()=>{
 const schemas=Object.fromEntries(Object.entries({SalonCommand:m.salonCommand,SalonSnapshot:m.salonSnapshot,SalonAppointment:m.appointment,SalonService:m.service,SalonStaff:m.staff,SalonResource:m.resource,SalonSlotRequest:m.slotRequest,SalonSlotResult:m.slotResult,SalonPrecheck:m.precheckResult,SalonError:m.salonError}).map(([name,s])=>{const schema=z.toJSONSchema(s,{io:"input",unrepresentable:"any"});delete schema.$schema;return [name,schema];}));
 const path=resolve("../../contracts/salon-operations.schemas.json"),fixture=resolve("../../contracts/fixtures/salon-operations-contract.json"),f=salonFixture();
 if(process.env.ELIFORA_REGENERATE_SALON_CONTRACT==="1"){writeFileSync(path,JSON.stringify(schemas,null,2)+"\n");writeFileSync(fixture,JSON.stringify({command:f.command,snapshot:f.snapshot},null,2)+"\n");}
 expect(JSON.parse(readFileSync(path,"utf8"))).toEqual(schemas);const payload=JSON.parse(readFileSync(fixture,"utf8"));m.salonCommand.parse(payload.command);m.salonSnapshot.parse(payload.snapshot);
});
