export type LiveClockSample={serverAtReceipt:number;receivedAt:number;roundTripMs:number;serverProcessingMs:number;uncertaintyMs:number};
// NTP-style estimate. Subtract server processing before estimating the return
// leg; caller clock offsets never participate. Uncertainty is a bound only when
// monotonic clocks behave normally; this is a professional reminder, not a timer SLA.
export function sampleLiveClock(start:number,received:number,serverReceived:string|null,serverSent:string|null):LiveClockSample|null {
 const first=Date.parse(serverReceived??""),last=Date.parse(serverSent??"");
 if(!Number.isFinite(first)||!Number.isFinite(last)||received<start||last<first)return null;
 const roundTripMs=received-start,serverProcessingMs=last-first,network=Math.max(0,roundTripMs-serverProcessingMs);
 return {serverAtReceipt:last+network/2,receivedAt:received,roundTripMs,serverProcessingMs,uncertaintyMs:network/2};
}
export function liveClockNow(sample:LiveClockSample,monotonicNow:number){return sample.serverAtReceipt+Math.max(0,monotonicNow-sample.receivedAt);}
export async function fetchLiveClock(input:RequestInfo|URL,init?:RequestInit){
 const started=performance.now(),response=await fetch(input,init),received=performance.now();
 return {response,clock:sampleLiveClock(started,received,response.headers.get("X-Server-Received"),response.headers.get("X-Server-Time"))};
}
