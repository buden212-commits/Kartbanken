"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckoutMapPanel, OVERLAY_COLORS } from "@/components/checkout-map-panel";
import {
  formatAreaKm2,
  MAX_FIELD_EDIT_AREA_M2,
  selectionAreaM2FromPartial,
  validateFieldEditArea,
} from "@/lib/checkout/selection-area";
import {
  CheckoutSelectionType,
  checkoutStatusLabel,
  type CheckoutSelection,
} from "@/lib/checkout/types";

type ExistingLock = {
  id: string;
  user: { name: string | null; email: string };
  status: string;
  selectionType: string;
  selection: CheckoutSelection;
  mode?: string;
  createdAt: string;
};

type Props = {
  mapSlug: string;
  mapTitle: string;
  headVersionId: string;
  mapScale: number;
  existingLocks: ExistingLock[];
};

export function FieldEditCreateClient({
  mapSlug,
  headVersionId,
  mapScale,
  existingLocks,
}: Props) {
  const router = useRouter();
  const [selection, setSelection] = useState<{
    selectionType: CheckoutSelectionType;
    selection: CheckoutSelection;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overlays = existingLocks.map((lock, index) => ({
    id: lock.id,
    userLabel: lock.user.name ?? lock.user.email,
    status: lock.status,
    selection: lock.selection,
    color: OVERLAY_COLORS[index % OVERLAY_COLORS.length]!,
  }));

  const areaHint = useMemo(() => {
    if (!selection) return null;
    const area = selectionAreaM2FromPartial(selection.selection.geometry, mapScale);
    const km2 = formatAreaKm2(area);
    const overLimit = area > MAX_FIELD_EDIT_AREA_M2;
    return overLimit
      ? `Yta ${km2} km² — max 1 km²`
      : `Yta ${km2} km² (max 1 km²)`;
  }, [selection, mapScale]);

  async function handleCreate() {
    if (!selection) {
      setError("Rita och bekräfta ett område först");
      return;
    }

    const areaError = validateFieldEditArea(selection.selection.geometry, mapScale);
    if (areaError) {
      setError(areaError);
      return;
    }

    setLoading(true);
    setError(null);

    const res = await fetch(`/api/maps/${mapSlug}/field-edits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectionType: selection.selectionType,
        selection: selection.selection,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.conflicts?.[0]?.message) {
        setError(data.conflicts[0].message);
      } else {
        setError(data.error ?? "Kunde inte starta fältredigering");
      }
      return;
    }

    const session = await res.json();
    router.push(`/maps/${mapSlug}/field-edit/${session.id}`);
  }

  return (
    <div>
      <CheckoutMapPanel
        previewUrl={`/api/maps/${mapSlug}/versions/${headVersionId}/preview`}
        mapSlug={mapSlug}
        versionId={headVersionId}
        existingCheckouts={overlays}
        onSelectionConfirmed={setSelection}
        onCreateCheckout={handleCreate}
        createLoading={loading}
        createError={error}
        disabled={loading}
        hideOcadVersion
        createButtonLabel="Starta fältredigering"
        createLoadingLabel="Startar…"
        areaHint={areaHint}
      />

      {existingLocks.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-medium text-slate-900">Låsta områden</h2>
          <ul className="mt-3 space-y-2">
            {existingLocks.map((lock) => (
              <li
                key={lock.id}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              >
                {lock.user.name ?? lock.user.email} —{" "}
                {lock.mode === "FIELD_EDIT" ? "Fältredigering" : "Utcheckning"} (
                {checkoutStatusLabel(lock.status as never)})
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
