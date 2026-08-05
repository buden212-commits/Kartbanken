"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { DiffMapPanel, type MapDrawPointerHandlers } from "@/components/diff-map-panel";
import { screenToSvgPoint } from "@/lib/ocad/map-hit-test";
import {
  IDENTITY_SVG_TRANSFORM,
  svgUserToGeoPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";
import {
  isValidSuggestionBbox,
  normalizeSuggestionBbox,
  renderSuggestionGeometrySvg,
} from "@/lib/suggestion/geometry";
import {
  SUGGESTION_CATEGORY_LABELS,
  type SuggestionCategoryValue,
  type SuggestionGeometry,
} from "@/lib/suggestion/types";

type DrawTool = "pin" | "rectangle";

type Props = {
  mapSlug: string;
  mapTitle: string;
  versionId: string;
  versionNumber: number;
};

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
  const [geometry, setGeometry] = useState<SuggestionGeometry | null>(null);
  const [draftBbox, setDraftBbox] = useState<SuggestionGeometry | null>(null);
  const [category, setCategory] = useState<SuggestionCategoryValue>("FEL_I_TERRANG");
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, svg: SVGSVGElement) => {
      const pt = screenToSvgPoint(svg, e.clientX, e.clientY);
      if (!pt) return;

      if (tool === "pin") {
        const geo = svgUserToGeoPoint(pt, rootTransformRef.current);
        setGeometry({ type: "Point", coordinates: geo });
        setDraftBbox(null);
        setError(null);
        return;
      }

      dragRef.current = { start: pt, current: pt };
      setDraftBbox(null);
      setGeometry(null);
      setError(null);
    },
    [tool],
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

  const drawPointerHandlers = useMemo<MapDrawPointerHandlers>(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    }),
    [handlePointerDown, handlePointerMove, handlePointerUp],
  );

  function handleToolChange(next: DrawTool) {
    setTool(next);
    setGeometry(null);
    setDraftBbox(null);
    dragRef.current = null;
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
    if (!geometry) {
      setError(
        tool === "pin"
          ? "Klicka på kartan för att placera en markering"
          : "Dra en rektangel på kartan för att markera området",
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let attachmentPath: string | undefined;
      if (attachmentFile) {
        const uploadForm = new FormData();
        uploadForm.set("file", attachmentFile);
        const uploadRes = await fetch(`/api/maps/${mapSlug}/suggestions/attachment`, {
          method: "POST",
          body: uploadForm,
        });
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
          geometry,
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

  const overlayGeometry = draftBbox ?? geometry;
  const hasMarking = Boolean(geometry);

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
        <button
          type="button"
          onClick={() => handleToolChange("pin")}
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            tool === "pin"
              ? "border-orange-400 bg-orange-50 text-orange-900"
              : "border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          Punkt
        </button>
        <button
          type="button"
          onClick={() => handleToolChange("rectangle")}
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            tool === "rectangle"
              ? "border-orange-400 bg-orange-50 text-orange-900"
              : "border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          Rektangel
        </button>
      </div>

      <div className="mt-4">
        <DiffMapPanel
          previewUrl={`/api/maps/${mapSlug}/versions/${versionId}/preview`}
          title="Markera plats"
          mapSlug={mapSlug}
          versionId={versionId}
          interactionMode="draw"
          drawPointerHandlers={drawPointerHandlers}
          renderSvgOverlay={(rootTransform) => {
            rootTransformRef.current = rootTransform;
            if (!overlayGeometry) return null;
            return (
              <g
                dangerouslySetInnerHTML={{
                  __html: renderSuggestionGeometrySvg(overlayGeometry, rootTransform, {
                    label: "FÖRSLAG",
                    draft: Boolean(draftBbox),
                  }),
                }}
              />
            );
          }}
          secondaryHeaderContent={
            <p className="text-xs text-amber-700">
              {tool === "pin"
                ? "Ritläge — klicka på kartan för att placera markeringen."
                : "Ritläge — dra en rektangel på kartan."}
              {hasMarking ? " Markering klar." : " Ingen markering ännu."}
            </p>
          }
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
            minLength={10}
            rows={4}
            className="form-input"
            placeholder="Beskriv vad som är fel, saknas eller bör förklaras (minst 10 tecken)."
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
