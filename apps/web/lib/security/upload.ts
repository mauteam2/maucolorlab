import { AccessError } from "@/lib/tenant/bootstrap";
import { PHOTO_MAX_BYTES } from "./photo-policy";
export async function boundedPhoto(request:Request){
 const maximum=PHOTO_MAX_BYTES,declared=Number(request.headers.get("content-length"));
 if(!Number.isSafeInteger(declared)||declared<=0||declared>maximum)throw new AccessError("VALIDATION_FAILED",400);
 const reader=request.body?.getReader();if(!reader)throw new AccessError("VALIDATION_FAILED",400);
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum){await reader.cancel();throw new AccessError("VALIDATION_FAILED",400);}chunks.push(value);}}finally{reader.releaseLock();}
 if(size!==declared)throw new AccessError("VALIDATION_FAILED",400);
 return new Blob(chunks as BlobPart[],{type:request.headers.get("content-type")??""});
}
