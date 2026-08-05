"use client";

import type { EditorObject } from "@/lib/course/types";
import { COURSE_LEG_SYMBOLS, getCourseSymbol } from "@/lib/course/symbols";
import { findControlNumberObject } from "@/lib/course/control-numbers";

type Props = {
  objects: EditorObject[];
  controlNumbers: Map<string, number>;
  selectedId: string | null;
  courseLengthLabel: string;
  onSelect: (clientId: string) => void;
  onFocus: (clientId: string) => void;
};

function listBadgeLabel(symbolNr: number, controlNumber?: number): string {
  if (symbolNr === 701) return "S";
  if (symbolNr === 706) return "M";
  if (controlNumber != null) return String(controlNumber);
  return "?";
}

function listItemLabel(
  obj: EditorObject,
  sym: ReturnType<typeof getCourseSymbol>,
  controlNumber?: number,
): string {
  if (obj.textContent?.trim()) return obj.textContent;
  if (obj.symbolNr === 701) return "Start";
  if (obj.symbolNr === 706) return "Mål";
  if (controlNumber != null) return `Kontroll ${controlNumber}`;
  return sym?.label ?? `#${obj.symbolNr}`;
}

export function CourseControlList({
  objects,
  controlNumbers,
  selectedId,
  courseLengthLabel,
  onSelect,
  onFocus,
}: Props) {
  const coursePoints = objects
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((obj) => COURSE_LEG_SYMBOLS.has(obj.symbolNr));

  const controlCount = coursePoints.filter((obj) => obj.symbolNr === 703).length;

  return (
    <aside className="flex w-48 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2">
        <h2 className="text-sm font-medium text-slate-900">Kontrollista</h2>
        <p className="text-xs text-slate-500">
          {controlCount} kontroll{controlCount === 1 ? "" : "er"}
          {coursePoints.some((o) => o.symbolNr === 701) || coursePoints.some((o) => o.symbolNr === 706)
            ? " · start/mål"
            : ""}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-700">Banlängd: {courseLengthLabel}</p>
      </div>
      {coursePoints.length === 0 ? (
        <p className="p-3 text-xs text-slate-500">Inga kontroller ännu.</p>
      ) : (
        <ol className="flex-1 overflow-y-auto p-2">
          {coursePoints.map((obj) => {
            const sym = getCourseSymbol(obj.symbolNr);
            const controlNumber = controlNumbers.get(obj.clientId);
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
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: sym?.color ?? "#dc2626" }}
                    >
                      {listBadgeLabel(obj.symbolNr, controlNumber)}
                    </span>
                    <span className="min-w-0 truncate text-slate-700">
                      {listItemLabel(obj, sym, controlNumber)}
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
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
