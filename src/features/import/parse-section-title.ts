/**
 * Section titles are free text rows such as:
 *   "Strength - 60 min"
 *   "Core - 10 min, 3 rounds"
 *   "1) Circuit - 35 min (4 rounds, minimal rest inside a round, 90 s between rounds)"
 *   "2) HIIT -  Do 2 rounds of this on Saturday if you want intense cardio)"
 *   "Abs"
 */
import { parseDurationToSeconds } from "./parse-rest";
import type { BlockKind } from "./types";

export interface ParsedSectionTitle {
  /** Saturday option number, when the title starts with "1)", "2)"… */
  variantNumber: number | null;
  name: string;
  detail: string | null;
  durationText: string | null;
  durationMinutes: number | null;
  rounds: number | null;
  restBetweenRoundsSeconds: number | null;
  kind: BlockKind;
}

const DURATION = /(\d+(?:\s*-\s*\d+)?)\s*min\b/i;

export function looksLikeSectionTitle(text: string, nextRowIsHeader: boolean): boolean {
  const s = text.trim();
  if (/^\d+\)\s*\S/.test(s)) return true;
  if (/\s[-–]\s*\d+(\s*-\s*\d+)?\s*min\b/i.test(s)) return true;
  return nextRowIsHeader && s.length <= 30;
}

export function blockKindFromName(name: string, dayIsRecovery = false): BlockKind {
  const n = name.toLowerCase();
  if (/strength/.test(n)) return "strength";
  if (/^abs\b|abdo/.test(n)) return "abs";
  if (/core/.test(n)) return "core";
  if (/finisher/.test(n)) return "finisher";
  if (/conditioning/.test(n)) return "conditioning";
  if (/circuit/.test(n)) return "circuit";
  if (/hiit/.test(n)) return "hiit";
  if (/swim/.test(n)) return "swim";
  if (dayIsRecovery) return "recovery";
  return "other";
}

export function parseSectionTitle(text: string, dayIsRecovery = false): ParsedSectionTitle {
  let s = text.replace(/\s+/g, " ").trim();

  let variantNumber: number | null = null;
  const numbered = /^(\d+)\)\s*(.*)$/.exec(s);
  if (numbered) {
    variantNumber = Number(numbered[1]);
    s = numbered[2]!.trim();
  }

  const dash = /^(.*?)\s*[-–]\s+(.*)$/.exec(s) ?? /^(.*?)\s+[-–]\s*(.*)$/.exec(s);
  const name = (dash ? dash[1]! : s).trim();
  const detail = dash ? dash[2]!.trim() || null : null;

  const durationMatch = detail ? DURATION.exec(detail) : null;
  const durationText = durationMatch ? `${durationMatch[1]!.replace(/\s+/g, "")} min` : null;
  const durationMinutes =
    durationMatch && !durationMatch[1]!.includes("-") ? Number(durationMatch[1]) : null;

  const roundsMatch = detail ? /(\d+)\s*rounds?/i.exec(detail) : null;
  const restMatch = detail ? /(\d+\s*(?:s|sec|min))\s*between rounds/i.exec(detail) : null;

  return {
    variantNumber,
    name,
    detail,
    durationText,
    durationMinutes,
    rounds: roundsMatch ? Number(roundsMatch[1]) : null,
    restBetweenRoundsSeconds: restMatch ? parseDurationToSeconds(restMatch[1]!) : null,
    kind: blockKindFromName(name, dayIsRecovery),
  };
}
