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
  liveMapRenderOptions,
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

type SubmissionDraft = {
  category: SuggestionCategoryValue;
  title: string;
  comment: string;
  attachmentFile: File | null;
  attachmentPreview: string | null;
};

const EMPTY_SUBMISSION_DRAFT: SubmissionDraft = {
  category: "FEL_I_TERRANG",
  title: "",
  comment: "",
  attachmentFile: null,
  attachmentPreview: null,
};

const NEUTRAL_BTN =
  "rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

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
        parts.push(
          renderSuggestionGeometrySvg(marking, rootTransform, {
            label: "FÖRSLAG",
            ...liveMapRenderOptions(),
          }),
        );
      }
      const overlay = draftGeometry ?? currentGeometry;
      if (overlay) {
        parts.push(
          renderSuggestionGeometrySvg(overlay, rootTransform, {
            label: "FÖRSLAG",
            draft: Boolean(draftGeometry && !currentGeometry),
            ...liveMapRenderOptions(),
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
  const [pendingPoint, setPendingPoint] = useState<[number, number] | null>(null);
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
  const [formOpen, setFormOpen] = useState(false);
  const [submissionDraft, setSubmissionDraft] = useState<SubmissionDraft>(EMPTY_SUBMISSION_DRAFT);

  const clearFormFields = useCallback(() => {
    setCategory(EMPTY_SUBMISSION_DRAFT.category);
    setTitle(EMPTY_SUBMISSION_DRAFT.title);
    setComment(EMPTY_SUBMISSION_DRAFT.comment);
    setAttachmentFile(null);
    setAttachmentPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const resetDraft = useCallback(() => {
    setPendingPoint(null);
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
        setFormOpen(false);
        setPendingPoint(geo);
        setGeometry(null);
        setDraftBbox(null);
        setPolygonPoints([]);
        setLinePoints([]);
        setError(null);
        return;
      }

      if (tool === "rectangle") {
        setFormOpen(false);
        dragRef.current = { start: pt, current: pt };
        setDraftBbox(null);
        setPolygonPoints([]);
        setLinePoints([]);
        return;
      }

      if (tool === "polygon") {
        setFormOpen(false);
        setPolygonPoints((prev) => [...prev, geo]);
        setDraftBbox(null);
        setLinePoints([]);
        setGeometry(null);
        setError(null);
        return;
      }

      if (tool === "line") {
        setFormOpen(false);
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
      setDraftBbox({ type: "Bbox", bbox });
      setGeometry(null);
      setError(null);
    },
    [tool],
  );

  const finishDrawing = useCallback(() => {
    const openForm = () => setFormOpen(true);

    if (tool === "pin" && pendingPoint) {
      setGeometry({ type: "Point", coordinates: pendingPoint });
      setPendingPoint(null);
      setError(null);
      openForm();
      return;
    }
    if (tool === "rectangle" && draftBbox?.type === "Bbox") {
      if (!isValidSuggestionBbox(draftBbox.bbox)) {
        setError("Rektangeln är för liten — dra ut ett större område");
        return;
      }
      setGeometry(draftBbox);
      setDraftBbox(null);
      setError(null);
      openForm();
      return;
    }
    if (tool === "polygon" && polygonPoints.length >= 3) {
      if (!isValidSuggestionPolygonRing(polygonPoints)) {
        setError("Polygonen är för liten — lägg fler hörn");
        return;
      }
      setGeometry({ type: "Polygon", ring: polygonPoints });
      setPolygonPoints([]);
      setError(null);
      openForm();
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
      openForm();
    }
  }, [draftBbox, linePoints, pendingPoint, polygonPoints, tool]);

  const draftGeometry = useMemo((): SuggestionGeometry | null => {
    if (pendingPoint) return { type: "Point", coordinates: pendingPoint };
    if (draftBbox) return draftBbox;
    if (polygonPoints.length >= 2) return { type: "Polygon", ring: polygonPoints };
    if (linePoints.length >= 1) return { type: "LineString", coordinates: linePoints };
    return null;
  }, [draftBbox, linePoints, pendingPoint, polygonPoints]);

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
        ? "Ritläge — klicka på kartan och klicka sedan Slutför."
        : tool === "rectangle"
          ? "Ritläge — dra en rektangel på kartan och klicka sedan Slutför."
          : tool === "polygon"
            ? "Ritläge — klicka hörn, minst 3 punkter, sedan Slutför."
            : "Ritläge — klicka punkter längs linjen, minst 2, sedan Slutför.",
    [tool],
  );

  const canFinishDrawing = useMemo(() => {
    if (tool === "pin") return pendingPoint !== null;
    if (tool === "rectangle") {
      return draftBbox?.type === "Bbox" && isValidSuggestionBbox(draftBbox.bbox);
    }
    if (tool === "polygon") return polygonPoints.length >= 3;
    if (tool === "line") return linePoints.length >= 2;
    return false;
  }, [draftBbox, linePoints.length, pendingPoint, polygonPoints.length, tool]);

  const hasActiveDrawing = draftGeometry !== null;
  const canAddMarking = Boolean(geometry);
  const totalMarkingCount = markings.length + (geometry ? 1 : 0);
  const slutforColored = hasActiveDrawing;
  const laggTillColored = canAddMarking && formOpen;

  function handleToolChange(next: DrawTool) {
    setTool(next);
    setGeometry(null);
    setFormOpen(false);
    resetDraft();
    setError(null);
  }

  function handleAddMarking() {
    if (!geometry) return;
    if (markings.length >= MAX_SUGGESTION_GEOMETRIES) {
      setError(`Max ${MAX_SUGGESTION_GEOMETRIES} markeringar per förslag`);
      return;
    }
    if (comment.trim().length >= 2) {
      setSubmissionDraft({
        category,
        title,
        comment,
        attachmentFile,
        attachmentPreview,
      });
    }
    setMarkings((prev) => [...prev, geometry]);
    setGeometry(null);
    setFormOpen(false);
    clearFormFields();
    resetDraft();
    setError(null);
  }

  function handleRemoveMarking(index: number) {
    setMarkings((prev) => prev.filter((_, i) => i !== index));
  }

  function handleClearAll() {
    setMarkings([]);
    setGeometry(null);
    setFormOpen(false);
    setSubmissionDraft(EMPTY_SUBMISSION_DRAFT);
    clearFormFields();
    resetDraft();
    setError(null);
  }

  function resolveSubmissionFields() {
    const useLiveForm = formOpen && comment.trim().length >= 2;
    return {
      category: useLiveForm ? category : submissionDraft.category,
      title: useLiveForm ? title.trim() : submissionDraft.title.trim(),
      comment: useLiveForm ? comment : submissionDraft.comment,
      attachmentFile: useLiveForm ? attachmentFile : submissionDraft.attachmentFile,
    };
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
        setError("Klicka «Lägg till ändring» innan du skickar, eller rensa den aktuella ritningen");
      } else {
        setError("Lägg till minst en markering på kartan");
      }
      return;
    }
    const submission = resolveSubmissionFields();
    if (submission.comment.trim().length < 2) {
      setError("Beskrivning krävs (minst 2 tecken) — markera, slutför och fyll i formuläret");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let attachmentPath: string | undefined;
      if (submission.attachmentFile) {
        const uploadRes = await uploadSuggestionAttachment(mapSlug, submission.attachmentFile);
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
          category: submission.category,
          title: submission.title || undefined,
          comment: submission.comment,
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
          disabled={!canFinishDrawing}
          onClick={finishDrawing}
          className={
            slutforColored
              ? "rounded-lg border border-orange-400 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-900 disabled:cursor-not-allowed disabled:opacity-50"
              : NEUTRAL_BTN
          }
        >
          Slutför
        </button>
        <button
          type="button"
          disabled={!canAddMarking}
          onClick={handleAddMarking}
          className={
            laggTillColored
              ? "rounded-lg bg-ifk-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-ifk-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
              : NEUTRAL_BTN
          }
        >
          Lägg till ändring
        </button>
        <button
          type="button"
          onClick={handleClearAll}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Rensa
        </button>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-6">
        <section
          className={`rounded-lg border px-4 py-4 sm:px-6 ${
            formOpen ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-75"
          }`}
        >
          <h2 className="text-sm font-semibold text-slate-900">Beskriv ändringen</h2>
          {!formOpen ? (
            <p className="mt-1 text-sm text-slate-500">
              Markera på kartan och klicka Slutför för att fylla i kategori, beskrivning och foto.
            </p>
          ) : (
            <fieldset disabled={!formOpen} className="mt-4 space-y-4 disabled:opacity-100">
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
            </fieldset>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-slate-900">Skicka kartförslag</h2>
          <p className="mt-1 text-sm text-slate-600">
            {markings.length > 0
              ? `Du skickar ${markings.length} ändring${markings.length === 1 ? "" : "ar"} tillsammans i ett kartförslag.`
              : "Lägg till minst en ändring på kartan innan du skickar."}
          </p>
          {markings.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2">
              {markings.map((marking, index) => (
                <li
                  key={index}
                  className="flex items-center justify-between gap-2 text-sm text-slate-600"
                >
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
          )}
          {error && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" disabled={loading || markings.length < 1} className="btn-primary">
              {loading
                ? "Sparar…"
                : markings.length > 0
                  ? `Skicka kartförslag (${markings.length} st)`
                  : "Skicka kartförslag"}
            </button>
            <Link
              href={`/maps/${mapSlug}`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Avbryt
            </Link>
          </div>
        </section>

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
      </form>
    </div>
  );
}
