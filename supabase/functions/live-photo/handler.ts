// This module uses Web APIs only and is exercised in the Web test runner as well
// as the real hosted Edge runtime. Provider secrets never cross this boundary.
type Environment = { url:string; anonKey:string; serviceKey:string };
const maximum=4194304;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const hex=(b:ArrayBuffer)=>[...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,"0")).join("");
export function createPhotoHandler(env:Environment, transport:typeof fetch=fetch) {
 return async(request:Request):Promise<Response>=>{
  try {
   if(!["GET","POST"].includes(request.method))return new Response(null,{status:405,headers});
   const encoded=request.headers.get("x-elifora-envelope")??"",signature=request.headers.get("x-elifora-signature")??"";
   if(encoded.length>3000||!/^[a-f0-9]{64}$/.test(signature))return new Response(null,{status:403,headers});
   const envelope=atob(encoded),e=JSON.parse(envelope),authorization=request.headers.get("authorization")??"";
   if(e.method!==request.method||!authorization.startsWith("Bearer "))return new Response(null,{status:403,headers});
   const authority=async()=>{
    const r=await transport(`${env.url}/rest/v1/rpc/live_photo_access`,{method:"POST",headers:{apikey:env.anonKey,Authorization:authorization,"Content-Type":"application/json"},body:JSON.stringify({p_envelope:envelope,p_signature:signature})});
    if(!r.ok)throw new Error(r.status===401?"401":"403");
    const b=await r.json();if(b.code==="QUOTA_UNKNOWN")throw new Error("QUOTA_UNKNOWN");if(!b.data||b.code)throw new Error("403");return b.data as {path:string;contentType:string;actorId:string};
   };
   const a=await authority();
   if(!["image/png","image/jpeg","image/webp"].includes(a.contentType))throw new Error("403");
   const path=a.path.split("/").map(encodeURIComponent).join("/");
   const storageHeaders={apikey:env.serviceKey,Authorization:`Bearer ${env.serviceKey}`};
   const objectUrl=`${env.url}/storage/v1/object/live-technical/${path}`;
   if(request.method==="POST") {
    if(request.headers.get("content-type")!==a.contentType||!Number.isInteger(e.size)||e.size<12||e.size>maximum)throw new Error("400");
    const reader=request.body?.getReader();if(!reader)throw new Error("400");
    const chunks:Uint8Array[]=[];let length=0;
    try{for(;;){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>maximum){await reader.cancel();throw new Error("400");}chunks.push(r.value);}}finally{reader.releaseLock();}
    const file=new Blob(chunks as BlobPart[],{type:a.contentType}),bytes=await file.arrayBuffer();
    if(length!==e.size||hex(await crypto.subtle.digest("SHA-256",bytes))!==e.digest)throw new Error("400");
    const old=await transport(objectUrl,{headers:storageHeaders});
    if(old.ok){const existing=await old.arrayBuffer();if(existing.byteLength!==length||hex(await crypto.subtle.digest("SHA-256",existing))!==e.digest)throw new Error("409");}
    else {
     if(old.status!==400&&old.status!==404)throw new Error("503");
     const saved=await transport(objectUrl,{method:"POST",headers:{...storageHeaders,"Content-Type":a.contentType,"x-upsert":"false","cache-control":"0"},body:file});
     // A concurrent identical writer may win after our absence check. Compare
     // the winning bytes; never overwrite them and never accept changed bytes.
     if(!saved.ok){const winner=await transport(objectUrl,{headers:storageHeaders});if(!winner.ok||hex(await crypto.subtle.digest("SHA-256",await winner.arrayBuffer()))!==e.digest)throw new Error("409");}
    }
    await authority();return new Response(null,{status:204,headers});
   }
   const r=await transport(objectUrl,{headers:storageHeaders});if(!r.ok)throw new Error("404");
   const bytes=await r.arrayBuffer();if(bytes.byteLength>maximum)throw new Error("413");
   await authority();return new Response(bytes,{headers:{...headers,"Content-Type":a.contentType}});
  }catch(e){const code=e instanceof Error?e.message:"503";if(code==="QUOTA_UNKNOWN")return Response.json({code},{status:409,headers});return new Response(null,{status:["400","401","403","404","409","413"].includes(code)?Number(code):503,headers});}
 };
}
