"use client";

import { HelpProcessDiagram } from "@/components/help-process-diagram";
import type { CourseMaterialSegment } from "@/lib/help/parse-course-material";

type Props = {
  segments: CourseMaterialSegment[];
};

export function CourseMaterialContent({ segments }: Props) {
  return (
    <div className="course-material max-w-none space-y-2 text-sm leading-relaxed text-slate-700">
      {segments.map((segment, index) => {
        if (segment.kind === "diagram") {
          return (
            <HelpProcessDiagram
              key={`diagram-${index}`}
              chart={segment.chart}
              title={segment.title || undefined}
            />
          );
        }

        return (
          <div
            key={`html-${index}`}
            className="course-material-html"
            dangerouslySetInnerHTML={{ __html: segment.html }}
          />
        );
      })}
    </div>
  );
}
