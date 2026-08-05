"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import { DiffMapPanel, type MapDrawPointerHandlers } from "@/components/diff-map-panel";
import { screenToSvgPoint } from "@/lib/ocad/map-hit-test";
import {
  IDENTITY_SVG_TRANSFORM,
  svgUserToGeoPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";
import {
  isValidSuggestionBbox,
  isValidSuggestionLineCoordinates,
  isValidSuggestionPolygonRing,
  normalizeSuggestionBbox,
  renderSuggestionGeometrySvg,
} from "@/lib/suggestion/geometry";
import {
  MAX_SUGGESTION_GEOMETRIES,
  SUGGESTION_CATEGORY_LABELS,
  type SuggestionCategoryValue,
  type SuggestionGeometry,
} from "@/lib/suggestion/types";
import { uploadSuggestionAttachment } from "@/lib/upload-client";

type DrawTool = "pin" | "rectangle" | "polygon" | "line";

type Props = {
  mapSlug: string;
  mapTitle: string;
  versionId: string;
  versionNumber: number;
};

const TOOL_LABELS: Record<DrawTool, string> = {
  pin: "Punkt",
  rectangle: "Rektangel",
  polygon: "Polygon",
  line: "Linje",
};

const GEOMETRY_TYPE_LABELS: Record<SuggestionGeometry["type"], string> = {
  Point: "Punkt",
  Bbox: "Rektangel",
  Polygon: "Polygon",
  LineString: "Linje",
};

type CreateMapPanelProps = {
  mapSlug: string;
  versionId: string;
  drawPointerHandlers: MapDrawPointerHandlers;
  markings: SuggestionGeometry[];
  currentGeometry: SuggestionGeometry | null;
  draftGeometry: SuggestionGeometry | null;
  drawHint: string;
  markingCount: number;
  rootTransformRef: MutableRefObject<SvgRootTransform>;
};

const SuggestionCreateMapPanel = memo(function SuggestionCreateMapPanel({
  mapSlug,
  versionId,
  drawPointerHandlers,
  markings,
  currentGeometry,
  draftGeometry,
  drawHint,
  markingCount,
  rootTransformRef,
}: CreateMapPanelProps) {
  const renderSvgOverlay = useCallback(
    (rootTransform: SvgRootTransform) => {
      rootTransformRef.current = rootTransform;
      const parts: string[] = [];
      for (const marking of markings) {
        parts.push(renderSuggestionGeometrySvg(marking, rootTransform, { label: "FÖRSLAG" }));
      }
      const overlay = draftGeometry ?? currentGeometry;
      if (overlay) {
        parts.push(
          renderSuggestionGeometrySvg(overlay, rootTransform, {
            label: "FÖRSLAG",
            draft: Boolean(draftGeometry && !currentGeometry),
          }),
        );
      }
      if (parts.length === 0) return null;
      return <g dangerouslySetInnerHTML={{ __html: parts.join("") }} />;
    },
    [markings, currentGeometry, draftGeometry, rootTransformRef],
  );

  return (
    <DiffMapPanel
      previewUrl={`/api/maps/${mapSlug}/versions/${versionId}/preview`}
      title="Markera plats"
      mapSlug={mapSlug}
      versionId={versionId}
      interactionMode="draw"
      drawPointerHandlers={drawPointerHandlers}
      renderSvgOverlay={renderSvgOverlay}
      secondaryHeaderContent={
        <p className="text-xs text-amber-700">
          {drawHint}
          {markingCount > 0
            ? ` ${markingCount} markering${markingCount === 1 ? "" : "ar"}.`
            : " Ingen markering ännu."}
        </p>
      }
    />
  );
});

export function SuggestionCreateClient({
  mapSlug,
  mapTitle,
  versionId,
  versionNumber,
}: Props) {
  const router = useRouter();
  const rootTransformRef = useRef<SvgRootTransform>(IDENTITY_SVG_TRANSFORM);
  const dragRef = useRef<{ start: [number, number]; current: [number, number] } | null>(null);

  const [tool, setTool] = useState<DrawTool>("pin");
  const [markings, setMarkings] = useState<SuggestionGeometry[]>([]);
  const [geometry, setGeometry] = useState<SuggestionGeometry | null>(null);
  const [draftBbox, setDraftBbox] = useState<SuggestionGeometry | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [linePoints, setLinePoints] = useState<[number, number][]>([]);
  const [category, setCategory] = useState<SuggestionCategoryValue>("FEL_I_TERRANG");
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetDraft = useCallback(() => {
    setDraftBbox(null);
    setPolygonPoints([]);
    setLinePoints([]);
    dragRef.current = null;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, svg: SVGSVGElement) => {
      const pt = screenToSvgPoint(svg, e.clientX, e.clientY);
      if (!pt) return;
      const geo = svgUserToGeoPoint(pt, rootTransformRef.current);

      if (tool === "pin") {
        setGeometry({ type: "Point", coordinates: geo });
        resetDraft();
        setError(null);
        return;
      }

      if (tool === "rectangle") {
        dragRef.current = { start: pt, current: pt };
        setDraftBbox(null);
        setPolygonPoints([]);
        setLinePoints([]);
        return;
      }

      if (tool === "polygon") {
        setPolygonPoints((prev) => [...prev, geo]);
        setDraftBbox(null);
        setLinePoints([]);
        setGeometry(null);
        setError(null);
        return;
      }

      if (tool === "line") {
        setLinePoints((prev) => [...prev, geo]);
        setDraftBbox(null);
        setPolygonPoints([]);
        setGeometry(null);
        setError(null);
      }
    },
    [resetDraft, tool],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent, svg: SVGSVGElement) => {
      if (tool !== "rectangle" || !dragRef.current) return;
      const pt = screenToSvgPoint(svg, e.clientX, e.clientY);
      if (!pt) return;
      dragRef.current.current = pt;
      const startGeo = svgUserToGeoPoint(dragRef.current.start, rootTransformRef.current);
      const endGeo = svgUserToGeoPoint(pt, rootTransformRef.current);
      const bbox = normalizeSuggestionBbox(startGeo, endGeo);
      setDraftBbox({ type: "Bbox", bbox });
    },
    [tool],
  );

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent, _svg: SVGSVGElement) => {
      if (tool !== "rectangle" || !dragRef.current) return;
      const startGeo = svgUserToGeoPoint(dragRef.current.start, rootTransformRef.current);
      const endGeo = svgUserToGeoPoint(dragRef.current.current, rootTransformRef.current);
      dragRef.current = null;
      const bbox = normalizeSuggestionBbox(startGeo, endGeo);
      if (!isValidSuggestionBbox(bbox)) {
        setDraftBbox(null);
        setError("Rektangeln är för liten — dra ut ett större område");
        return;
      }
      setGeometry({ type: "Bbox", bbox });
      setDraftBbox(null);
      setError(null);
    },
    [tool],
  );

  const confirmDraft = useCallback(() => {
    if (tool === "polygon" && polygonPoints.length >= 3) {
      if (!isValidSuggestionPolygonRing(polygonPoints)) {
        setError("Polygonen är för liten — lägg fler hörn");
        return;
      }
      setGeometry({ type: "Polygon", ring: polygonPoints });
      setPolygonPoints([]);
      setError(null);
      return;
    }
    if (tool === "line" && linePoints.length >= 2) {
      if (!isValidSuggestionLineCoordinates(linePoints)) {
        setError("Linjen kräver minst 2 punkter");
        return;
      }
      setGeometry({ type: "LineString", coordinates: linePoints });
      setLinePoints([]);
      setError(null);
    }
  }, [linePoints, polygonPoints, tool]);

  const draftGeometry = useMemo((): SuggestionGeometry | null => {
    if (draftBbox) return draftBbox;
    if (polygonPoints.length >= 2) return { type: "Polygon", ring: polygonPoints };
    if (linePoints.length >= 1) return { type: "LineString", coordinates: linePoints };
    return null;
  }, [draftBbox, linePoints, polygonPoints]);

  const drawPointerHandlers = useMemo<MapDrawPointerHandlers>(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    }),
    [handlePointerDown, handlePointerMove, handlePointerUp],
  );

  const drawHint = useMemo(
    () =>
      tool === "pin"
        ? "Ritläge — klicka på kartan för att placera markeringen."
        : tool === "rectangle"
          ? "Ritläge — dra en rektangel på kartan."
          : tool === "polygon"
            ? "Ritläge — klicka hörn, minst 3 punkter, sedan Slutför polygon."
            : "Ritläge — klicka punkter längs linjen, minst 2, sedan Slutför linje.",
    [tool],
  );

  const canAddMarking = Boolean(geometry);
  const totalMarkingCount = markings.length + (geometry ? 1 : 0);

  function handleToolChange(next: DrawTool) {
    setTool(next);
    setGeometry(null);
    resetDraft();
    setError(null);
  }

  function handleAddMarking() {
    if (!geometry) return;
    if (markings.length >= MAX_SUGGESTION_GEOMETRIES) {
      setError(`Max ${MAX_SUGGESTION_GEOMETRIES} markeringar per förslag`);
      return;
    }
    setMarkings((prev) => [...prev, geometry]);
    setGeometry(null);
    resetDraft();
    setError(null);
  }

  function handleRemoveMarking(index: number) {
    setMarkings((prev) => prev.filter((_, i) => i !== index));
  }

  function handleClearAll() {
    setMarkings([]);
    setGeometry(null);
    resetDraft();
    setError(null);
  }

  function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setAttachmentFile(file);
    if (attachmentPreview) {
      URL.revokeObjectURL(attachmentPreview);
    }
    setAttachmentPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (markings.length < 1) {
      if (geometry) {
        setError("Klicka «Lägg till markering» innan du skickar, eller rensa den aktuella ritningen");
      } else {
        setError("Lägg till minst en markering på kartan");
      }
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let attachmentPath: string | undefined;
      if (attachmentFile) {
        const uploadRes = await uploadSuggestionAttachment(mapSlug, attachmentFile);
        const uploadData = (await uploadRes.json()) as { error?: string; attachmentPath?: string };
        if (!uploadRes.ok) {
          throw new Error(uploadData.error ?? "Kunde inte ladda upp bilden");
        }
        attachmentPath = uploadData.attachmentPath;
      }

      const res = await fetch(`/api/maps/${mapSlug}/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapVersionId: versionId,
          category,
          title: title.trim() || undefined,
          comment,
          geometries: markings,
          attachmentPath,
        }),
      });
      const data = (await res.json()) as { error?: string; id?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Kunde inte spara kartförslaget");
      }
      router.push(`/maps/${mapSlug}/suggestions/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara kartförslaget");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/maps/${mapSlug}/versions/${versionId}`} className="link-muted text-sm">
        ← Tillbaka till kartvy
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold text-slate-900">Föreslå kartändring</h1>
        <p className="mt-2 text-sm text-slate-600">
          {mapTitle} · v{versionNumber}. Markera plats eller område på kartan, skriv vad som bör
          ändras och spara. Förslaget påverkar inte kartfilen — en redaktör granskar det separat.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(TOOL_LABELS) as DrawTool[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleToolChange(t)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              tool === t
                ? "border-orange-400 bg-orange-50 text-orange-900"
                : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {TOOL_LABELS[t]}
          </button>
        ))}
        <button
          type="button"
          disabled={!canAddMarking}
          onClick={handleAddMarking}
          className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Lägg till markering
        </button>
        <button
          type="button"
          onClick={handleClearAll}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Rensa
        </button>
        {(tool === "polygon" || tool === "line") && (
          <button
            type="button"
            disabled={
              tool === "polygon" ? polygonPoints.length < 3 : linePoints.length < 2
            }
            onClick={confirmDraft}
            className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-800 disabled:opacity-50"
          >
            {tool === "polygon" ? "Slutför polygon" : "Slutför linje"}
          </button>
        )}
      </div>

      {markings.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-sm font-medium text-slate-800">
            {markings.length} markering{markings.length === 1 ? "" : "ar"}
          </p>
          <ul className="mt-1 space-y-1">
            {markings.map((marking, index) => (
              <li key={index} className="flex items-center justify-between gap-2 text-sm text-slate-600">
                <span>
                  {index + 1}. {GEOMETRY_TYPE_LABELS[marking.type]}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveMarking(index)}
                  className="text-red-600 hover:underline"
                >
                  Ta bort
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <SuggestionCreateMapPanel
          mapSlug={mapSlug}
          versionId={versionId}
          drawPointerHandlers={drawPointerHandlers}
          markings={markings}
          currentGeometry={geometry}
          draftGeometry={draftGeometry}
          drawHint={drawHint}
          markingCount={totalMarkingCount}
          rootTransformRef={rootTransformRef}
        />
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="card mt-6 space-y-4">
        <div>
          <label htmlFor="category" className="form-label">
            Kategori
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as SuggestionCategoryValue)}
            className="form-input"
          >
            {Object.entries(SUGGESTION_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="title" className="form-label">
            Rubrik (valfritt)
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="form-input"
            placeholder="Kort sammanfattning"
          />
        </div>
        <div>
          <label htmlFor="comment" className="form-label">
            Beskrivning
          </label>
          <textarea
            id="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            required
            minLength={2}
            rows={4}
            className="form-input"
            placeholder="Beskriv vad som är fel, saknas eller bör förklaras (minst 2 tecken)."
          />
        </div>
        <div>
          <label htmlFor="attachment" className="form-label">
            Foto (valfritt)
          </label>
          <input
            id="attachment"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAttachmentChange}
            className="form-input"
          />
          {attachmentPreview && (
            <img
              src={attachmentPreview}
              alt="Förhandsvisning av bilaga"
              className="mt-2 max-h-48 rounded-lg border border-slate-200 object-contain"
            />
          )}
        </div>
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Sparar…" : "Skicka kartförslag"}
          </button>
          <Link
            href={`/maps/${mapSlug}`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Avbryt
          </Link>
        </div>
      </form>
    </div>
  );
}
