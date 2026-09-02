"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DiffMapPanel, type MapDrawPointerHandlers } from "@/components/diff-map-panel";
import { fieldEditOverlaySvg } from "@/components/field-edit/field-edit-overlay";
import {
  buildSymbolGroups,
  defaultSymbolForKind,
  FieldEditSymbolPicker,
  type SymbolGroups,
} from "@/components/field-edit/field-edit-symbol-picker";
import type { CheckoutSelection } from "@/lib/checkout/types";
import { geometryKindFromType, hitTestFieldEditObject, hitTestFieldEditVertex } from "@/lib/field-edit/hit-test";
import type { FieldEditObjectEntry } from "@/lib/field-edit/object-index";
import {
  clearLocalFieldEditOps,
  loadLocalFieldEditOps,
  mergeInitialOps,
  saveLocalFieldEditOps,
} from "@/lib/field-edit/local-storage";
import {
  countFieldEditChanges,
  hasFieldEditChanges,
  resolveObjectCoordinates,
  type FieldEditGeometryKind,
  type FieldEditModify,
  type FieldEditOps,
} from "@/lib/field-edit/types";
import { screenToSvgPoint } from "@/lib/ocad/map-hit-test";
import { parseOcadLayersFromSvg } from "@/lib/ocad/svg-utils";
import { fetchPreviewText } from "@/lib/ocad/preview-fetch";
import {
  IDENTITY_SVG_TRANSFORM,
  svgUserToGeoPoint,
  type SvgRootTransform,
} from "@/lib/ocad/svg-coords";

type FieldEditTool =
  | "select"
  | "delete"
  | "addPoint"
  | "addLine"
  | "addArea";

type Props = {
  mapSlug: string;
  mapTitle: string;
  sessionId: string;
  selection: CheckoutSelection;
  initialOps: FieldEditOps;
};

const HIT_DISTANCE = 22;
const VERTEX_HIT_DISTANCE = 18;

