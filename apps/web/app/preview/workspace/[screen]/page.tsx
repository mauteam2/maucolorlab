import { notFound } from "next/navigation";
import { ClientWorkspace } from "@/components/client-workspace";
import { HairPassportWorkspace } from "@/components/hair-passport-workspace";
import { ColorWorkspace } from "@/components/color-workspace";
// Render the actual clients, not alternate designs. Every API still authorizes normally.
export default async function WorkspacePreview({ params, searchParams }: { params: Promise<{screen:string}>; searchParams:Promise<{client?:string}> }) {
 if(process.env.NODE_ENV!=="development") notFound();
 const {screen}=await params, {client}=await searchParams;
 if(screen==="clients") return <ClientWorkspace route="directory"/>;
 if(screen==="new") return <ClientWorkspace route="new"/>;
 if(screen==="colorlab") return <ColorWorkspace/>;
 if(!client||! /^[0-9a-f-]{36}$/i.test(client)) notFound();
 if(screen==="profile") return <ClientWorkspace route={client}/>;
 if(screen==="hair-passport") return <HairPassportWorkspace clientId={client}/>;
 notFound();
}
