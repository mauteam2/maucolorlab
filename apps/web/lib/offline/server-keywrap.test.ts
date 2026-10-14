import { webcrypto } from "node:crypto";
import { expect, it } from "vitest";
import { legacyEncryptionPublicKey, unwrapLegacyKey } from "./server-keywrap";
const secret = "ab".repeat(32), scope = "f8000000-0000-4000-8000-000000000001:f8000000-0000-4000-8000-000000000002:f8000000-0000-4000-8000-000000000003:f8000000-0000-4000-8000-000000000004";
it("public encryption seals legacy material; only unchanged authenticated-scope wrapping opens", async () => {
 const publicKey = legacyEncryptionPublicKey(secret);
 const ephemeral = await webcrypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
 const recipient = await webcrypto.subtle.importKey("raw", Buffer.from(publicKey, "hex"), { name: "ECDH", namedCurve: "P-256" }, false, []);
 const shared = new Uint8Array(await webcrypto.subtle.deriveBits({ name: "ECDH", public: recipient }, ephemeral.privateKey, 256));
 const suffix = new TextEncoder().encode("elifora/legacy-offline-keywrap/v1"), material = new Uint8Array(shared.length + suffix.length); material.set(shared); material.set(suffix, shared.length);
 const wrapKey = await webcrypto.subtle.importKey("raw", await webcrypto.subtle.digest("SHA-256", material), "AES-GCM", false, ["encrypt"]);
 const key = webcrypto.getRandomValues(new Uint8Array(32)), iv = webcrypto.getRandomValues(new Uint8Array(12));
 const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(scope) }, wrapKey, key);
 const input = { scope, ephemeral_public_key: Buffer.from(await webcrypto.subtle.exportKey("raw", ephemeral.publicKey)).toString("hex"), iv: Buffer.from(iv).toString("hex"), wrapped_key: Buffer.from(ciphertext).toString("hex") };
 // Compare booleans so a failure cannot print key material.
 expect(unwrapLegacyKey(secret, input) === Buffer.from(key).toString("hex")).toBe(true);
 expect(() => unwrapLegacyKey(secret, { ...input, scope: scope.replace("000000000001", "000000000009") })).toThrow();
 expect(() => unwrapLegacyKey("ac".repeat(32), input)).toThrow();
 expect(() => unwrapLegacyKey(secret, { ...input, wrapped_key: "00".repeat(48) })).toThrow();
});
it("legacy encryption public key is stable and not the signing secret", () => {
 expect(legacyEncryptionPublicKey(secret)).toBe(legacyEncryptionPublicKey(secret));
 expect(legacyEncryptionPublicKey(secret) === secret).toBe(false);
 expect(() => legacyEncryptionPublicKey("invalid")).toThrow("KEY_UNAVAILABLE");
});
