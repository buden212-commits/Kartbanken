"use client";



import { useCallback, useMemo, useRef, useState } from "react";

import {

  CheckoutSelectionType,

  type CheckoutSelection,

  type CheckoutSelectionGeometry,

  type Bbox,

} from "@/lib/checkout/types";

import { bboxFromGeometry } from "@/lib/checkout/overlap";

import {

  geoBboxToSvgUser,

  geoToSvgUserPoint,

  svgUserToGeoPoint,

  type SvgRootTransform,

} from "@/lib/ocad/svg-coords";

import { screenToSvgPoint } from "@/lib/ocad/map-hit-test";

import { DiffMapPanel, type MapDrawPointerHandlers } from "@/components/diff-map-panel";
import { OCAD_EXPORT_VERSIONS, type OcadExportVersion } from "@/lib/ocad/ocad-export-shared";



export type CheckoutOverlay = {

  id: string;

  userLabel: string;

  status: string;

  selection: CheckoutSelection;

  color: string;

};



type DrawTool = "rectangle" | "polygon";



type Props = {

  previewUrl: string;

  mapSlug: string;

  versionId: string;

  existingCheckouts?: CheckoutOverlay[];

  onSelectionConfirmed?: (selection: {

    selectionType: CheckoutSelectionType;

    selection: CheckoutSelection;

  }) => void;

  onCreateCheckout?: () => void;

  createLoading?: boolean;

  createError?: string | null;

  disabled?: boolean;

  ocadVersion?: OcadExportVersion;

  onOcadVersionChange?: (version: OcadExportVersion) => void;

  sourceOcadVersionLabel?: string;

};



const OVERLAY_COLORS = [

  "rgba(239, 68, 68, 0.25)",

  "rgba(249, 115, 22, 0.25)",

  "rgba(234, 179, 8, 0.25)",

  "rgba(34, 197, 94, 0.25)",

  "rgba(59, 130, 246, 0.25)",

  "rgba(168, 85, 247, 0.25)",

];



function geometryToSvgPoints(

  geometry: CheckoutSelectionGeometry,

  transform: SvgRootTransform,

): string {

  if (geometry.type === CheckoutSelectionType.BBOX) {

    const [minX, minY, maxX, maxY] = geoBboxToSvgUser(

      [geometry.bbox.minX, geometry.bbox.minY, geometry.bbox.maxX, geometry.bbox.maxY],

      transform,

    );

    return `${minX},${minY} ${maxX},${minY} ${maxX},${maxY} ${minX},${maxY}`;

  }



  return geometry.ring

    .map(([x, y]) => {

      const [sx, sy] = geoToSvgUserPoint([x, y], transform);

      return `${sx},${sy}`;

    })

    .join(" ");

}



function bboxFromSvgDrag(

  start: [number, number],

  end: [number, number],

  transform: SvgRootTransform,

): Bbox {

  const [g1x, g1y] = svgUserToGeoPoint(start, transform);

  const [g2x, g2y] = svgUserToGeoPoint(end, transform);

  return {

    minX: Math.min(g1x, g2x),

    minY: Math.min(g1y, g2y),

    maxX: Math.max(g1x, g2x),

    maxY: Math.max(g1y, g2y),

  };

}



