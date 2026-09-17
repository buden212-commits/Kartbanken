import { requireSession } from "@/lib/auth/api";
import { logAction } from "@/lib/audit";
import { assertCourseViewAccess } from "@/lib/course/access";
import {
  buildCourseExportSvg,
  parseExportQueryParams,
} from "@/lib/course/build-export-svg";
import { getCourseById, toCourseDetail } from "@/lib/course/repository";
import {
  parseCourseScale,
  exportFrameFromCenter,
  exportFrameFromExtent,
  paperSizeMm,
} from "@/lib/course/pdf-scale";
import { hydrateCourseEditor } from "@/lib/course/control-numbers";
import { buildCourseVisits, objectsForPrintedCourse } from "@/lib/course/sequence";
import { getLatestPublishedVersion } from "@/lib/maps/version-context";
import { extractSvgInner } from "@/lib/ocad/svg-utils";
import {
  computeCourseLengthMeters,
  courseObjectsBbox,
  formatCourseLengthKm,
} from "@/lib/course/geometry";
import { geoToSvgUserPoint } from "@/lib/ocad/svg-coords";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const url = new URL(request.url);
  const { format, orientation, scale: rawScale, includeControlList } =
    parseExportQueryParams(url.searchParams);
  const scale = parseCourseScale(rawScale);

  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true, title: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const course = await getCourseById(id);
  if (!course || course.mapFileId !== map.id) {
    return NextResponse.json({ error: "Banan hittades inte" }, { status: 404 });
  }

  const denied = assertCourseViewAccess(session, course);
  if (denied) return denied;

  const publishedVersion = await getLatestPublishedVersion(map.id);
  if (!publishedVersion) {
    return NextResponse.json(
      { error: "Kartfilen saknar publicerad version" },
      { status: 400 },
    );
  }

  const version = await prisma.mapVersion.findUnique({
    where: { id: publishedVersion.id },
    select: { previewSvgPath: true, storagePath: true },
  });
  if (!version?.previewSvgPath) {
    return NextResponse.json({ error: "Kartpreview saknas" }, { status: 404 });
  }

  let svgText: string;
  try {
    const buffer = await readStoredFile(version.previewSvgPath);
    svgText = buffer.toString("utf-8");
  } catch {
    return NextResponse.json({ error: "Kunde inte läsa kartpreview" }, { status: 500 });
  }

  const detail = await toCourseDetail(course);
  const hydrated = hydrateCourseEditor(
    detail.objects.map((o) => ({ ...o, clientId: o.id })),
    detail.sequence,
  );
  const exportEditorObjects = objectsForPrintedCourse(hydrated.objects, hydrated.sequence);
  const exportObjects = exportEditorObjects.map(({ clientId, ...o }) => ({ ...o, id: clientId }));
  const printSequence = hydrated.sequence.filter((id) =>
    exportEditorObjects.some((o) => o.clientId === id),
  );
  const { rootTransform, ocadMapScale } = extractSvgInner(svgText);
  const fileMapScale = ocadMapScale ?? 15000;

  const geoBbox = courseObjectsBbox(
    printSequence.length > 0 ? exportObjects : detail.objects,
  );
  if (!geoBbox) {
    return NextResponse.json(
      { error: "Banan har inga objekt att centrera PDF-exporten på" },
      { status: 400 },
    );
  }

  const [svgMinX, svgMinY] = geoToSvgUserPoint([geoBbox.minX, geoBbox.minY], rootTransform);
  const [svgMaxX, svgMaxY] = geoToSvgUserPoint([geoBbox.maxX, geoBbox.maxY], rootTransform);
  const svgExtent = {
    minX: Math.min(svgMinX, svgMaxX),
    minY: Math.min(svgMinY, svgMaxY),
    maxX: Math.max(svgMinX, svgMaxX),
    maxY: Math.max(svgMinY, svgMaxY),
  };

  let frame = exportFrameFromExtent(
    svgExtent,
    scale,
    fileMapScale,
    format,
    orientation,
  );

  const customCenterX = url.searchParams.get("centerX");
  const customCenterY = url.searchParams.get("centerY");
  if (customCenterX && customCenterY) {
    frame = exportFrameFromCenter(
      Number(customCenterX),
      Number(customCenterY),
      scale,
      fileMapScale,
      format,
      orientation,
    );
  }

  const courseLengthLabel = formatCourseLengthKm(
    computeCourseLengthMeters(exportObjects, fileMapScale, printSequence),
  );

  const exportSvg = buildCourseExportSvg(
    svgText,
    frame,
    exportObjects,
    rootTransform,
    undefined,
    { name: course.name, lengthLabel: courseLengthLabel, mapScale: scale },
    printSequence,
  );

  await logAction(session.user.id, "COURSE_PDF_EXPORT", "Course", id, {
    mapSlug: slug,
    format,
    orientation,
    scale,
    includeControlList,
  });

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json")) {
    const { widthMm, heightMm } = paperSizeMm(format, orientation);
    return NextResponse.json({
      svg: exportSvg,
      frame,
      courseName: course.name,
      courseLengthLabel,
      mapTitle: map.title,
      scale,
      format,
      orientation,
      widthMm,
      heightMm,
      controlList: includeControlList
        ? buildCourseVisits(hydrated.objects, hydrated.sequence).map((visit) => ({
            number: visit.visitNumber ?? 0,
            symbolNr: visit.symbolNr,
            text:
              visit.symbolNr === 701
                ? "Start"
                : visit.symbolNr === 706
                  ? "Mål"
                  : visit.code != null
                    ? String(visit.code)
                    : null,
          }))
        : [],
    });
  }

  const safeName = course.name.replace(/[^\w\s-åäöÅÄÖ]/g, "").trim() || "bana";
  return new NextResponse(exportSvg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}-${scale}.svg"`,
      "Cache-Control": "private, no-store",
    },
  });
}
