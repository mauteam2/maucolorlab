import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import release from "./release.generated.json";
import { createClient } from "@/lib/supabase/server";
export const releaseFingerprint = release;
const statusSchema = z.strictObject({migrationHead:z.string().regex(/^\d{14}$/),signingMatches:z.boolean(),privateStorage:z.boolean(),colorEngineVersion:z.literal("color-engine/1.1.0"),catalogs:z.strictObject({id:z.uuid(),version:z.int().positive(),state:z.literal("PUBLISHED"),pilotKey:z.string().nullable()}).array().max(100)});
export async function databaseReleaseStatus() {
 const key=process.env.ELIFORA_COLOR_PLAN_SIGNING_KEY;
 if(!key||!/^[a-f0-9]{64}$/.test(key)) throw new Error("RELEASE_NOT_READY");
 const challenge=randomBytes(32).toString("hex"),signature=createHmac("sha256",Buffer.from(key,"hex")).update(challenge).digest("hex");
 const client=await createClient();
 const reply=await client.rpc("pilot_release_status",{p_challenge:challenge,p_signature:signature});
 const status=statusSchema.safeParse(reply.data);
 if(reply.error||!status.success||status.data.migrationHead!==release.migrationHead||!status.data.signingMatches||!status.data.privateStorage) throw new Error("RELEASE_NOT_READY");
 return status.data;
}
