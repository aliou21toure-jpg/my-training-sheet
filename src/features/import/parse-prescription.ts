/**
 * Turns a "Sets x Reps" cell from the workbook into structured data.
 *
 * Design rule: never guess. If a cell does not match a known shape, we keep
 * the original text and flag it for manual review instead of throwing or
 * inventing numbers.
 */
import { parseDurationToSeconds } from "./parse-rest";

export type Target =
  | { type: "reps"; min: number; max: number }
  | { type: "maxReps" }
  | { type: "duration"; seconds: number };

export interface ParsedPrescription {
  /** Original cell text, always preserved. */
  sourceText: string;
  sets: number | null;
  target: Target | null;
  /** "(Failure)" — sets are taken to muscular failure. */
  toFailure: boolean;
  /** "/ side", "/ leg", "/ arm" — the target applies to each side. */
  perSide: boolean;
  /** "for each exercise" — compound row (e.g. "Calf raise + Back extensions"). */
  appliesToEachExercise: boolean;
  needsReview: boolean;
  reviewReason: string | null;
}

const MAX_REASONABLE_SETS = 20;

function result(
  sourceText: string,
  partial: Partial<Omit<ParsedPrescription, "sourceText">>,
): ParsedPrescription {
  return {
    sourceText,
    sets: null,
    target: null,
    toFailure: false,
    perSide: false,
    appliesToEachExercise: false,
    needsReview: false,
    reviewReason: null,
    ...partial,
  };
}

export function parsePrescription(text: string | null | undefined): ParsedPrescription {
  const sourceText = text ?? "";
  let s = sourceText.trim().toLowerCase().replace(/×/g, "x").replace(/\s+/g, " ");

  if (s === "" || s === "-" || s === "–" || s === "—") {
    return result(sourceText, {});
  }

  // 1. Pull out modifiers so the remaining core is simple to match.
  const toFailure = /\(?\s*failure\s*\)?/.test(s);
  s = s.replace(/\(?\s*failure\s*\)?/g, " ");

  const perSide = /\/ ?(side|leg|arm)s?\b/.test(s);
  s = s.replace(/\/ ?(side|leg|arm)s?\b/g, " ");

  const appliesToEachExercise = /\bfor each( exercise)?\b/.test(s);
  s = s.replace(/\bfor each( exercise)?\b/g, " ");

  s = s.replace(/\s+/g, " ").trim();
  const flags = { toFailure, perSide, appliesToEachExercise };

  // 2. "<sets> x <rest of it>"
  const head = /^(\d+) ?x ?(.+)$/.exec(s);
  if (!head) {
    return result(sourceText, {
      ...flags,
      needsReview: true,
      reviewReason: "Format non reconnu (pas de « séries x … »)",
    });
  }

  const sets = Number(head[1]);
  const rest = head[2]!.trim();

  if (sets < 1 || sets > MAX_REASONABLE_SETS) {
    return result(sourceText, {
      ...flags,
      needsReview: true,
      reviewReason: `Nombre de séries inhabituel (${sets})`,
    });
  }

  // 2x max reps · 2 x max
  if (/^max( reps?)?$/.test(rest)) {
    return result(sourceText, { ...flags, sets, target: { type: "maxReps" } });
  }

  // 3 x 45 s · 3 x 1 min · 3 x 1min30
  const seconds = parseDurationToSeconds(rest);
  if (seconds !== null) {
    return result(sourceText, { ...flags, sets, target: { type: "duration", seconds } });
  }

  // 2 x 8-10 · 2 x (6-8) reps · 3x10-12
  const range = /^\(? ?(\d+) ?(?:-|–|to) ?(\d+) ?\)?(?: ?reps?)?$/.exec(rest);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (min > max) {
      return result(sourceText, {
        ...flags,
        sets,
        needsReview: true,
        reviewReason: `Fourchette inversée (${min}-${max})`,
      });
    }
    return result(sourceText, { ...flags, sets, target: { type: "reps", min, max } });
  }

  // 3 x 12 · 3 x 12 reps · 2 x (10)
  const single = /^\(? ?(\d+) ?\)?(?: ?reps?)?$/.exec(rest);
  if (single) {
    const reps = Number(single[1]);
    return result(sourceText, { ...flags, sets, target: { type: "reps", min: reps, max: reps } });
  }

  return result(sourceText, {
    ...flags,
    sets,
    needsReview: true,
    reviewReason: "Répétitions ou durée non reconnues",
  });
}
