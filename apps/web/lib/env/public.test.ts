import { afterEach, describe, expect, it } from "vitest";
import { getPublicEnvironment } from "./public";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("getPublicEnvironment", () => {
  it("rejects a malformed public configuration", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "short";

    expect(() => getPublicEnvironment()).toThrow();
  });

  it("accepts a publishable local configuration", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "local-test-publishable-key";

    expect(getPublicEnvironment().NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
  });
});

