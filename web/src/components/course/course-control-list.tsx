"use client";

import type { EditorObject } from "@/lib/course/types";
import { getCourseSymbol } from "@/lib/course/symbols";
import { findControlNumberObject } from "@/lib/course/control-numbers";
import type { CourseVisit } from "@/lib/course/sequence";
import { parseControlCode } from "@/lib/course/sequence";

type Props = {
  objects: EditorObject[];
  visits: CourseVisit[];
  unused: EditorObject[];
  selectedId: string | null;
  courseLengthLabel: string;
  canEdit: boolean;
  onSelect: (clientId: string) => void;
  onFocus: (clientId: string) => void;
  onRemoveVisit: (sequenceIndex: number) => void;
};

function listBadgeLabel(visit: CourseVisit): string {
  if (visit.symbolNr === 701) return "S";
  if (visit.symbolNr === 706) return "M";
  if (visit.visitNumber != null) return String(visit.visitNumber);
  return "?";
}

function listItemLabel(visit: CourseVisit, obj: EditorObject | undefined): string {
  if (visit.symbolNr === 701) return "Start";
  if (visit.symbolNr === 706) return "Mål";
  if (visit.visitNumber != null && visit.code != null) {
    return `${visit.visitNumber} · ${visit.code}`;
  }
  if (visit.code != null) return `Kontroll ${visit.code}`;
  return obj ? (getCourseSymbol(obj.symbolNr)?.label ?? `#${obj.symbolNr}`) : "Kontroll";
}

export function CourseControlList({
  objects,
  visits,
  unused,
  selectedId,
  courseLengthLabel,
  canEdit,
  onSelect,
  onFocus,
  onRemoveVisit,
}: Props) {
  const controlCount = visits.filter((v) => v.symbolNr === 703).length;

  return (
    <aside className="flex w-52 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2">
        <h2 className="text-sm font-medium text-slate-900">Kontrollista</h2>
        <p className="text-xs text-slate-500">
          {controlCount} kontroll{controlCount === 1 ? "" : "er"}
          {visits.some((v) => v.symbolNr === 701) || visits.some((v) => v.symbolNr === 706)
            ? " · start/mål"
            : ""}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-700">Banlängd: {courseLengthLabel}</p>
      </div>
      {visits.length === 0 && unused.length === 0 ? (
        <p className="p-3 text-xs text-slate-500">Inga kontroller ännu.</p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {visits.length > 0 && (
            <ol className="p-2">
              {visits.map((visit) => {
                const obj = objects.find((o) => o.clientId === visit.clientId);
                const numberObj = obj ? findControlNumberObject(objects, obj.clientId) : undefined;
                const selected =
                  selectedId === visit.clientId ||
                  (numberObj != null && selectedId === numberObj.clientId);
                const sym = getCourseSymbol(visit.symbolNr);
                return (
                  <li key={`${visit.sequenceIndex}-${visit.clientId}`}>
                    <div
                      className={`mb-1 flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
                        selected ? "bg-ifk-blue-pale ring-1 ring-ifk-blue/30" : "hover:bg-slate-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(visit.clientId);
                          onFocus(visit.clientId);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: sym?.color ?? "#dc2626" }}
                        >
                          {listBadgeLabel(visit)}
                        </span>
                        <span className="min-w-0 truncate text-slate-700">
                          {listItemLabel(visit, obj)}
                        </span>
                      </button>
                      {numberObj && (
                        <button
                          type="button"
                          title="Flytta kontrollnummer"
                          onClick={() => {
                            onSelect(numberObj.clientId);
                            onFocus(numberObj.clientId);
                          }}
                          className="shrink-0 rounded px-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-ifk-blue"
                        >
                          nr
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          title="Ta bort från banan"
                          onClick={() => onRemoveVisit(visit.sequenceIndex)}
                          className="shrink-0 rounded px-1 text-[10px] text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {unused.length > 0 && (
            <div className="border-t border-slate-200 p-2">
              <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Oanvända
              </p>
              <ul>
                {unused.map((obj) => {
                  const code = parseControlCode(obj);
                  const numberObj = findControlNumberObject(objects, obj.clientId);
                  const selected =
                    selectedId === obj.clientId ||
                    (numberObj != null && selectedId === numberObj.clientId);
                  return (
                    <li key={obj.clientId}>
                      <div
                        className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                          selected ? "bg-ifk-blue-pale ring-1 ring-ifk-blue/30" : "hover:bg-slate-50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(obj.clientId);
                            onFocus(obj.clientId);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-300 text-xs font-bold text-white">
                            {code ?? "?"}
                          </span>
                          <span className="min-w-0 truncate text-slate-500">
                            Kontroll {code ?? "?"}
                          </span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
