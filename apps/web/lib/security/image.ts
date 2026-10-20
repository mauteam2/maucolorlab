// Signature checks supplement the fixed image MIME allowlist. Uploaded content
// is private, served as an image with nosniff, and is never executed or embedded.
import { PHOTO_MAX_BYTES } from "./photo-policy";
export async function allowedImageBytes(file:Blob){
 if(file.size<12||file.size>PHOTO_MAX_BYTES)return false;
 const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
 if(file.type==="image/png")return [137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n);
 if(file.type==="image/jpeg")return b[0]===255&&b[1]===216&&b[2]===255;
 if(file.type==="image/webp")return String.fromCharCode(...b.slice(0,4))==="RIFF"&&String.fromCharCode(...b.slice(8,12))==="WEBP";
 return false;
}
