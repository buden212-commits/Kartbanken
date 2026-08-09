"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiffMapPanel, type MapDrawPointerHandlers } from "@/components/diff-map-panel";
import { HelpSectionHeading } from "@/components/help-link-icon";
import { screenToSvgPoint } from "@/lib/ocad/map-hit-test";
import {
  IDENTITY_SVG_TRANSFORM,
  svgUserToGeoPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";
import {
  bboxFromSuggestionGeometries,
  isValidSuggestionBbox,
  isValidSuggestionLineCoordinates,
  isValidSuggestionPolygonRing,
  liveMapRenderOptions,
  normalizeSuggestionBbox,
  renderSuggestionGeometrySvg,
  renderSuggestionObjectsSvg,
} from "@/lib/suggestion/geometry";
import {
  SUGGESTION_CATEGORY_LABELS,
  SUGGESTION_STATUS_LABELS,
  SuggestionStatus,
  formatSuggestionStatusAttribution,
  type SuggestionCategoryValue,
  type SuggestionDetail,
  type SuggestionGeometry,
  type SuggestionStatusValue,
} from "@/lib/suggestion/types";
import { formatDate, formatDateOnly } from "@/lib/format";

type DrawTool = "pin" | "rectangle" | "polygon" | "line";

type CheckoutOption = {
  id: string;
  label: string;
  integratedVersionId: string | null;
};

type VersionOption = {
  id: string;
  versionNumber: number;
};

type Props = {
  mapSlug: string;
  mapTitle: string;
  suggestion: SuggestionDetail;
  canReview: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  checkoutOptions: CheckoutOption[];
  publishedVersions: VersionOption[];
};

const TOOL_LABELS: Record<DrawTool, string> = {
  pin: "Punkt",
  rectangle: "Rektangel",
  polygon: "Polygon",
  line: "Linje",
};

function statusBadgeClass(status: SuggestionStatusValue): string {
  switch (status) {
    case SuggestionStatus.OPEN:
      return "bg-amber-50 text-amber-800 border-amber-200";
    case SuggestionStatus.IN_PROGRESS:
      return "bg-sky-50 text-sky-800 border-sky-200";
    case SuggestionStatus.IMPLEMENTED:
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export function SuggestionDetailClient({
  mapSlug,
  mapTitle,
  suggestion: initial,
  canReview,
  isOwner,
  isAdmin,
  checkoutOptions,
  publishedVersions,
}: Props) {
  const router = useRouter();
  const rootTransformRef = useRef<SvgRootTransform>(IDENTITY_SVG_TRANSFORM);
  const dragRef = useRef<{ start: [number, number]; current: [number, number] } | null>(null);
  const fitRequestIdRef = useRef(0);
  const autoZoomDoneRef = useRef(false);
  const [fitGeoBbox, setFitGeoBbox] = useState<{
    bbox: [number, number, number, number];
    requestId: number;
  } | null>(null);

  const [suggestion, setSuggestion] = useState(initial);
  const [reviewComment, setReviewComment] = useState("");
  const [selectedCheckoutId, setSelectedCheckoutId] = useState("");
  const [selectedIntegratedVersionId, setSelectedIntegratedVersionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editCategory, setEditCategory] = useState<SuggestionCategoryValue>(initial.category);
  const [editTitle, setEditTitle] = useState(initial.title ?? "");
  const [editComment, setEditComment] = useState(initial.comment);
  const [editGeometry, setEditGeometry] = useState<SuggestionGeometry | null>(
    initial.objects[0]?.geometry ?? null,
  );
  const [redrawMarking, setRedrawMarking] = useState(false);
  const [drawTool, setDrawTool] = useState<DrawTool>("pin");
  const [draftBbox, setDraftBbox] = useState<SuggestionGeometry | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [linePoints, setLinePoints] = useState<[number, number][]>([]);

  const allMarkings = suggestion.objects;
  const canEdit = isOwner && suggestion.status === SuggestionStatus.OPEN;
  const canDelete =
    isAdmin || (isOwner && suggestion.status === SuggestionStatus.OPEN);
  const canReviewNow =
    canReview &&
    (suggestion.status === SuggestionStatus.OPEN ||
      suggestion.status === SuggestionStatus.IN_PROGRESS);

  const overlayLabel = useMemo(
    () => SUGGESTION_CATEGORY_LABELS[suggestion.category],
    [suggestion.category],
  );

  const statusAttribution = useMemo(
    () =>
      formatSuggestionStatusAttribution(
        suggestion.status,
        suggestion.reviewedBy,
        suggestion.reviewedAt,
        formatDateOnly,
      ),
    [suggestion.status, suggestion.reviewedBy, suggestion.reviewedAt],
  );

  const resetDrawDraft = useCallback(() => {
    setDraftBbox(null);
    setPolygonPoints([]);
    setLinePoints([]);
    dragRef.current = null;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, svg: SVGSVGElement) => {
      if (!redrawMarking) return;
      const pt = screenToSvgPoint(svg, e.clientX, e.clientY);
      if (!pt) return;
      const geo = svgUserToGeoPoint(pt, rootTransformRef.current);

      if (drawTool === "pin") {
        setEditGeometry({ type: "Point", coordinates: geo });
        resetDrawDraft();
        return;
      }
      if (drawTool === "rectangle") {
        dragRef.current = { start: pt, current: pt };
        setDraftBbox(null);
        setPolygonPoints([]);
        setLinePoints([]);
        return;
      }
      if (drawTool === "polygon") {
        setPolygonPoints((prev) => [...prev, geo]);
        setDraftBbox(null);
        setLinePoints([]);
        setEditGeometry(null);
        return;
      }
      if (drawTool === "line") {
        setLinePoints((prev) => [...prev, geo]);
        setDraftBbox(null);
        setPolygonPoints([]);
        setEditGeometry(null);
      }
    },
    [drawTool, redrawMarking, resetDrawDraft],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent, svg: SVGSVGElement) => {
      if (!redrawMarking || drawTool !== "rectangle" || !dragRef.current) return;
      const pt = screenToSvgPoint(svg, e.clientX, e.clientY);
      if (!pt) return;
      dragRef.current.current = pt;
      const startGeo = svgUserToGeoPoint(dragRef.current.start, rootTransformRef.current);
      const endGeo = svgUserToGeoPoint(pt, rootTransformRef.current);
      setDraftBbox({ type: "Bbox", bbox: normalizeSuggestionBbox(startGeo, endGeo) });
    },
    [drawTool, redrawMarking],
  );

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent, _svg: SVGSVGElement) => {
      if (!redrawMarking || drawTool !== "rectangle" || !dragRef.current) return;
      const startGeo = svgUserToGeoPoint(dragRef.current.start, rootTransformRef.current);
      const endGeo = svgUserToGeoPoint(dragRef.current.current, rootTransformRef.current);
      dragRef.current = null;
      const bbox = normalizeSuggestionBbox(startGeo, endGeo);
      if (!isValidSuggestionBbox(bbox)) {
        setDraftBbox(null);
        setError("Rektangeln är för liten");
        return;
      }
      setEditGeometry({ type: "Bbox", bbox });
      setDraftBbox(null);
    },
    [drawTool, redrawMarking],
  );

  const confirmDrawDraft = useCallback(() => {
    if (drawTool === "polygon" && polygonPoints.length >= 3) {
      if (!isValidSuggestionPolygonRing(polygonPoints)) {
        setError("Polygonen är för liten");
        return;
      }
      setEditGeometry({ type: "Polygon", ring: polygonPoints });
      setPolygonPoints([]);
      return;
    }
    if (drawTool === "line" && linePoints.length >= 2) {
      setEditGeometry({ type: "LineString", coordinates: linePoints });
      setLinePoints([]);
    }
  }, [drawTool, linePoints, polygonPoints]);

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

  const displayGeometries = useMemo((): SuggestionGeometry[] => {
    if (editMode && redrawMarking) {
      const overlay = draftGeometry ?? editGeometry;
      return overlay ? [overlay] : [];
    }
    return allMarkings.map((obj) => obj.geometry);
  }, [allMarkings, draftGeometry, editGeometry, editMode, redrawMarking]);

  const zoomToMarkings = useCallback(() => {
    const bbox = bboxFromSuggestionGeometries(displayGeometries);
    if (!bbox) return;
    fitRequestIdRef.current += 1;
    setFitGeoBbox({ bbox, requestId: fitRequestIdRef.current });
  }, [displayGeometries]);

  useEffect(() => {
    if (autoZoomDoneRef.current || editMode || displayGeometries.length === 0) return;
    autoZoomDoneRef.current = true;
    zoomToMarkings();
  }, [displayGeometries, editMode, zoomToMarkings]);

  async function patchSuggestion(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/maps/${mapSlug}/suggestions/${suggestion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as SuggestionDetail & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Kunde inte uppdatera förslaget");
      }
      setSuggestion(data);
      router.refresh();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera förslaget");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(status: SuggestionStatusValue) {
    const body: Record<string, unknown> = {
      status,
      reviewComment: reviewComment.trim() || undefined,
    };
    if (status === SuggestionStatus.IMPLEMENTED) {
      if (selectedCheckoutId) body.checkoutId = selectedCheckoutId;
      if (selectedIntegratedVersionId) {
        body.integratedVersionId = selectedIntegratedVersionId;
      }
    }
    await patchSuggestion(body);
  }

  async function handleDelete() {
    if (!window.confirm("Radera detta kartförslag?")) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/maps/${mapSlug}/suggestions/${suggestion.id}`, {
      method: "DELETE",
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Kunde inte radera");
      return;
    }
    router.push(`/maps/${mapSlug}`);
    router.refresh();
  }

  function startEdit() {
    setEditCategory(suggestion.category);
    setEditTitle(suggestion.title ?? "");
    setEditComment(suggestion.comment);
    setEditGeometry(suggestion.objects[0]?.geometry ?? null);
    setRedrawMarking(false);
    resetDrawDraft();
    setEditMode(true);
    setError(null);
  }

  function cancelEdit() {
    setEditMode(false);
    setRedrawMarking(false);
    resetDrawDraft();
    setError(null);
  }

  async function saveEdit() {
    const body: Record<string, unknown> = {
      category: editCategory,
      title: editTitle.trim() || null,
      comment: editComment,
    };
    if (editGeometry) {
      body.geometry = editGeometry;
    }
    const updated = await patchSuggestion(body);
    if (updated) {
      setEditMode(false);
      setRedrawMarking(false);
      resetDrawDraft();
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href={`/maps/${mapSlug}`} className="link-muted text-sm">
        ← {mapTitle}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {suggestion.title?.trim() || "Kartförslag"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            v{suggestion.versionNumber} · {SUGGESTION_CATEGORY_LABELS[suggestion.category]} ·{" "}
            {formatDate(suggestion.createdAt)}
          </p>
          {suggestion.appliesToOlderVersion && (
            <p className="mt-1 text-sm font-medium text-violet-700">
              Gäller version {suggestion.versionNumber}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && !editMode && (
            <button
              type="button"
              onClick={startEdit}
              className="rounded-lg border border-[#FD3DB5]/40 bg-[#FD3DB5]/10 px-3 py-1.5 text-sm font-medium text-[#9D0066] hover:bg-[#FD3DB5]/20"
            >
              Redigera
            </button>
          )}
          <span
            className={`rounded-full border px-3 py-1 text-sm font-medium ${statusBadgeClass(suggestion.status)}`}
          >
            {SUGGESTION_STATUS_LABELS[suggestion.status]}
          </span>
        </div>
      </div>

      {statusAttribution && (
        <p className="mt-2 text-sm text-slate-600">{statusAttribution}</p>
      )}

      {editMode ? (
        <div className="card mt-6 space-y-4">
          <HelpSectionHeading section="kartforslag">Redigera kartförslag</HelpSectionHeading>
          <div>
            <label htmlFor="editCategory" className="form-label">
              Kategori
            </label>
            <select
              id="editCategory"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value as SuggestionCategoryValue)}
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
            <label htmlFor="editTitle" className="form-label">
              Rubrik (valfritt)
            </label>
            <input
              id="editTitle"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={120}
              className="form-input"
            />
          </div>
          <div>
            <label htmlFor="editComment" className="form-label">
              Beskrivning
            </label>
            <textarea
              id="editComment"
              value={editComment}
              onChange={(e) => setEditComment(e.target.value)}
              required
              minLength={2}
              rows={4}
              className="form-input"
            />
          </div>
          <div>
            <button
              type="button"
              onClick={() => {
                setRedrawMarking((v) => !v);
                resetDrawDraft();
              }}
              className="text-sm text-[#C2188F] hover:underline"
            >
              {redrawMarking ? "Avbryt omritning" : "Byt markering på kartan"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={loading} onClick={() => void saveEdit()} className="btn-primary">
              {loading ? "Sparar…" : "Spara ändringar"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={cancelEdit}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Avbryt
            </button>
          </div>
        </div>
      ) : (
        <div className="card mt-6 space-y-3 text-sm text-slate-700">
          <p>
            <span className="font-medium text-slate-900">Skapad av:</span>{" "}
            {suggestion.createdBy.name?.trim() || suggestion.createdBy.email}
          </p>
          <p className="whitespace-pre-wrap">{suggestion.comment}</p>
          {suggestion.reviewComment && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="font-medium text-slate-900">Granskning:</span>{" "}
              {suggestion.reviewComment}
            </p>
          )}
          {suggestion.integratedVersionNumber != null && (
            <p>
              <span className="font-medium text-slate-900">Införd i version:</span> v
              {suggestion.integratedVersionNumber}
            </p>
          )}
          {suggestion.hasAttachment && (
            <div>
              <span className="font-medium text-slate-900">Foto:</span>
              <img
                src={`/api/maps/${mapSlug}/suggestions/${suggestion.id}/attachment`}
                alt="Bilaga till kartförslag"
                className="mt-2 max-h-64 rounded-lg border border-slate-200 object-contain"
              />
            </div>
          )}
        </div>
      )}

      {editMode && redrawMarking && (
        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(TOOL_LABELS) as DrawTool[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setDrawTool(t);
                resetDrawDraft();
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                drawTool === t
                  ? "border-[#FD3DB5] bg-[#FD3DB5]/10 text-[#9D0066]"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {TOOL_LABELS[t]}
            </button>
          ))}
          {(drawTool === "polygon" || drawTool === "line") && (
            <button
              type="button"
              disabled={
                drawTool === "polygon" ? polygonPoints.length < 3 : linePoints.length < 2
              }
              onClick={confirmDrawDraft}
              className="rounded-lg bg-[#FD3DB5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#E835A5] disabled:opacity-50"
            >
              {drawTool === "polygon" ? "Slutför polygon" : "Slutför linje"}
            </button>
          )}
        </div>
      )}

      <div className="mt-6">
        <DiffMapPanel
          previewUrl={`/api/maps/${mapSlug}/versions/${suggestion.mapVersionId}/preview`}
          title="Plats på kartan"
          mapSlug={mapSlug}
          versionId={suggestion.mapVersionId}
          interactionMode={editMode && redrawMarking ? "draw" : "navigate"}
          drawPointerHandlers={editMode && redrawMarking ? drawPointerHandlers : undefined}
          fitGeoBbox={fitGeoBbox}
          secondaryHeaderContent={
            displayGeometries.length > 0 ? (
              <button
                type="button"
                onClick={zoomToMarkings}
                className="rounded-lg border border-[#FD3DB5]/40 bg-[#FD3DB5]/10 px-3 py-1.5 text-sm font-medium text-[#9D0066] hover:bg-[#FD3DB5]/20"
              >
                Zooma till markering
                {displayGeometries.length > 1
                  ? ` (${displayGeometries.length})`
                  : ""}
              </button>
            ) : null
          }
          renderSvgOverlay={(rootTransform) => {
            rootTransformRef.current = rootTransform;
            if (displayGeometries.length === 0) return null;
            if (editMode && redrawMarking) {
              return (
                <g
                  dangerouslySetInnerHTML={{
                    __html: renderSuggestionGeometrySvg(displayGeometries[0]!, rootTransform, {
                      label: overlayLabel,
                      selected: true,
                      draft: Boolean(draftGeometry),
                      ...liveMapRenderOptions(),
                    }),
                  }}
                />
              );
            }
            return (
              <g
                dangerouslySetInnerHTML={{
                  __html: renderSuggestionObjectsSvg(
                    allMarkings.map((obj) => ({
                      id: obj.id,
                      objectType: obj.objectType,
                      geometry: obj.geometry,
                      sortOrder: obj.sortOrder,
                    })),
                    rootTransform,
                    { label: overlayLabel, selected: true, ...liveMapRenderOptions() },
                  ),
                }}
              />
            );
          }}
        />
      </div>

      {canReviewNow && !editMode && (
        <div className="card mt-6 space-y-4">
          <HelpSectionHeading section="kartforslag">Granska förslag</HelpSectionHeading>
          <p className="text-sm text-slate-600">
            <Link href={`/maps/${mapSlug}/checkout`} className="link-primary">
              Checka ut område
            </Link>
            {" "}för att redigera kartfilen i OCAD utifrån detta förslag.
          </p>
          <div>
            <label htmlFor="reviewComment" className="form-label">
              Kommentar till skaparen (krävs vid avvisning)
            </label>
            <textarea
              id="reviewComment"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              rows={3}
              className="form-input"
            />
          </div>

          {checkoutOptions.length > 0 && (
            <div>
              <label htmlFor="checkoutId" className="form-label">
                Koppla checkout (valfritt, vid införande)
              </label>
              <select
                id="checkoutId"
                value={selectedCheckoutId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedCheckoutId(id);
                  const match = checkoutOptions.find((c) => c.id === id);
                  if (match?.integratedVersionId) {
                    setSelectedIntegratedVersionId(match.integratedVersionId);
                  }
                }}
                className="form-input"
              >
                <option value="">— Ingen checkout —</option>
                {checkoutOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {publishedVersions.length > 0 && (
            <div>
              <label htmlFor="integratedVersionId" className="form-label">
                Införd i version (valfritt)
              </label>
              <select
                id="integratedVersionId"
                value={selectedIntegratedVersionId}
                onChange={(e) => setSelectedIntegratedVersionId(e.target.value)}
                className="form-input"
              >
                <option value="">— Välj version —</option>
                {publishedVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleReview(SuggestionStatus.IN_PROGRESS)}
              className="rounded-lg border border-sky-300 px-4 py-2 text-sm text-sky-800 hover:bg-sky-50"
            >
              Markera som pågår
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleReview(SuggestionStatus.IMPLEMENTED)}
              className="btn-primary"
            >
              Markera som införd
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleReview(SuggestionStatus.REJECTED)}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              Avvisa
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {canDelete && !editMode && (
        <div className="mt-6">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleDelete()}
            className="text-sm text-red-600 hover:underline"
          >
            Radera kartförslag
          </button>
        </div>
      )}
    </div>
  );
}
