import { AlertTriangle, Info } from "lucide-react";
import {
  BLOCK_KIND_LABELS,
  DAY_KIND_LABELS,
  blockTags,
  formatPrescription,
  formatSeconds,
  summarizeImport,
  weekdayLabel,
} from "@/features/import/format";
import type { BlockDraft, DayDraft, ExerciseDraft, ImportIssue, ProgramDraft } from "@/features/import/types";

/** Read-only view of a parsed program. No logic here: formatting lives in features/import/format.ts. */
export function ProgramPreview({ program, issues }: { program: ProgramDraft; issues: ImportIssue[] }) {
  const summary = summarizeImport(program, issues);
  const review = issues.filter((i) => i.level !== "info");
  const info = issues.filter((i) => i.level === "info");

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Résumé" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Jours d’entraînement" value={summary.trainingDays} />
        <Stat label="Exercices" value={summary.exercises} />
        <Stat label="À revoir" value={summary.review} tone={summary.review > 0 ? "warn" : "default"} />
        <Stat label="À savoir" value={summary.info} />
      </section>

      {review.length > 0 && (
        <IssueList title="À revoir avant d’enregistrer" issues={review} tone="warn" />
      )}
      {info.length > 0 && <IssueList title="À savoir" issues={info} tone="info" />}

      <section aria-label="Programme" className="flex flex-col gap-3">
        {program.days.map((day) => (
          <DayCard key={day.weekday} day={day} />
        ))}
      </section>

      {(program.sessionParts.length > 0 || program.rules.length > 0) && (
        <section className="rounded-[20px] bg-card p-4">
          <h2 className="text-[17px] font-semibold">Notes de référence</h2>
          <p className="mt-1 text-[13px] text-text-muted">
            Gardées comme notes, jamais transformées en objectifs.
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-[14px]">
            {program.sessionParts.map((p) => (
              <li key={p.name}>
                <span className="font-semibold">{p.name}</span>
                {p.durationText && <span className="text-text-muted"> · {p.durationText}</span>}
                <span className="text-text-muted"> — {p.details}</span>
              </li>
            ))}
            {program.rules.map((r) => (
              <li key={`${r.number}-${r.title}`}>
                <span className="font-semibold">{r.title}</span>
                <span className="text-text-muted"> — {r.details}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warn" }) {
  return (
    <div className={`rounded-[18px] p-3.5 ${tone === "warn" ? "bg-warn-soft text-warn" : "bg-card"}`}>
      <div className={`text-[13px] ${tone === "warn" ? "" : "text-text-muted"}`}>{label}</div>
      <div className="text-[26px] font-bold tabular-nums tracking-tight">{value}</div>
    </div>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: ImportIssue[]; tone: "warn" | "info" }) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <section
      aria-label={title}
      className={`rounded-[20px] p-4 ${tone === "warn" ? "bg-warn-soft text-warn" : "bg-card"}`}
    >
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <Icon aria-hidden size={18} strokeWidth={2} />
        {title}
      </h2>
      <ul className="mt-2 flex flex-col gap-2 text-[14px]">
        {issues.map((issue, i) => (
          <li key={i} className={tone === "info" ? "text-text-muted" : ""}>
            <span className="font-semibold">
              {issue.sheet}
              {issue.row ? `, ligne ${issue.row}` : ""} :
            </span>{" "}
            {issue.message}
            {issue.sourceText && tone === "warn" && (
              <code className="ml-1 rounded bg-card/60 px-1.5 py-0.5 text-[13px]">{issue.sourceText}</code>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DayCard({ day }: { day: DayDraft }) {
  const hasContent = day.variants.length > 0;
  return (
    <details open={hasContent} className="group rounded-[20px] bg-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[17px] font-semibold">{weekdayLabel(day.weekday)}</div>
          <div className="truncate text-[14px] text-text-muted">{day.focus ?? day.title ?? "—"}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {day.durationText && <span className="text-[13px] text-text-muted">{day.durationText}</span>}
          <span className="rounded-lg bg-accent-soft px-2 py-1 text-[12px] font-semibold text-accent">
            {DAY_KIND_LABELS[day.kind]}
          </span>
        </div>
      </summary>

      {hasContent && (
        <div className="flex flex-col gap-4 border-t border-line px-4 pb-4 pt-3">
          {day.notes.map((n) => (
            <p key={n} className="text-[14px] text-text-muted">{n}</p>
          ))}
          {day.stepsTarget && (
            <p className="text-[14px]">
              Objectif de pas : <span className="font-semibold tabular-nums">{day.stepsTarget.toLocaleString("fr-FR")}</span>
            </p>
          )}
          {day.variants.map((v) => (
            <div key={v.number} className="flex flex-col gap-3">
              {day.variants.length > 1 && (
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-accent">
                  Option {v.number} · {v.label}
                </h3>
              )}
              {v.blocks.map((b) => (
                <BlockView key={b.position} block={b} />
              ))}
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function BlockView({ block }: { block: BlockDraft }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h4 className="text-[15px] font-semibold">{BLOCK_KIND_LABELS[block.kind]}</h4>
        {blockTags(block).map((t) => (
          <span key={t} className="rounded-md bg-fill px-1.5 py-0.5 text-[12px] font-medium text-text-muted">
            {t}
          </span>
        ))}
      </div>
      {block.instructions.map((line) => (
        <p key={line} className="text-[14px] leading-snug text-text-muted">{line}</p>
      ))}
      {block.exercises.length > 0 && (
        <ul className="flex flex-col">
          {block.exercises.map((e) => (
            <ExerciseRow key={e.position} exercise={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ExerciseRow({ exercise: e }: { exercise: ExerciseDraft }) {
  const needsReview = e.prescription.needsReview || e.rest.needsReview;
  return (
    <li
      className={`flex items-start justify-between gap-3 border-t border-line py-2.5 first:border-t-0 ${
        needsReview ? "-mx-2 rounded-xl border-transparent bg-warn-soft px-2 text-warn" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="text-[15px]">{e.name}</div>
        {e.note && <div className="text-[13px] text-text-muted">{e.note}</div>}
        {e.alternatives.length > 0 && (
          <div className="text-[13px] text-text-muted">Au choix : {e.alternatives.join(" ou ")}</div>
        )}
        {needsReview && (
          <div className="text-[13px]">
            Texte d’origine : <code>{e.prescription.sourceText}</code>
            {e.rest.needsReview && <> · repos <code>{e.rest.sourceText}</code></>}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right text-[14px] tabular-nums">
        <div className="font-medium">{formatPrescription(e.prescription)}</div>
        {e.rest.seconds !== null && (
          <div className="text-[13px] text-text-muted">repos {formatSeconds(e.rest.seconds)}</div>
        )}
      </div>
    </li>
  );
}
