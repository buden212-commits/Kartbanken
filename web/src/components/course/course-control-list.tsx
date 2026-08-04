"use client";

import type { EditorObject } from "@/lib/course/types";
import { getCourseSymbol } from "@/lib/course/symbols";
import { findControlNumberObject } from "@/lib/course/control-numbers";

type Props = {
  objects: EditorObject[];
  controlNumbers: Map<string, number>;
  selectedId: string | null;
  courseLengthLabel: string;
  onSelect: (clientId: string) => void;
  onFocus: (clientId: string) => void;
};

export function CourseControlList({
  objects,
  controlNumbers,
  selectedId,
  courseLengthLabel,
  onSelect,
  onFocus,
}: Props) {
  const controls = objects
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((obj) => controlNumbers.has(obj.clientId));

  return (
    <aside className="flex w-48 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2">
        <h2 className="text-sm font-medium text-slate-900">Kontrollista</h2>
        <p className="text-xs text-slate-500">{controls.length} kontroller</p>
        <p className="mt-1 text-xs font-medium text-slate-700">Banlängd: {courseLengthLabel}</p>
      </div>
      {controls.length === 0 ? (
        <p className="p-3 text-xs text-slate-500">Inga kontroller ännu.</p>
      ) : (
        <ol className="flex-1 overflow-y-auto p-2">
          {controls.map((obj) => {
            const num = controlNumbers.get(obj.clientId)!;
            const sym = getCourseSymbol(obj.symbolNr);
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
                      {num}
                    </span>
                    <span className="min-w-0 truncate text-slate-700">
                      {obj.textContent || sym?.label || `#${obj.symbolNr}`}
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
