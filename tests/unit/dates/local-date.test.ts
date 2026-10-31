import { describe, expect, it } from "vitest";
import { addDays, formatLongDate, greetingFor, localDateInfo, weekDates } from "@/lib/dates/local-date";

describe("localDateInfo", () => {
  it("gives the local calendar day, not the UTC one", () => {
    // 23:30 UTC on Saturday 31 Oct = 00:30 Sunday 1 Nov in Paris (winter time, UTC+1)
    const late = new Date("2026-10-31T23:30:00Z");
    expect(localDateInfo(late, "Europe/Paris")).toEqual({ isoDate: "2026-11-01", weekday: 7, hour: 0 });
    // …but still Saturday evening in Toronto (UTC-4)
    expect(localDateInfo(late, "America/Toronto")).toEqual({ isoDate: "2026-10-31", weekday: 6, hour: 19 });
    // and already Sunday morning in Bamako (UTC+0)
    expect(localDateInfo(late, "Africa/Bamako")).toMatchObject({ isoDate: "2026-10-31", hour: 23 });
  });

  it("handles the daylight-saving change in Paris", () => {
    // 25 Oct 2026, clocks go back at 03:00 → 02:00. 01:30 UTC = 02:30 local, still Sunday the 25th.
    expect(localDateInfo(new Date("2026-10-25T01:30:00Z"), "Europe/Paris")).toMatchObject({ isoDate: "2026-10-25", weekday: 7 });
    // Summer: 22:30 UTC on 30 June = 00:30 on 1 July (UTC+2)
    expect(localDateInfo(new Date("2026-06-30T22:30:00Z"), "Europe/Paris")).toMatchObject({ isoDate: "2026-07-01", weekday: 3 });
  });

  it("falls back to Paris for an invalid time zone instead of crashing", () => {
    expect(localDateInfo(new Date("2026-10-31T12:00:00Z"), "Not/AZone")).toMatchObject({ isoDate: "2026-10-31", weekday: 6 });
  });
});

describe("calendar helpers", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("returns Monday → Sunday for any day of the week", () => {
    expect(weekDates("2026-10-31", 6)).toEqual([
      "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01",
    ]);
    expect(weekDates("2026-11-02", 1)[0]).toBe("2026-11-02");
    expect(weekDates("2026-11-01", 7)[0]).toBe("2026-10-26");
  });

  it("formats dates in French", () => {
    expect(formatLongDate("2026-10-31")).toBe("samedi 31 octobre");
  });

  it("says bonsoir in the evening", () => {
    expect([7, 12, 17, 18, 23, 2].map(greetingFor)).toEqual(["Bonjour", "Bonjour", "Bonjour", "Bonsoir", "Bonsoir", "Bonsoir"]);
  });
});
