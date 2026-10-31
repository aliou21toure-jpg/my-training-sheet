import Link from "next/link";
import { Play } from "lucide-react";
import { BLOCK_KIND_LABELS, formatPrescription } from "@/features/import/format";
import type { PlannedBlock } from "@/features/program/load-program";

export const cardClass =
  "flex flex-col gap-4 rounded-[24px] bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] dark:shadow-none";

/** Exercises of the main (required) blocks, then the optional sections as chips. */
export function BlockSummary({ blocks }: { blocks: PlannedBlock[] }) {
  const required = blocks.filter((b) => !b.optional);
  const optional = blocks.filter((b) => b.optional);
  return (
    <div className="flex flex-col gap-3">
      {required.map((block) => (
        <div key={block.id} className="flex flex-col">
          {required.length > 1 && (
            <h3 className="pb-1 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
              {BLOCK_KIND_LABELS[block.kind]}
              {block.rounds ? ` · ${block.rounds} tours` : ""}
            </h3>
          )}
          {block.exercises.length > 0 ? (
            <ul className="flex flex-col">
              {block.exercises.map((e) => (
                <li key={e.id} className="flex min-h-11 items-center justify-between gap-3 border-t border-line text-[15px]">
                  <span className="min-w-0 truncate">{e.name}</span>
                  <span className="shrink-0 text-text-muted tabular-nums">{formatPrescription(e.prescription)}</span>
                </li>
              ))}
            </ul>
          ) : (
            block.instructions.map((line) => (
              <p key={line} className="border-t border-line py-2.5 text-[15px] leading-snug text-text-muted">
                {line}
              </p>
            ))
          )}
        </div>
      ))}
      {optional.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-text-muted">En option :</span>
          {optional.map((b) => (
            <span key={b.id} className="rounded-lg bg-fill px-2 py-1 text-[13px] font-medium">
              {BLOCK_KIND_LABELS[b.kind]}
              {b.durationText ? ` · ${b.durationText}` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function StartLink({ href, label = "Commencer la séance" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-accent text-[17px] font-semibold text-on-accent transition-transform active:scale-[0.98]"
    >
      <Play aria-hidden size={18} fill="currentColor" strokeWidth={0} />
      {label}
    </Link>
  );
}
