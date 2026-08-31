"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { DiffMapPanel, type MapDrawPointerHandlers } from "@/components/diff-map-panel";
import { CourseControlList } from "@/components/course/course-control-list";
import { CoursePdfPanel } from "@/components/course/course-pdf-panel";
import {
  CourseSymbolPanel,
  buildControlNumberMap,
  geometryForSymbol,
  TOOL_LABELS,
} from "@/components/course/course-symbol-panel";
import { CourseTextModal } from "@/components/course/course-text-modal";
import { HelpLinkIcon } from "@/components/help-link-icon";
import type { CourseSummary, EditorObject, EditorTool } from "@/lib/course/types";
import { CourseObjectType } from "@/lib/course/types";
import {
  defaultControlNumberForControl,
  ensureControlNumbers,
  findControlNumberObject,
  getControlsSorted,
  isControlNumberObject,
  migrateLegacyControlNumbers,
  resyncControlNumberIndices,
} from "@/lib/course/control-numbers";
import {
  computeCourseLengthMeters,
  computeHitTolerance,
  courseObjectsBbox,
  formatCourseLengthKm,
  hitTestTopObject,
  hitTestTopObjectForDelete,
  objectCentroid,
  renderCourseOverlaySvg,
  renumberSortOrder,
  translateGeometry,
} from "@/lib/course/geometry";
import { getCourseSymbol, IOF_LINE_WIDTH, IOF_MAGENTA } from "@/lib/course/symbols";
import { screenToSvgPoint, parseViewBoxString } from "@/lib/ocad/map-hit-test";
import { geoToSvgUserPoint, svgUserToGeoPoint, type SvgRootTransform } from "@/lib/ocad/svg-coords";

type Props = {
  mapSlug: string;
  mapTitle: string;
  headVersionId: string;
  headVersionNumber: number;
  initialCourseId?: string | null;
  canEdit: boolean;
  sessionUserId: string;
};

function newClientId(): string {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function CourseNameInput({
  value,
  disabled,
  onLiveChange,
  onDirty,
}: {
  value: string;
  disabled: boolean;
  onLiveChange: (name: string) => void;
  onDirty: () => void;
}) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setLocal(next);
    onLiveChange(next);
    onDirty();
  }

  return (
    <input
      type="text"
      value={local}
      onChange={handleChange}
      disabled={disabled}
      className="rounded border border-slate-300 px-2 py-1 text-sm"
      placeholder="Bannamn"
    />
  );
}

function detailToEditorObjects(
  objects: Array<{
    id: string;
    symbolNr: number;
    objectType: EditorObject["objectType"];
    geometry: EditorObject["geometry"];
    textContent: string | null;
    sortOrder: number;
  }>,
): EditorObject[] {
  return objects.map((o) => ({
    ...o,
    clientId: o.id,
    textContent: o.textContent,
  }));
}

