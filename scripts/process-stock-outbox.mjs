/** Authenticated server worker. No service-role, browser trigger or technical rewrite.
 * Run periodically in Dev/Staging/Pilot with a dedicated authorized operator.
 * Each bounded batch has a permanent receipt; individual source events deduplicate.
 * Secrets and response payloads are never logged. */
import {randomUUID} from "node:crypto";
const url=process.env.ELIFORA_STOCK_WORKER_URL,key=process.env.ELIFORA_STOCK_WORKER_PUBLISHABLE_KEY;
const email=process.env.ELIFORA_STOCK_WORKER_EMAIL,password=process.env.ELIFORA_STOCK_WORKER_PASSWORD;
const member=process.env.ELIFORA_STOCK_WORKER_MEMBERSHIP,location=process.env.ELIFORA_STOCK_WORKER_LOCATION;
if(!url||!key||!email||!password||!member||!location)throw new Error("Stock worker configuration incomplete");
if(!["development","staging","pilot"].includes(process.env.ELIFORA_DEPLOYMENT_ENV))throw new Error("Dev/Staging/Pilot environment required");
const origin=new URL(url);if(!["http:","https:"].includes(origin.protocol))throw new Error("Invalid worker endpoint");
const correlation=randomUUID();
async function json(path,body,token){const response=await fetch(new URL(path,origin),{method:"POST",headers:{apikey:key,"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Stock worker HTTP ${response.status}`);return response.json();}
let token;
try {
 const auth=await json("/auth/v1/token?grant_type=password",{email,password});token=auth.access_token;if(typeof token!=="string")throw new Error("Stock worker authentication failed");
 const result=await json("/rest/v1/rpc/stock_operation",{p_membership_id:member,p_location_id:location,p_correlation_id:correlation,p_command:{type:"PROCESS_BATCH",mutation_id:randomUUID(),limit:20}},token);
 if(result.code||result.data?.status!=="SAVED")throw new Error("Stock worker batch rejected");
 console.log(JSON.stringify({worker:"ELIFORA stock outbox",status:"COMPLETED",correlationId:correlation}));
} finally {if(token)await fetch(new URL("/auth/v1/logout?scope=local",origin),{method:"POST",headers:{apikey:key,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});}