export function CheckoutMapPanel({

  previewUrl,

  mapSlug,

  versionId,

  existingCheckouts = [],

  onSelectionConfirmed,

  onCreateCheckout,

  createLoading = false,

  createError = null,

  disabled = false,

  ocadVersion = 12,

  onOcadVersionChange,

  sourceOcadVersionLabel,

}: Props) {

  const [tool, setTool] = useState<DrawTool>("rectangle");

  const [draftBbox, setDraftBbox] = useState<Bbox | null>(null);

  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);

  const [confirmedSelection, setConfirmedSelection] = useState<{

    selectionType: CheckoutSelectionType;

    selection: CheckoutSelection;

  } | null>(null);

  const [error, setError] = useState<string | null>(null);



  const rootTransformRef = useRef<SvgRootTransform>({ tx: 0, ty: 0, flipY: false });

  const dragRef = useRef<{ start: [number, number]; current: [number, number] } | null>(null);



  const resetDraft = useCallback(() => {

    setDraftBbox(null);

    setPolygonPoints([]);

    setConfirmedSelection(null);

    dragRef.current = null;

  }, []);



  const finalizeSelection = useCallback(

    (geometry: CheckoutSelectionGeometry) => {

      const bbox = bboxFromGeometry(geometry);

      if (bbox.maxX - bbox.minX < 1 || bbox.maxY - bbox.minY < 1) {

        setError("Området är för litet");

        return;

      }



      const payload = {

        selectionType:

          geometry.type === CheckoutSelectionType.BBOX

            ? CheckoutSelectionType.BBOX

            : CheckoutSelectionType.POLYGON,

        selection: {

          geometry,

          objectIds: [] as string[],

        },

      };

      setConfirmedSelection(payload);

      setError(null);

      onSelectionConfirmed?.(payload);

    },

    [onSelectionConfirmed],

  );



  const handlePointerDown = useCallback(

    (e: React.PointerEvent, svg: SVGSVGElement) => {

      if (disabled) return;

      const pt = screenToSvgPoint(svg, e.clientX, e.clientY);

      if (!pt) return;



      if (tool === "rectangle") {

        dragRef.current = { start: pt, current: pt };

        setDraftBbox(null);

        setPolygonPoints([]);

      } else {

        const [gx, gy] = svgUserToGeoPoint(pt, rootTransformRef.current);

        setPolygonPoints((prev) => [...prev, [gx, gy]]);

        setDraftBbox(null);

      }

    },

    [disabled, tool],

  );



  const handlePointerMove = useCallback(

    (e: React.PointerEvent, svg: SVGSVGElement) => {

      if (!dragRef.current || tool !== "rectangle") return;

      const pt = screenToSvgPoint(svg, e.clientX, e.clientY);

      if (!pt) return;

      dragRef.current.current = pt;

      setDraftBbox(bboxFromSvgDrag(dragRef.current.start, pt, rootTransformRef.current));

    },

    [tool],

  );



  const handlePointerUp = useCallback(

    (_e: React.PointerEvent, _svg: SVGSVGElement) => {

      if (!dragRef.current || tool !== "rectangle") return;

      const bbox = bboxFromSvgDrag(

        dragRef.current.start,

        dragRef.current.current,

        rootTransformRef.current,

      );

      dragRef.current = null;

      setDraftBbox(bbox);

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



  const confirmDraft = useCallback(() => {

    if (tool === "rectangle" && draftBbox) {

      finalizeSelection({ type: CheckoutSelectionType.BBOX, bbox: draftBbox });

      return;

    }



    if (tool === "polygon" && polygonPoints.length >= 3) {

      finalizeSelection({ type: CheckoutSelectionType.POLYGON, ring: polygonPoints });

    }

  }, [draftBbox, finalizeSelection, polygonPoints, tool]);



  const draftGeometry = useMemo((): CheckoutSelectionGeometry | null => {

    if (draftBbox) {

      return { type: CheckoutSelectionType.BBOX, bbox: draftBbox };

    }

    if (polygonPoints.length >= 2) {

      return { type: CheckoutSelectionType.POLYGON, ring: polygonPoints };

    }

    return null;

  }, [draftBbox, polygonPoints]);



  const renderSvgOverlay = useCallback(

    (rootTransform: SvgRootTransform) => {

      rootTransformRef.current = rootTransform;



      return (

        <>

          {existingCheckouts.map((checkout, index) => (

            <polygon

              key={checkout.id}

              points={geometryToSvgPoints(checkout.selection.geometry, rootTransform)}

              fill={checkout.color || OVERLAY_COLORS[index % OVERLAY_COLORS.length]}

              stroke="#334155"

              strokeWidth={1}

              pointerEvents="none"

            />

          ))}



          {draftGeometry && (

            <polygon

              points={geometryToSvgPoints(draftGeometry, rootTransform)}

              fill="rgba(0, 76, 136, 0.2)"

              stroke="#004C88"

              strokeWidth={2}

              strokeDasharray="6 4"

              pointerEvents="none"

            />

          )}



          {confirmedSelection && (

            <polygon

              points={geometryToSvgPoints(confirmedSelection.selection.geometry, rootTransform)}

              fill="rgba(16, 185, 129, 0.25)"

              stroke="#059669"

              strokeWidth={2}

              pointerEvents="none"

            />

          )}

        </>

      );

    },

    [confirmedSelection, draftGeometry, existingCheckouts],

  );



  const drawToolbar = (

    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">

      <span className="text-sm font-medium text-slate-700">Verktyg:</span>

      <button

        type="button"

        disabled={disabled}

        onClick={() => {

          setTool("rectangle");

          resetDraft();

        }}

        className={`rounded-md px-3 py-1.5 text-sm ${

          tool === "rectangle"

            ? "bg-ifk-blue text-white"

            : "border border-slate-300 text-slate-700"

        }`}

      >

        Rektangel

      </button>

      <button

        type="button"

        disabled={disabled}

        onClick={() => {

          setTool("polygon");

          resetDraft();

        }}

        className={`rounded-md px-3 py-1.5 text-sm ${

          tool === "polygon"

            ? "bg-ifk-blue text-white"

            : "border border-slate-300 text-slate-700"

        }`}

      >

        Polygon

      </button>

      <button

        type="button"

        disabled={disabled}

        onClick={resetDraft}

        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"

      >

        Rensa

      </button>

      {!disabled && (

        <button

          type="button"

          disabled={tool === "rectangle" ? !draftBbox : polygonPoints.length < 3}

          onClick={confirmDraft}

          className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"

        >

          Bekräfta område

        </button>

      )}

    </div>

  );



  const statusMessages = (

    <>

      <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">

        {disabled

          ? "Färgade ytor visar befintliga utcheckningsområden."

          : tool === "rectangle"

            ? "Dra en rektangel på kartan. Använd +/− eller scrollhjul för att zooma."

            : "Klicka hörn (minst 3), klicka Bekräfta område."}

      </p>



      {error && (

        <p className="border-b border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>

      )}



      {createError && (

        <p className="border-b border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">{createError}</p>

      )}



      {confirmedSelection && (

        <div className="space-y-2 border-b border-emerald-100 bg-emerald-50 px-3 py-2">

          <p className="text-sm text-emerald-800">

            Område valt (

            {confirmedSelection.selectionType === CheckoutSelectionType.BBOX

              ? "rektangel"

              : "polygon"}

            ).

          </p>

          {onCreateCheckout && onOcadVersionChange && (

            <div className="flex flex-wrap items-end gap-3">

              <div>

                <label htmlFor="checkout-ocad-version" className="text-xs font-medium text-slate-700">

                  OCAD-format för utcheckning

                </label>

                <select

                  id="checkout-ocad-version"

                  value={ocadVersion}

                  onChange={(e) =>

                    onOcadVersionChange(Number(e.target.value) as OcadExportVersion)

                  }

                  className="form-select mt-1 min-w-[140px]"

                >

                  {OCAD_EXPORT_VERSIONS.map((opt) => (

                    <option key={opt.value} value={opt.value}>

                      {opt.label}

                    </option>

                  ))}

                </select>

                {sourceOcadVersionLabel && (

                  <p className="mt-1 text-xs text-slate-500">

                    Källkarta: {sourceOcadVersionLabel}

                  </p>

                )}

              </div>

              <button

                type="button"

                disabled={disabled || createLoading}

                onClick={onCreateCheckout}

                className="shrink-0 rounded-md bg-ifk-blue px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"

              >

                {createLoading ? "Skapar utcheckning…" : "Checka ut område"}

              </button>

            </div>

          )}

        </div>

      )}

    </>

  );



  return (

    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

      {!disabled && (

        <>

          {drawToolbar}

          {statusMessages}

        </>

      )}

      {disabled && statusMessages}

      <DiffMapPanel

        previewUrl={previewUrl}

        title="Karta"

        mapSlug={mapSlug}

        versionId={versionId}

        basemap="tiles"

        exportEnabled={false}

        headerContent={<span className="text-sm font-medium text-slate-800">Karta</span>}

        renderSvgOverlay={renderSvgOverlay}

        interactionMode={disabled ? "navigate" : "draw"}

        drawPointerHandlers={disabled ? undefined : drawPointerHandlers}

        unboxed

      />

    </div>

  );

}



export { OVERLAY_COLORS };


