/**
 * Converts the free-form duration strings found in the workbook
 * ("90 s", "2 min ", "2min", "1min30", "1 min") into seconds.
 *
 * Pure functions: no I/O, no database — easy to unit test.
 */

export interface ParsedRest {
  /** Original cell text, kept so the user can always see what Excel said. */
  sourceText: string;
  /** Rest in seconds, or null when there is no rest ("-") or it could not be read. */
  seconds: number | null;
  /** True when the text was not empty but could not be understood. */
  needsReview: boolean;
}

const NO_VALUE = new Set(["", "-", "–", "—"]);

/**
 * Returns a duration in seconds, or null if the text is not a duration.
 * Accepted shapes (case-insensitive, spaces optional):
 *   45 s · 45s · 45 sec · 90 seconds · 2 min · 2min · 1min30 · 1 min 30 s · 1:30
 */
export function parseDurationToSeconds(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, " ");

  // 1:30
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(s);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  // 1min30 · 1 min 30 · 1 min 30 s · 2 min · 2min
  const minutes = /^(\d+(?:[.,]\d+)?) ?(?:min|mins|minutes?)(?: ?(\d{1,2}) ?(?:s|sec|secs|seconds?)?)?$/.exec(s);
  if (minutes) {
    const whole = Number(minutes[1]!.replace(",", "."));
    const extra = minutes[2] ? Number(minutes[2]) : 0;
    return Math.round(whole * 60) + extra;
  }

  // 45 s · 45s · 45 sec · 90 seconds
  const seconds = /^(\d+) ?(?:s|sec|secs|seconds?)$/.exec(s);
  if (seconds) return Number(seconds[1]);

  return null;
}

export function parseRest(text: string | null | undefined): ParsedRest {
  const sourceText = text ?? "";
  const trimmed = sourceText.trim();

  if (NO_VALUE.has(trimmed)) {
    return { sourceText, seconds: null, needsReview: false };
  }

  const seconds = parseDurationToSeconds(trimmed);
  return { sourceText, seconds, needsReview: seconds === null };
}