export function CourseEditorClient({
  mapSlug,
  mapTitle,
  headVersionId,
  headVersionNumber,
  initialCourseId,
  canEdit,
}: Props) {
  const router = useRouter();
  const [courseId, setCourseId] = useState<string | null>(initialCourseId ?? null);
  const [courseName, setCourseName] = useState("Ny bana");
  const courseNameRef = useRef("Ny bana");
  const [isPublic, setIsPublic] = useState(false);
  const [objects, setObjects] = useState<EditorObject[]>([]);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [ghostCourseId, setGhostCourseId] = useState<string | null>(null);
  const [ghostObjects, setGhostObjects] = useState<EditorObject[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(703);
  const [tool, setTool] = useState<EditorTool>("draw");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mapScale, setMapScale] = useState(15000);
  const [focusTarget, setFocusTarget] = useState<{
    bbox: [number, number, number, number];
    centroid: [number, number];
    objectType: "point" | "line" | "area" | "text";
  } | null>(null);
  const [fitGeoBbox, setFitGeoBbox] = useState<{
    bbox: [number, number, number, number];
    requestId: number;
  } | null>(null);
  const fitRequestIdRef = useRef(0);

  const [lineDraft, setLineDraft] = useState<[number, number][]>([]);
  const [polygonDraft, setPolygonDraft] = useState<[number, number][]>([]);
  const [textModal, setTextModal] = useState<{
    clientId?: string;
    geoPoint: [number, number];
    initialText?: string;
  } | null>(null);

  const rootTransformRef = useRef<SvgRootTransform>({ tx: 0, ty: 0, flipY: false });
  const viewBoxRef = useRef<string | null>(null);
  const moveRef = useRef<{
    objectId: string;
    startGeo: [number, number];
    originalGeometry: EditorObject["geometry"];
    linkedNumberId?: string;
    linkedNumberOriginalGeometry?: EditorObject["geometry"];
  } | null>(null);
  const lastClickRef = useRef<number>(0);

  const activeGeometry = geometryForSymbol(selectedSymbol);
  const controlNumbers = useMemo(() => buildControlNumberMap(objects), [objects]);
  const courseLengthMeters = useMemo(
    () => computeCourseLengthMeters(objects, mapScale),
    [objects, mapScale],
  );
  const courseLengthLabel = formatCourseLengthKm(courseLengthMeters);

  const loadCourses = useCallback(async () => {
    const res = await fetch(`/api/maps/${mapSlug}/courses`);
    if (res.ok) {
      const data = await res.json();
      setCourses(data.courses ?? []);
    }
  }, [mapSlug]);

  const loadCourse = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/maps/${mapSlug}/courses/${id}`);
      if (!res.ok) {
        setError("Kunde inte ladda banan");
        return;
      }
      const data = await res.json();
      const loadedObjects = migrateLegacyControlNumbers(detailToEditorObjects(data.objects));
      setCourseId(data.id);
      setCourseName(data.name);
      courseNameRef.current = data.name;
      setIsPublic(data.isPublic);
      setObjects(loadedObjects);
      setDirty(false);
      setSelectedId(null);
      setLineDraft([]);
      setPolygonDraft([]);
      setError(null);

      const bbox = courseObjectsBbox(loadedObjects);
      if (bbox) {
        fitRequestIdRef.current += 1;
        setFocusTarget(null);
        setFitGeoBbox({
          bbox: [bbox.minX, bbox.minY, bbox.maxX, bbox.maxY],
          requestId: fitRequestIdRef.current,
        });
      } else {
        setFitGeoBbox(null);
      }
    },
    [mapSlug],
  );

  const loadGhost = useCallback(
    async (id: string | null) => {
      setGhostCourseId(id);
      if (!id) {
        setGhostObjects([]);
        return;
      }
      const res = await fetch(`/api/maps/${mapSlug}/courses/${id}`);
      if (res.ok) {
        const data = await res.json();
        setGhostObjects(detailToEditorObjects(data.objects));
      }
    },
    [mapSlug],
  );

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    if (initialCourseId) {
      loadCourse(initialCourseId);
    }
  }, [initialCourseId, loadCourse]);

  const addObject = useCallback((obj: Omit<EditorObject, "sortOrder">) => {
    setObjects((prev) => {
      const next = [...prev, { ...obj, sortOrder: prev.length }];
      return renumberSortOrder(next);
    });
    setDirty(true);
  }, []);

  const updateObject = useCallback((clientId: string, patch: Partial<EditorObject>) => {
    setObjects((prev) =>
      prev.map((o) => (o.clientId === clientId ? { ...o, ...patch } : o)),
    );
    setDirty(true);
  }, []);

  const removeObject = useCallback((clientId: string) => {
    setObjects((prev) => {
      const target = prev.find((o) => o.clientId === clientId);
      let next = prev.filter((o) => o.clientId !== clientId);
      if (target?.symbolNr === 703) {
        const linked = findControlNumberObject(prev, clientId);
        if (linked) {
          next = next.filter((o) => o.clientId !== linked.clientId);
        }
      }
      return ensureControlNumbers(renumberSortOrder(next));
    });
    setSelectedId(null);
    setDirty(true);
  }, []);

  const finishLine = useCallback(() => {
    if (lineDraft.length < 2) {
      setLineDraft([]);
      return;
    }
    addObject({
      clientId: newClientId(),
      id: "",
      symbolNr: selectedSymbol,
      objectType: CourseObjectType.LINE,
      geometry: { type: "LineString", coordinates: lineDraft },
      textContent: null,
    });
    setLineDraft([]);
  }, [addObject, lineDraft, selectedSymbol]);

  const finishPolygon = useCallback(() => {
    if (polygonDraft.length < 3) {
      setError("Polygon kräver minst 3 hörn");
      return;
    }
    const ring = [...polygonDraft, polygonDraft[0]!];
    addObject({
      clientId: newClientId(),
      id: "",
      symbolNr: selectedSymbol,
      objectType: CourseObjectType.AREA,
      geometry: { type: "Polygon", coordinates: [ring] },
      textContent: null,
    });
    setPolygonDraft([]);
  }, [addObject, polygonDraft, selectedSymbol]);

  const handleMapClickGeo = useCallback(
    (geo: [number, number]) => {
      if (!canEdit) return;

      if (tool === "delete") {
        const vb = parseViewBoxString(viewBoxRef.current);
        const tol = computeHitTolerance(vb?.width ?? 1000, vb?.height ?? 1000);
        const hit = hitTestTopObjectForDelete(geo, objects, tol);
        if (hit && window.confirm("Radera detta objekt?")) {
          removeObject(hit.clientId);
        }
        return;
      }

      if (tool === "move") return;

      const sym = getCourseSymbol(selectedSymbol);
      if (!sym) return;

      const geoType = geometryForSymbol(selectedSymbol);

      if (geoType === "point") {
        if (selectedSymbol === 703) {
          setObjects((prev) => {
            const synced = resyncControlNumberIndices(prev);
            const controlIndex = getControlsSorted(synced).length + 1;
            const controlId = newClientId();
            const controlObj: EditorObject = {
              clientId: controlId,
              id: "",
              symbolNr: 703,
              objectType: CourseObjectType.POINT,
              geometry: { type: "Point", coordinates: geo },
              textContent: null,
              sortOrder: synced.length,
            };
            const numberObj: EditorObject = {
              ...defaultControlNumberForControl(geo, controlIndex),
              sortOrder: synced.length + 1,
            };
            return renumberSortOrder([...synced, controlObj, numberObj]);
          });
          setDirty(true);
          return;
        }

        addObject({
          clientId: newClientId(),
          id: "",
          symbolNr: selectedSymbol,
          objectType: CourseObjectType.POINT,
          geometry: { type: "Point", coordinates: geo },
          textContent: null,
        });
        return;
      }

      if (geoType === "text") {
        setTextModal({ geoPoint: geo });
        return;
      }

      if (geoType === "line") {
        setLineDraft((prev) => [...prev, geo]);
        return;
      }

      if (geoType === "area") {
        if (polygonDraft.length >= 3) {
          const start = polygonDraft[0]!;
          const dist = Math.hypot(geo[0] - start[0], geo[1] - start[1]);
          const vb = parseViewBoxString(viewBoxRef.current);
          const tol = computeHitTolerance(vb?.width ?? 1000, vb?.height ?? 1000);
          if (dist <= tol * 2) {
            finishPolygon();
            return;
          }
        }
        setPolygonDraft((prev) => [...prev, geo]);
      }
    },
    [
      addObject,
      canEdit,
      finishPolygon,
      objects,
      polygonDraft,
      removeObject,
      selectedSymbol,
      tool,
    ],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, svg: SVGSVGElement) => {
      const pt = screenToSvgPoint(svg, e.clientX, e.clientY);
      if (!pt) return;
      const geo = svgUserToGeoPoint(pt, rootTransformRef.current);

      if (tool === "move" && canEdit) {
        const vb = parseViewBoxString(viewBoxRef.current);
        const tol = computeHitTolerance(vb?.width ?? 1000, vb?.height ?? 1000);
        const hit = hitTestTopObject(geo, objects, tol);
        if (hit) {
          setSelectedId(hit.clientId);
          const moveState: NonNullable<typeof moveRef.current> = {
            objectId: hit.clientId,
            startGeo: geo,
            originalGeometry: hit.geometry,
          };
          if (hit.symbolNr === 703) {
            const linked = findControlNumberObject(objects, hit.clientId);
            if (linked) {
              moveState.linkedNumberId = linked.clientId;
              moveState.linkedNumberOriginalGeometry = linked.geometry;
            }
          }
          moveRef.current = moveState;
        }
        return;
      }

      const now = Date.now();
      const isDoubleClick = now - lastClickRef.current < 350;
      lastClickRef.current = now;

      if (isDoubleClick && tool === "draw" && geometryForSymbol(selectedSymbol) === "line") {
        finishLine();
        return;
      }

      if (isDoubleClick && tool === "draw") {
        const vb = parseViewBoxString(viewBoxRef.current);
        const tol = computeHitTolerance(vb?.width ?? 1000, vb?.height ?? 1000);
        const hit = hitTestTopObject(geo, objects, tol);
        if (hit?.objectType === CourseObjectType.TEXT && !isControlNumberObject(hit)) {
          setTextModal({
            clientId: hit.clientId,
            geoPoint: objectCentroid(hit.geometry),
            initialText: hit.textContent ?? "",
          });
        }
        return;
      }

      handleMapClickGeo(geo);
    },
    [canEdit, finishLine, handleMapClickGeo, objects, selectedSymbol, tool],
  );

  const handlePointerMove = useCallback(
    (_e: React.PointerEvent, svg: SVGSVGElement) => {
      const move = moveRef.current;
      if (!move || tool !== "move") return;
      const pt = screenToSvgPoint(svg, _e.clientX, _e.clientY);
      if (!pt) return;
      const geo = svgUserToGeoPoint(pt, rootTransformRef.current);
      const dx = geo[0] - move.startGeo[0];
      const dy = geo[1] - move.startGeo[1];
      const newGeometry = translateGeometry(move.originalGeometry, dx, dy);
      const linkedGeometry =
        move.linkedNumberId && move.linkedNumberOriginalGeometry
          ? translateGeometry(move.linkedNumberOriginalGeometry, dx, dy)
          : null;

      setObjects((prev) =>
        prev.map((o) => {
          if (o.clientId === move.objectId) {
            return { ...o, geometry: newGeometry };
          }
          if (linkedGeometry && o.clientId === move.linkedNumberId) {
            return { ...o, geometry: linkedGeometry };
          }
          return o;
        }),
      );
      setDirty(true);
    },
    [tool],
  );

  const handlePointerUp = useCallback(() => {
    moveRef.current = null;
  }, []);

  const drawPointerHandlers = useMemo<MapDrawPointerHandlers>(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    }),
    [handlePointerDown, handlePointerMove, handlePointerUp],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLineDraft([]);
        setPolygonDraft([]);
        setTextModal(null);
      }
      if (e.key === "Enter" && tool === "draw") {
        if (geometryForSymbol(selectedSymbol) === "line") finishLine();
        if (geometryForSymbol(selectedSymbol) === "area") finishPolygon();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && canEdit) {
        if (window.confirm("Radera valt objekt?")) removeObject(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, finishLine, finishPolygon, removeObject, selectedId, selectedSymbol, tool]);

  async function handleSave() {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      let id = courseId;

      if (!id) {
        const createRes = await fetch(`/api/maps/${mapSlug}/courses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: courseNameRef.current.trim() || "Ny bana", isPublic }),
        });
        if (!createRes.ok) {
          const data = await createRes.json().catch(() => ({}));
          throw new Error(data.error ?? "Kunde inte skapa bana");
        }
        const created = await createRes.json();
        id = created.id;
        setCourseId(id);
      } else {
        const patchRes = await fetch(`/api/maps/${mapSlug}/courses/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: courseNameRef.current.trim(), isPublic }),
        });
        if (!patchRes.ok) {
          const data = await patchRes.json().catch(() => ({}));
          throw new Error(data.error ?? "Kunde inte uppdatera bana");
        }
      }

      const payload = {
        objects: objects.map((o) => ({
          symbolNr: o.symbolNr,
          objectType: o.objectType,
          geometry: o.geometry,
          textContent: o.textContent,
          sortOrder: o.sortOrder,
        })),
      };

      const objRes = await fetch(`/api/maps/${mapSlug}/courses/${id}/objects`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!objRes.ok) {
        const data = await objRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Kunde inte spara objekt");
      }

      const saved = await objRes.json();
      setObjects(migrateLegacyControlNumbers(detailToEditorObjects(saved.objects)));
      setDirty(false);
      setSuccess("Banan sparades");
      await loadCourses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sparning misslyckades");
    } finally {
      setSaving(false);
    }
  }

  function handleNewCourse() {
    if (dirty && !window.confirm("Osparade ändringar går förlorade. Fortsätta?")) return;
    setCourseId(null);
    setCourseName("Ny bana");
    courseNameRef.current = "Ny bana";
    setIsPublic(false);
    setObjects([]);
    setDirty(false);
    setSelectedId(null);
  }

  async function handleDeleteCourse() {
    if (!courseId || !canEdit) return;
    if (!window.confirm("Är du säker?")) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/maps/${mapSlug}/courses/${courseId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Radering misslyckades");
      }
      setCourseId(null);
      setCourseName("Ny bana");
      courseNameRef.current = "Ny bana";
      setIsPublic(false);
      setObjects([]);
      setDirty(false);
      setSelectedId(null);
      setLineDraft([]);
      setPolygonDraft([]);
      setSuccess("Banan raderades");
      await loadCourses();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Radering misslyckades");
    } finally {
      setDeleting(false);
    }
  }

  function focusOnObject(clientId: string) {
    const obj = objects.find((o) => o.clientId === clientId);
    if (!obj) return;
    const centroid = objectCentroid(obj.geometry);
    const type =
      obj.objectType === CourseObjectType.POINT
        ? "point"
        : obj.objectType === CourseObjectType.LINE
          ? "line"
          : obj.objectType === CourseObjectType.AREA
            ? "area"
            : "text";
    setFocusTarget({
      centroid,
      bbox: [centroid[0] - 20, centroid[1] - 20, centroid[0] + 20, centroid[1] + 20],
      objectType: type,
    });
  }

  const renderSvgOverlay = useCallback(
    (rootTransform: SvgRootTransform) => {
      rootTransformRef.current = rootTransform;

      const draftLinePoints =
        lineDraft.length > 0
          ? lineDraft
              .map((c) => {
                const [sx, sy] = geoToSvgUserPoint(c, rootTransform);
                return `${sx},${sy}`;
              })
              .join(" ")
          : null;

      const draftPolyPoints =
        polygonDraft.length > 0
          ? polygonDraft
              .map((c) => {
                const [sx, sy] = geoToSvgUserPoint(c, rootTransform);
                return `${sx},${sy}`;
              })
              .join(" ")
          : null;

      const ghostMarkup = renderCourseOverlaySvg(ghostObjects, rootTransform, {
        opacity: 0.45,
      });

      const activeMarkup = renderCourseOverlaySvg(objects, rootTransform, {
        selectedId,
      });

      return (
        <g data-course-overlay="true">
          {ghostObjects.length > 0 && (
            <g opacity={0.5} dangerouslySetInnerHTML={{ __html: ghostMarkup }} />
          )}
          <g dangerouslySetInnerHTML={{ __html: activeMarkup }} />
          {draftLinePoints && (
            <polyline
              points={draftLinePoints}
              fill="none"
              stroke={IOF_MAGENTA}
              strokeWidth={IOF_LINE_WIDTH}
              strokeDasharray={`${IOF_LINE_WIDTH * 2} ${IOF_LINE_WIDTH}`}
              opacity={0.7}
            />
          )}
          {draftPolyPoints && (
            <polygon
              points={draftPolyPoints}
              fill={IOF_MAGENTA}
              fillOpacity={0.15}
              stroke={IOF_MAGENTA}
              strokeWidth={IOF_LINE_WIDTH}
              opacity={0.7}
            />
          )}
        </g>
      );
    },
    [ghostObjects, lineDraft, objects, polygonDraft, selectedId],
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-slate-800">Lägg bana</span>
      <HelpLinkIcon section="bana" />
      <span className="text-xs text-slate-500">· Publicerad version v{headVersionNumber}</span>
      <span className="text-xs font-medium text-slate-700">Banlängd: {courseLengthLabel}</span>
      {(["draw", "move", "delete"] as EditorTool[]).map((t) => (
        <button
          key={t}
          type="button"
          disabled={!canEdit}
          onClick={() => setTool(t)}
          className={`rounded-md px-2 py-1 text-xs ${
            tool === t
              ? "bg-ifk-blue text-white"
              : "border border-slate-300 text-slate-700 hover:border-ifk-blue"
          } disabled:opacity-50`}
        >
          {TOOL_LABELS[t]}
        </button>
      ))}
      {geometryForSymbol(selectedSymbol) === "line" && lineDraft.length > 0 && (
        <button
          type="button"
          onClick={finishLine}
          className="rounded-md border border-teal-600 px-2 py-1 text-xs text-teal-700"
        >
          Avsluta linje
        </button>
      )}
      {geometryForSymbol(selectedSymbol) === "area" && polygonDraft.length >= 3 && (
        <button
          type="button"
          onClick={finishPolygon}
          className="rounded-md border border-amber-600 px-2 py-1 text-xs text-amber-700"
        >
          Avsluta yta
        </button>
      )}
    </div>
  );

  const saveBar = (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
      <CourseNameInput
        value={courseName}
        disabled={!canEdit}
        onLiveChange={(name) => {
          courseNameRef.current = name;
        }}
        onDirty={() => setDirty(true)}
      />
      <label className="flex items-center gap-1 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => {
            setIsPublic(e.target.checked);
            setDirty(true);
          }}
          disabled={!canEdit}
        />
        Gör publik
      </label>
      <select
        value={courseId ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          if (!id) return;
          if (dirty && !window.confirm("Osparade ändringar går förlorade. Fortsätta?")) return;
          loadCourse(id);
        }}
        className="rounded border border-slate-300 px-2 py-1 text-xs"
      >
        <option value="">Öppna bana…</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} {c.isPublic ? "(publik)" : ""}
          </option>
        ))}
      </select>
      <select
        value={ghostCourseId ?? ""}
        onChange={(e) => loadGhost(e.target.value || null)}
        className="rounded border border-slate-300 px-2 py-1 text-xs"
      >
        <option value="">Skuggbana: av</option>
        {courses
          .filter((c) => c.id !== courseId)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
      {canEdit && (
        <>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-ifk-blue px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "Sparar…" : dirty ? "Spara *" : "Spara"}
          </button>
          <button
            type="button"
            onClick={handleNewCourse}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700"
          >
            Ny bana
          </button>
          {courseId && (
            <button
              type="button"
              onClick={handleDeleteCourse}
              disabled={deleting}
              className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? "Raderar…" : "Radera bana"}
            </button>
          )}
        </>
      )}
      <Link
        href={`/maps/${mapSlug}`}
        className="ml-auto text-xs text-slate-500 hover:text-ifk-blue"
      >
        ← {mapTitle}
      </Link>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col bg-white">
      {saveBar}
      {(error || success) && (
        <div
          className={`px-3 py-1.5 text-xs ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
        >
          {error ?? success}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <DiffMapPanel
            previewUrl={`/api/maps/${mapSlug}/versions/${headVersionId}/preview`}
            title="Lägg bana"
            mapSlug={mapSlug}
            versionId={headVersionId}
            basemap="tiles"
            fullscreen
            exportEnabled={false}
            showLayerPanel={false}
            interactionMode={canEdit && tool !== "move" ? "draw" : tool === "move" ? "draw" : "navigate"}
            drawPointerHandlers={canEdit ? drawPointerHandlers : undefined}
            renderSvgOverlay={renderSvgOverlay}
            headerContent={toolbar}
            focusTarget={focusTarget}
            onClearFocus={() => setFocusTarget(null)}
            onOcadMapScale={setMapScale}
            fitGeoBbox={fitGeoBbox}
          />
          <CoursePdfPanel
            mapSlug={mapSlug}
            courses={courses}
            activeCourseId={courseId}
            disabled={courses.length === 0}
          />
        </div>
        <CourseControlList
          objects={objects}
          controlNumbers={controlNumbers}
          selectedId={selectedId}
          courseLengthLabel={courseLengthLabel}
          onSelect={setSelectedId}
          onFocus={focusOnObject}
        />
        <CourseSymbolPanel
          selectedNr={selectedSymbol}
          onSelect={setSelectedSymbol}
        />
      </div>

      <CourseTextModal
        open={textModal != null}
        initialText={textModal?.initialText}
        title={textModal?.clientId ? "Redigera text" : "Ange text"}
        onCancel={() => setTextModal(null)}
        onConfirm={(text) => {
          if (!textModal) return;
          if (textModal.clientId) {
            updateObject(textModal.clientId, { textContent: text });
          } else {
            addObject({
              clientId: newClientId(),
              id: "",
              symbolNr: selectedSymbol,
              objectType: CourseObjectType.TEXT,
              geometry: { type: "Point", coordinates: textModal.geoPoint },
              textContent: text,
            });
          }
          setTextModal(null);
        }}
      />
    </div>
  );
}
