import {expect,it} from "vitest";
import {liveClockNow,sampleLiveClock} from "./clock";
const iso=(n:number)=>new Date(1800000000000+n).toISOString();
it("subtracts slow server work instead of adding it as network latency",()=>{
 const s=sampleLiveClock(0,2400,iso(100),iso(2100))!;
 expect(s.serverProcessingMs).toBe(2000);expect(s.roundTripMs).toBe(2400);expect(s.uncertaintyMs).toBe(200);
 expect(s.serverAtReceipt).toBe(1800000002300);
});
it("additional client work does not move the receipt anchor",()=>{const s=sampleLiveClock(0,100,iso(20),iso(80))!;expect(liveClockNow(s,2100)).toBe(s.serverAtReceipt+2000);});
it("asymmetric delayed return is explicitly bounded rather than called exact",()=>{const s=sampleLiveClock(0,1900,iso(100),iso(1100))!;expect(s.uncertaintyMs).toBe(450);expect(Math.abs(s.serverAtReceipt-1800000001900)).toBeLessThanOrEqual(450);});
it("missing or reversed timestamps do not establish authority",()=>{expect(sampleLiveClock(1,0,iso(0),iso(1))).toBeNull();expect(sampleLiveClock(0,1,null,null)).toBeNull();expect(sampleLiveClock(0,1,iso(2),iso(1))).toBeNull();});
