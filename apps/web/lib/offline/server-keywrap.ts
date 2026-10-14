import "server-only";
import { createDecipheriv, createECDH, createHash, createHmac } from "node:crypto";
function exchange(secret: string) {
 if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error("KEY_UNAVAILABLE");
 const ecdh = createECDH("prime256v1");
 for (let counter = 0; counter < 3; counter++) {
  try { ecdh.setPrivateKey(createHmac("sha256", Buffer.from(secret, "hex")).update(`elifora/legacy-offline-keywrap/v1/${counter}`).digest()); return ecdh; }
  catch { /* Retry the deterministic derivation if a scalar is outside the curve order. */ }
 }
 throw new Error("KEY_UNAVAILABLE");
}
export function legacyEncryptionPublicKey(secret: string) { return exchange(secret).getPublicKey("hex", "uncompressed"); }
// Encryption can seal an old local record without releasing its contents to the
// current account. Unwrapping is separately restricted to its fresh membership.
export function unwrapLegacyKey(secret: string, input: { ephemeral_public_key: string; iv: string; wrapped_key: string; scope: string }) {
 const shared = exchange(secret).computeSecret(Buffer.from(input.ephemeral_public_key, "hex"));
 const key = createHash("sha256").update(shared).update("elifora/legacy-offline-keywrap/v1").digest();
 const ciphertext = Buffer.from(input.wrapped_key, "hex");
 const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(input.iv, "hex"));
 decipher.setAAD(Buffer.from(input.scope, "utf8")); decipher.setAuthTag(ciphertext.subarray(-16));
 const unwrapped = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
 if (unwrapped.length !== 32) throw new Error("KEY_UNAVAILABLE");
 return unwrapped.toString("hex");
}