export function FieldEditSessionClient({
  mapSlug,
  mapTitle,
  sessionId,
  selection,
  initialOps,
}: Props) {
  const router = useRouter();
  const [tool, setTool] = useState<FieldEditTool>("select");
  const [ops, setOps] = useState<FieldEditOps>(() => mergeInitialOps(sessionId, initialOps));
  const [objects, setObjects] = useState<FieldEditObjectEntry[]>([]);
  const [symbolGroups, setSymbolGroups] = useState<SymbolGroups>({
    point: [],
    line: [],
    area: [],
  });
  const [symbolNumber, setSymbolNumber] = useState<number | "">("");
  const [selectedObjectIndex, setSelectedObjectIndex] = useState<number | null>(null);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [syncing, setSyncing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishAfter, setPublishAfter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "saved" | "local" | "error">("local");
  const rootTransformRef = useRef<SvgRootTransform>(IDENTITY_SVG_TRANSFORM);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragVertexRef = useRef<{
    objectIndex: number;
    vertexIndex: number;
    startCoords: [number, number][];
  } | null>(null);
  const opsRef = useRef(ops);
  opsRef.current = ops;

  const addKind: FieldEditGeometryKind | null =
    tool === "addPoint" ? "point" : tool === "addLine" ? "line" : tool === "addArea" ? "area" : null;

  const draftKind: "line" | "area" | null =
    tool === "addLine" ? "line" : tool === "addArea" ? "area" : null;

  useEffect(() => {
    fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}/objects`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.objects)) setObjects(data.objects);
      })
      .catch(() => {});

    fetchPreviewText(`/api/maps/${mapSlug}/field-edits/${sessionId}/preview?direct=1`)
      .then((svg) => {
        const layers = parseOcadLayersFromSvg(svg);
        const groups = buildSymbolGroups(layers);
        setSymbolGroups(groups);
      })
      .catch(() => {});
  }, [mapSlug, sessionId]);

  useEffect(() => {
    if (addKind) {
      setSymbolNumber(defaultSymbolForKind(symbolGroups, addKind));
    }
  }, [addKind, symbolGroups]);

  const scheduleServerSync = useCallback(
    (nextOps: FieldEditOps) => {
      saveLocalFieldEditOps(sessionId, nextOps);
      setSyncState("local");
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(async () => {
        setSyncing(true);
        const res = await fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}/ops`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextOps),
        });
        setSyncing(false);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Kunde inte synka till servern — ändringar finns lokalt");
          setSyncState("error");
          return;
        }
        setSyncState("saved");
        setError(null);
      }, 1500);
    },
    [mapSlug, sessionId],
  );

  const updateOps = useCallback(
    (updater: (current: FieldEditOps) => FieldEditOps) => {
      setOps((current) => {
        const next = updater(current);
        scheduleServerSync(next);
        return next;
      });
    },
    [scheduleServerSync],
  );

  const upsertModify = useCallback(
    (objectIndex: number, coordinates: [number, number][]) => {
      const obj = objects.find((entry) => entry.i === objectIndex);
      if (!obj) return;
      updateOps((current) => {
        const kind = geometryKindFromType(obj.t);
        const existing = current.modifies.find((m) => m.objectIndex === objectIndex);
        const nextModify: FieldEditModify = {
          objectIndex,
          symbolNumber: obj.s,
          geometryKind: kind,
          coordinates,
        };
        const modifies = existing
          ? current.modifies.map((m) => (m.objectIndex === objectIndex ? nextModify : m))
          : [...current.modifies, nextModify];
        const deletes = current.deletes.filter((id) => id !== objectIndex);
        return { ...current, modifies, deletes };
      });
    },
    [objects, updateOps],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, svg: SVGSVGElement) => {
      const pt = screenToSvgPoint(svg, e.clientX, e.clientY);
      if (!pt) return;
      const geo = svgUserToGeoPoint(pt, rootTransformRef.current);

      if (tool === "select") {
        if (selectedObjectIndex != null) {
          const coords =
            resolveObjectCoordinates(
              selectedObjectIndex,
              objects.find((o) => o.i === selectedObjectIndex)?.v ?? [],
              ops,
            ) ?? [];
          const vertexIndex = hitTestFieldEditVertex(coords, geo, VERTEX_HIT_DISTANCE);
          if (vertexIndex != null) {
            const obj = objects.find((o) => o.i === selectedObjectIndex);
            const startCoords =
              resolveObjectCoordinates(selectedObjectIndex, obj?.v ?? [], opsRef.current) ??
              obj?.v.map(([x, y]) => [x, y] as [number, number]) ??
              [];
            dragVertexRef.current = {
              objectIndex: selectedObjectIndex,
              vertexIndex,
              startCoords: startCoords.map(([x, y]) => [x, y] as [number, number]),
            };
            setSelectedVertexIndex(vertexIndex);
            return;
          }
        }

        const hit = hitTestFieldEditObject(objects, geo, HIT_DISTANCE);
        if (!hit || ops.deletes.includes(hit.i)) {
          setSelectedObjectIndex(null);
          setSelectedVertexIndex(null);
          return;
        }
        setSelectedObjectIndex(hit.i);
        setSelectedVertexIndex(null);
        setError(null);
        return;
      }

      if (tool === "delete") {
        const hit = hitTestFieldEditObject(objects, geo, HIT_DISTANCE);
        if (!hit) {
          setError("Inget objekt hittades — zooma in och försök igen");
          return;
        }
        updateOps((current) => {
          const deletes = current.deletes.includes(hit.i)
            ? current.deletes.filter((id) => id !== hit.i)
            : [...current.deletes.filter((id) => id !== hit.i), hit.i];
          const modifies = current.modifies.filter((m) => m.objectIndex !== hit.i);
          return { ...current, deletes, modifies };
        });
        if (selectedObjectIndex === hit.i) {
          setSelectedObjectIndex(null);
          setSelectedVertexIndex(null);
        }
        setError(null);
        return;
      }

      if (tool === "addPoint") {
        if (symbolNumber === "") {
          setError("Välj en punkt-symbol");
          return;
        }
        updateOps((current) => ({
          ...current,
          adds: [
            ...current.adds,
            { kind: "point", x: geo[0], y: geo[1], symbolNumber: Number(symbolNumber) },
          ],
        }));
        setError(null);
        return;
      }

      if (tool === "addLine" || tool === "addArea") {
        setDraftPoints((prev) => [...prev, geo]);
        setError(null);
      }
    },
    [objects, ops, selectedObjectIndex, symbolNumber, tool, updateOps],
  );

  const handlePointerMove = useCallback(
    (_e: React.PointerEvent, svg: SVGSVGElement) => {
      const drag = dragVertexRef.current;
      if (!drag || tool !== "select") return;
      const pt = screenToSvgPoint(svg, _e.clientX, _e.clientY);
      if (!pt) return;
      const geo = svgUserToGeoPoint(pt, rootTransformRef.current);
      const next = drag.startCoords.map(([x, y], index) =>
        index === drag.vertexIndex ? ([geo[0], geo[1]] as [number, number]) : ([x, y] as [number, number]),
      );
      upsertModify(drag.objectIndex, next);
    },
    [objects, tool, upsertModify],
  );

  const handlePointerUp = useCallback(() => {
    dragVertexRef.current = null;
  }, []);

  const finishDraft = useCallback(() => {
    if (symbolNumber === "") {
      setError("Välj symbol");
      return;
    }
    if (tool === "addLine") {
      if (draftPoints.length < 2) {
        setError("Linjen behöver minst 2 punkter");
        return;
      }
      updateOps((current) => ({
        ...current,
        adds: [
          ...current.adds,
          {
            kind: "line",
            coordinates: draftPoints,
            symbolNumber: Number(symbolNumber),
          },
        ],
      }));
    } else if (tool === "addArea") {
      if (draftPoints.length < 3) {
        setError("Ytan behöver minst 3 hörn");
        return;
      }
      updateOps((current) => ({
        ...current,
        adds: [
          ...current.adds,
          {
            kind: "area",
            ring: draftPoints,
            symbolNumber: Number(symbolNumber),
          },
        ],
      }));
    }
    setDraftPoints([]);
    setError(null);
  }, [draftPoints, symbolNumber, tool, updateOps]);

  const cancelDraft = useCallback(() => {
    setDraftPoints([]);
  }, []);

  const drawPointerHandlers = useMemo<MapDrawPointerHandlers>(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    }),
    [handlePointerDown, handlePointerMove, handlePointerUp],
  );

  const renderSvgOverlay = useCallback(
    (transform: SvgRootTransform) => {
      rootTransformRef.current = transform;
      return (
        <g
          dangerouslySetInnerHTML={{
            __html: fieldEditOverlaySvg({
              transform,
              selectionGeometry: selection.geometry,
              objects,
              ops,
              selectedObjectIndex,
              selectedVertexIndex,
              draftPoints,
              draftKind,
            }),
          }}
        />
      );
    },
    [
      selection.geometry,
      objects,
      ops,
      selectedObjectIndex,
      selectedVertexIndex,
      draftPoints,
      draftKind,
    ],
  );

  const counts = useMemo(() => countFieldEditChanges(ops), [ops]);

  async function handlePublish() {
    if (!hasFieldEditChanges(ops)) {
      setError("Gör minst en ändring innan du publicerar");
      return;
    }
    saveLocalFieldEditOps(sessionId, ops);
    setPublishing(true);
    setError(null);
    const res = await fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publish: publishAfter, ops }),
    });
    setPublishing(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Publicering misslyckades");
      return;
    }
    clearLocalFieldEditOps(sessionId);
    const data = await res.json();
    router.push(`/maps/${mapSlug}?published=v${data.versionNumber}`);
    router.refresh();
  }

  async function handleCancel() {
    if (!confirm("Avbryt fältredigeringen? Lokala ändringar försvinner.")) return;
    clearLocalFieldEditOps(sessionId);
    const res = await fetch(`/api/maps/${mapSlug}/field-edits/${sessionId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Kunde inte avbryta");
      return;
    }
    router.push(`/maps/${mapSlug}`);
    router.refresh();
  }

  function switchTool(next: FieldEditTool) {
    setTool(next);
    setDraftPoints([]);
    setSelectedVertexIndex(null);
    if (next !== "select") setSelectedObjectIndex(null);
  }

  const localBackup = loadLocalFieldEditOps(sessionId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        {(
          [
            ["select", "Välj / redigera"],
            ["delete", "Radera"],
            ["addPoint", "Ny punkt"],
            ["addLine", "Ny linje"],
            ["addArea", "Ny yta"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => switchTool(id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tool === id
                ? id === "delete"
                  ? "bg-red-600 text-white"
                  : id === "select"
                    ? "bg-ifk-blue text-white"
                    : "bg-emerald-600 text-white"
                : "border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}

        {addKind && (
          <FieldEditSymbolPicker
            groups={symbolGroups}
            kind={addKind}
            value={symbolNumber}
            onChange={setSymbolNumber}
          />
        )}

        {(tool === "addLine" || tool === "addArea") && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={finishDraft}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
            >
              Klar ({draftPoints.length} pkt)
            </button>
            <button
              type="button"
              onClick={cancelDraft}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
            >
              Avbryt ritning
            </button>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span>
            {counts.deletes} raderade · {counts.modifies} ändrade · {counts.adds} nya
          </span>
          {syncing ? (
            <span>Synkar…</span>
          ) : syncState === "saved" ? (
            <span className="text-emerald-700">Synkad</span>
          ) : (
            <span className="text-amber-700">Sparat lokalt</span>
          )}
        </div>
      </div>

      {localBackup && syncState !== "saved" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ändringar sparas i webbläsaren tills du publicerar. Vid nätverksfel behålls arbetet lokalt.
        </p>
      )}

      {tool === "select" && (
        <p className="text-sm text-slate-600">
          Klicka ett objekt för att markera det. Dra en brytpunkt för att flytta, förlänga eller forma om
          hela objektet.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <DiffMapPanel
        previewUrl={`/api/maps/${mapSlug}/field-edits/${sessionId}/preview`}
        title={mapTitle}
        mapSlug={mapSlug}
        versionId={sessionId}
        exportEnabled={false}
        interactionMode="draw"
        drawPointerHandlers={drawPointerHandlers}
        renderSvgOverlay={renderSvgOverlay}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={publishAfter}
            onChange={(e) => setPublishAfter(e.target.checked)}
          />
          Publicera ny version direkt
        </label>
        <button
          type="button"
          disabled={publishing}
          onClick={handlePublish}
          className="rounded-lg bg-ifk-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {publishing ? "Publicerar…" : "Publicera (checka in)"}
        </button>
        <button
          type="button"
          disabled={publishing}
          onClick={handleCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Avbryt
        </button>
      </div>
    </div>
  );
}
