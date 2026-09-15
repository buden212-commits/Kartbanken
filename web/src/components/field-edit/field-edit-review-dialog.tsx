"use client";

import type { FieldEditReviewSummary } from "@/lib/field-edit/review-summary";

type Props = {
  summary: FieldEditReviewSummary;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function FieldEditReviewDialog({ summary, submitting, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-edit-review-title"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:p-6"
      >
        <h2 id="field-edit-review-title" className="text-lg font-semibold text-slate-900">
          Jämförelse före incheckning
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Granska ändringarna. Om du skickar in går fältredigeringen till admin för godkännande.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg border border-red-100 bg-red-50 px-2 py-3">
            <p className="text-lg font-semibold text-red-700">{summary.deletes}</p>
            <p className="text-xs text-red-800">Raderade</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-3">
            <p className="text-lg font-semibold text-amber-800">{summary.modifies}</p>
            <p className="text-xs text-amber-900">Ändrade</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-3">
            <p className="text-lg font-semibold text-emerald-700">{summary.adds}</p>
            <p className="text-xs text-emerald-800">Nya</p>
          </div>
        </div>

        <ul className="mt-4 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {summary.changes.map((change, index) => (
            <li key={`${change.kind}-${index}`} className="leading-snug">
              <span
                className={
                  change.kind === "delete"
                    ? "text-red-700"
                    : change.kind === "add"
                      ? "text-emerald-700"
                      : "text-amber-800"
                }
              >
                {change.label}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Avbryt
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className="min-h-11 rounded-lg bg-ifk-blue px-3 py-2.5 text-sm font-medium text-white hover:bg-ifk-blue/90 disabled:opacity-50"
          >
            {submitting ? "Skickar…" : "Skicka in till admin"}
          </button>
        </div>
      </div>
    </div>
  );
}
