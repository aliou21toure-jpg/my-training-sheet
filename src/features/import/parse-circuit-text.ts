/**
 * Some circuits are written as one sentence in a single cell:
 *   "Circuit, 4 rounds, 60 s rest between rounds: 12 kettlebell swings,
 *    20 mountain climbers, 10 burpees, 30 s jump rope. + Swim"
 *
 * This turns them into rounds, rest and exercises. When the sentence does
 * not follow that shape, it returns null and the caller keeps the text.
 */
import { parseDurationToSeconds } from "./parse-rest";

export interface CircuitItem {
  name: string;
  reps: number | null;
  durationSeconds: number | null;
  sourceText: string;
}

export interface ParsedCircuitText {
  rounds: number | null;
  restBetweenRoundsSeconds: number | null;
  items: CircuitItem[];
  /** "+ Swim" at the end: an extra activity done in addition. */
  extras: string[];
}

export function parseCircuitText(text: string): ParsedCircuitText | null {
  let s = text.replace(/\s+/g, " ").trim();
  if (!/^circuit\b/i.test(s)) return null;

  const extras: string[] = [];
  const extra = /\.?\s*\+\s*([^.+]+?)\.?\s*$/.exec(s);
  if (extra && extra.index > s.indexOf(":")) {
    extras.push(extra[1]!.trim());
    s = s.slice(0, extra.index);
  }

  const colon = s.indexOf(":");
  if (colon === -1) return null;
  const head = s.slice(0, colon);
  const body = s.slice(colon + 1).replace(/\.\s*$/, "");

  const rounds = /(\d+)\s*rounds?/i.exec(head);
  const rest = /(\d+\s*(?:s|sec|min))\s*rest between rounds/i.exec(head);

  const items: CircuitItem[] = [];
  for (const part of body.split(",")) {
    const sourceText = part.trim();
    if (!sourceText) continue;
    const timed = /^(\d+\s*(?:s|sec|min))\s+(.+)$/i.exec(sourceText);
    if (timed) {
      items.push({
        name: timed[2]!.trim(),
        reps: null,
        durationSeconds: parseDurationToSeconds(timed[1]!),
        sourceText,
      });
      continue;
    }
    const counted = /^(\d+)\s+(.+)$/.exec(sourceText);
    if (counted) {
      items.push({ name: counted[2]!.trim(), reps: Number(counted[1]), durationSeconds: null, sourceText });
      continue;
    }
    return null; // an item we cannot read: keep the whole sentence as text
  }

  if (items.length === 0) return null;

  return {
    rounds: rounds ? Number(rounds[1]) : null,
    restBetweenRoundsSeconds: rest ? parseDurationToSeconds(rest[1]!) : null,
    items,
    extras,
  };
}
