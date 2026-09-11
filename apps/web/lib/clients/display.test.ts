import { expect, it } from "vitest";
import { formatClientDate } from "./display";
it("birth date stays on its calendar day in western and eastern time zones", () => {
  expect(formatClientDate("1990-04-23", "America/Los_Angeles")).toBe("23.04.1990");
  expect(formatClientDate("1990-04-23", "Europe/Istanbul")).toBe("23.04.1990");
});
it("update instants display in the viewer time zone", () => {
  expect(formatClientDate("2026-09-11T00:30:00Z", "America/Los_Angeles")).toBe("10.09.2026");
  expect(formatClientDate("2026-09-11T00:30:00Z", "Europe/Istanbul")).toBe("11.09.2026");
});
