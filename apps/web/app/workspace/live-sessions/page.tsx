import { LiveSessionWorkspace } from "@/components/live-session-workspace";
import { verifiedClientContext } from "@/lib/clients/service";
import { z } from "zod";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){await verifiedClientContext("live_session.view");const p=await searchParams;const q=z.strictObject({client_id:z.uuid(),recipe_id:z.uuid().optional(),session_id:z.uuid().optional()}).safeParse(p);if(!q.success)return <main><h1>Canlı seans</h1><p>Geçerli müşteri ve reçete kaydı seçin.</p></main>;return <LiveSessionWorkspace clientId={q.data.client_id} recipeId={q.data.recipe_id} sessionId={q.data.session_id}/>;}
