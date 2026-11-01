/**
 * Shapes produced by the Excel import. They describe a *draft* program:
 * nothing here touches the database. The preview screen shows a draft,
 * the user fixes what needs review, then a later step saves it.
 */
import type { ParsedPrescription } from "./parse-prescription";
import type { ParsedRest } from "./parse-rest";

/** One non-empty spreadsheet row, columns A–C as plain text. */
export interface SheetRow {
  row: number;
  a: string;
  b: string;
  c: string;
}

export type IssueLevel = "error" | "review" | "info";

export interface ImportIssue {
  level: IssueLevel;
  sheet: string;
  row: number | null;
  message: string;
  sourceText: string | null;
}

export type BlockKind =
  | "strength"
  | "abs"
  | "core"
  | "finisher"
  | "conditioning"
  | "circuit"
  | "hiit"
  | "swim"
  | "recovery"
  | "other";

/** How many exercises of a block are expected. */
export type Selection = "all" | "pickOne" | "pickAny";

export interface ExerciseDraft {
  /** Set by the program editor: the catalogue exercise this row already uses. */
  exerciseId?: string;
  position: number;
  /** Cell text exactly as written. */
  rawName: string;
  /** Name without the trailing note in parentheses. */
  name: string;
  /** "(Le premier que…)", "(Quads)" — kept, never discarded. */
  note: string | null;
  /** "Lat pull downs or assisted pull ups" → both options. Empty when there is no choice. */
  alternatives: string[];
  /** "Calf raise + Back extensions" → both parts. Empty for a single exercise. */
  components: string[];
  prescription: ParsedPrescription;
  rest: ParsedRest;
  sourceRow: number | null;
}

export interface BlockDraft {
  position: number;
  /** Title row as written, e.g. "Finisher - 15 min". */
  rawTitle: string;
  name: string;
  kind: BlockKind;
  /** "60 min", "30-40 min" — as written. */
  durationText: string | null;
  /** Only when the text is a single number of minutes. */
  durationMinutes: number | null;
  rounds: number | null;
  restBetweenRoundsSeconds: number | null;
  optional: boolean;
  selection: Selection;
  /** Free-text lines attached to this block (instructions, prose circuits). */
  instructions: string[];
  exercises: ExerciseDraft[];
}

export interface VariantDraft {
  /** 1, 2, 3 for Saturday options; 1 for every other day. */
  number: number;
  label: string;
  blocks: BlockDraft[];
}

export type DayKind = "strength" | "recovery" | "rest" | "choice";

export interface DayDraft {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
  sheetName: string | null;
  title: string | null;
  focus: string | null;
  /** Duration from the week overview, as written. */
  durationText: string | null;
  kind: DayKind;
  stepsTarget: number | null;
  notes: string[];
  variants: VariantDraft[];
}

export interface SessionPartDraft {
  name: string;
  details: string;
  durationText: string | null;
}

export interface RuleDraft {
  number: number | null;
  title: string;
  details: string;
}

export interface ProgramDraft {
  title: string | null;
  summary: string | null;
  days: DayDraft[];
  sessionParts: SessionPartDraft[];
  rules: RuleDraft[];
  referenceNotes: string[];
}

export type ImportErrorCode = "not_xlsx" | "corrupt" | "empty" | "missing_sheets" | "too_large";

export type ImportResult =
  | { ok: true; program: ProgramDraft; issues: ImportIssue[] }
  | { ok: false; error: { code: ImportErrorCode; message: string } };
