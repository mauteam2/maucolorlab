import { beforeEach, afterEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ host: "127.0.0.1:4173" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: fixture.host }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import { requireDevelopmentPreview } from "./preview";
beforeEach(() => { vi.stubEnv("ELIFORA_DEPLOYMENT_ENV", "development"); vi.stubEnv("NODE_ENV", "production"); fixture.host = "127.0.0.1:4173"; });
afterEach(() => vi.unstubAllEnvs());
it.each(["127.0.0.1:4173", "localhost:3001", "[::1]:4173"])("allows an optimized local development build at %s", async host => {
 fixture.host = host; await expect(requireDevelopmentPreview()).resolves.toBeUndefined();
});
it.each(["production", "pilot", "staging", ""])("keeps previews unavailable in deployment %s even with a forged local Host", async deployment => {
 vi.stubEnv("ELIFORA_DEPLOYMENT_ENV", deployment); await expect(requireDevelopmentPreview()).rejects.toThrow("NOT_FOUND");
});
it.each(["salon.example", "localhost.evil.example", "localhost@evil.example", "127.0.0.1/path", ""])("rejects non-loopback or malformed host %s", async host => {
 fixture.host = host; await expect(requireDevelopmentPreview()).rejects.toThrow("NOT_FOUND");
});
