import {expect,it} from "vitest";
import sharp from "sharp";
import {Blob} from "node:buffer";
import {normalizePhoto} from "./photo-image";
import {PHOTO_MAX_BYTES} from "./photo-policy";
const blob=(b:Uint8Array,type:string)=>new Blob([b],{type}) as unknown as globalThis.Blob;
it.each(["png","jpeg","webp"] as const)("fully decodes and preserves supported %s MIME",async format=>{
 const b=await sharp({create:{width:4,height:4,channels:3,background:"#6e4b3a"}}).toFormat(format).toBuffer();
 const out=await normalizePhoto(blob(b,`image/${format}`));expect(out.type).toBe(`image/${format}`);expect((await sharp(Buffer.from(await out.arrayBuffer())).metadata()).format).toBe(format);
});
it("rejects forged signatures, active formats and appended polyglot payload",async()=>{
 const valid=await sharp({create:{width:1,height:1,channels:3,background:"red"}}).png().toBuffer();
 for(const b of [Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]),Buffer.concat([valid,Buffer.from("<script>unsafe</script>")]),Buffer.from("<svg></svg>")])await expect(normalizePhoto(blob(b,"image/png"))).rejects.toThrow();
 const corrupt=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA74AAAAASUVORK5CYII=","base64");
 await expect(normalizePhoto(blob(corrupt,"image/png"))).rejects.toThrow();
 await expect(normalizePhoto(blob(valid,"image/jpeg"))).rejects.toThrow();
 await expect(normalizePhoto(blob(valid,"image/svg+xml"))).rejects.toThrow();
});
it("rejects input above the common provider-safe limit before decode",async()=>{await expect(normalizePhoto(blob(new Uint8Array(PHOTO_MAX_BYTES+1),"image/png"))).rejects.toThrow();});
it("removes metadata rather than forwarding hidden EXIF",async()=>{const b=await sharp({create:{width:1,height:1,channels:3,background:"red"}}).withMetadata({exif:{IFD0:{Artist:"Synthetic privacy marker"}}}).jpeg().toBuffer();const out=await normalizePhoto(blob(b,"image/jpeg"));expect((await sharp(Buffer.from(await out.arrayBuffer())).metadata()).exif).toBeUndefined();});
