/**
 * Splits an exercise cell into name, note, alternatives and components.
 * Typos are kept as written: the user decides what to rename later.
 */

export interface ParsedExerciseName {
  name: string;
  note: string | null;
  alternatives: string[];
  components: string[];
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const wordCount = (s: string) => clean(s).split(" ").filter(Boolean).length;

export function parseExerciseName(raw: string): ParsedExerciseName {
  let name = clean(raw);
  let note: string | null = null;
  const alternatives: string[] = [];

  // Trailing "( … )" is a note, unless it starts with "or", which makes it an alternative.
  const paren = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name);
  if (paren && paren[1]) {
    name = clean(paren[1]);
    const inside = clean(paren[2] ?? "");
    const orAlt = /^or\s+(.+)$/i.exec(inside);
    if (orAlt) {
      alternatives.push(name, clean(orAlt[1]!));
    } else if (inside) {
      note = inside;
    }
  }

  // "A or B" where both sides are real exercise names (2+ words each).
  // "Hanging or lying leg raise" stays whole: "Hanging" alone is not an exercise.
  if (alternatives.length === 0) {
    const parts = name.split(/\s+or\s+/i);
    if (parts.length === 2 && parts.every((p) => wordCount(p) >= 2)) {
      alternatives.push(...parts.map(clean));
    }
  }

  const components = name.includes(" + ") ? name.split(" + ").map(clean) : [];

  return { name, note, alternatives, components };
}
