"use client";



import { COURSE_SYMBOLS, renderSymbolIconSvg } from "@/lib/course/symbols";
import type { CourseSymbolGeometry } from "@/lib/course/symbols";
import { getCourseSymbol } from "@/lib/course/symbols";
import type { CourseDetail, CourseSummary, EditorTool } from "@/lib/course/types";

export { buildControlNumberMap } from "@/lib/course/control-numbers";



type Props = {

  selectedNr: number;

  onSelect: (nr: number) => void;

  activeGeometry: CourseSymbolGeometry;

};



function SymbolIcon({ symbolNr }: { symbolNr: number }) {

  const svg = renderSymbolIconSvg(symbolNr);

  return (

    <span

      className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-200 bg-white"

      aria-hidden

      dangerouslySetInnerHTML={{ __html: svg }}

    />

  );

}



export function CourseSymbolPanel({ selectedNr, onSelect, activeGeometry }: Props) {

  return (

    <aside className="flex w-56 shrink-0 flex-col border-l border-slate-200 bg-slate-50">

      <div className="border-b border-slate-200 px-3 py-2">

        <h2 className="text-sm font-medium text-slate-900">Symboler</h2>

        <p className="mt-0.5 text-xs text-slate-500">700–709 (IOF magenta)</p>

      </div>

      <ul className="flex-1 overflow-y-auto p-2">

        {COURSE_SYMBOLS.map((sym) => {

          const allowed = sym.geometryTypes.includes(activeGeometry);

          const selected = sym.nr === selectedNr;

          return (

            <li key={sym.nr}>

              <button

                type="button"

                disabled={!allowed}

                onClick={() => onSelect(sym.nr)}

                title={

                  allowed

                    ? sym.label

                    : `${sym.label} — stöds inte för ${activeGeometry}`

                }

                className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${

                  selected

                    ? "bg-ifk-blue-pale ring-1 ring-ifk-blue/40"

                    : allowed

                      ? "hover:bg-white"

                      : "cursor-not-allowed opacity-40"

                }`}

              >

                <SymbolIcon symbolNr={sym.nr} />

                <span>

                  <span className="font-medium text-slate-800">{sym.nr}</span>

                  <span className="block text-xs text-slate-500">{sym.label}</span>

                </span>

              </button>

            </li>

          );

        })}

      </ul>

    </aside>

  );

}



export function geometryForSymbol(symbolNr: number): CourseSymbolGeometry {
  const sym = getCourseSymbol(symbolNr);
  return sym?.geometryTypes[0] ?? "point";
}

export const TOOL_LABELS: Record<EditorTool, string> = {

  draw: "Rita",

  move: "Flytta",

  delete: "Radera",

};



export type { CourseDetail, CourseSummary };


