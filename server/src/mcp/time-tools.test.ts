import { expect, it } from "vitest";
import { calendarDistance } from "./time-tools.js";
it("counts calendar days across leap dates and year boundaries", () => {
 expect(calendarDistance("2024-02-28", "2024-03-01")).toBe(2);
 expect(calendarDistance("2026-12-31", "2027-01-01")).toBe(1);
 expect(calendarDistance("2026-11-12", "2026-11-12")).toBe(0);
 expect(calendarDistance("2026-11-13", "2026-11-12")).toBe(-1);
});
it("rejects silently normalized dates", () => {
 expect(() => calendarDistance("2026-02-29", "2026-03-01")).toThrow();
 expect(() => calendarDistance("bad", "2026-03-01")).toThrow();
});
