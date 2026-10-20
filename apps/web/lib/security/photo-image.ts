import "server-only";
import sharp from "sharp";
import { allowedImageBytes } from "./image";
import { PHOTO_MAX_BYTES } from "./photo-policy";

// Decode and re-encode: uploaded metadata and active/trailing payloads are never
// accepted as a technical image. Output is deterministic for idempotent retries.
export async function normalizePhoto(file: Blob): Promise<Blob> {
 if (!await allowedImageBytes(file)) throw new Error("INVALID_PHOTO");
 const input = Buffer.from(await file.arrayBuffer());
 if (/<\s*(?:!doctype|html|svg|script)|<\?xml/i.test(input.toString("latin1"))) throw new Error("INVALID_PHOTO");
 if (file.type === "image/png" && !input.subarray(-12).equals(Buffer.from("0000000049454e44ae426082", "hex"))) throw new Error("INVALID_PHOTO");
 if (file.type === "image/jpeg" && !input.subarray(-2).equals(Buffer.from([255,217]))) throw new Error("INVALID_PHOTO");
 if (file.type === "image/webp" && input.readUInt32LE(4) + 8 !== input.length) throw new Error("INVALID_PHOTO");
 const image = sharp(input, { failOn: "warning", limitInputPixels: 24000000, animated: false });
 const metadata = await image.metadata();
 if (metadata.pages && metadata.pages !== 1 || `image/${metadata.format === "jpeg" ? "jpeg" : metadata.format}` !== file.type) throw new Error("INVALID_PHOTO");
 const output = await image.toFormat(metadata.format as "png"|"jpeg"|"webp").toBuffer();
 if (output.length > PHOTO_MAX_BYTES) throw new Error("INVALID_PHOTO");
 return new Blob([new Uint8Array(output)], { type: file.type });
}
