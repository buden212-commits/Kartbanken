"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckoutMapPanel, OVERLAY_COLORS } from "@/components/checkout-map-panel";
import {
  CheckoutSelectionType,
  checkoutStatusLabel,
  type CheckoutSelection,
} from "@/lib/checkout/types";
import {
  defaultOcadExportVersion,
  normalizeSourceVersion,
  type OcadExportVersion,
} from "@/lib/ocad/ocad-export-shared";

type ExistingCheckout = {
  id: string;
  user: { name: string | null; email: string };
  status: string;
  selectionType: string;
  selection: CheckoutSelection;
  createdAt: string;
};

type Props = {
  mapSlug: string;
  mapTitle: string;
  headVersionId: string;
  sourceOcadVersion: number;
  existingCheckouts: ExistingCheckout[];
};

export function CheckoutPageClient({
  mapSlug,
  mapTitle,
  headVersionId,
  sourceOcadVersion,
  existingCheckouts,
}: Props) {
  const router = useRouter();
  const [selection, setSelection] = useState<{
    selectionType: CheckoutSelectionType;
    selection: CheckoutSelection;
  } | null>(null);
  const [ocadVersion, setOcadVersion] = useState<OcadExportVersion>(() =>
    defaultOcadExportVersion(sourceOcadVersion),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceLabel =
    normalizeSourceVersion(sourceOcadVersion) === 18 ? "OCAD 2018" : `OCAD ${normalizeSourceVersion(sourceOcadVersion)}`;

  const overlays = existingCheckouts.map((checkout, index) => ({
    id: checkout.id,
    userLabel: checkout.user.name ?? checkout.user.email,
    status: checkout.status,
    selection: checkout.selection,
    color: OVERLAY_COLORS[index % OVERLAY_COLORS.length]!,
  }));

  async function handleCreateCheckout() {
    if (!selection) {
      setError("Rita och bekräfta ett område först");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await fetch(`/api/maps/${mapSlug}/checkouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectionType: selection.selectionType,
        selection: selection.selection,
        ocadVersion,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.conflicts?.[0]?.message) {
        setError(data.conflicts[0].message);
      } else {
        setError(data.error ?? "Utcheckning misslyckades");
      }
      return;
    }

    const checkout = await res.json();
    router.push(`/maps/${mapSlug}/checkout/${checkout.id}`);
  }

  return (
    <div>
      <CheckoutMapPanel
        previewUrl={`/api/maps/${mapSlug}/versions/${headVersionId}/preview`}
        mapSlug={mapSlug}
        versionId={headVersionId}
        existingCheckouts={overlays}
        onSelectionConfirmed={setSelection}
        onCreateCheckout={handleCreateCheckout}
        createLoading={loading}
        createError={error}
        disabled={loading}
        ocadVersion={ocadVersion}
        onOcadVersionChange={setOcadVersion}
        sourceOcadVersionLabel={sourceLabel}
      />

      {existingCheckouts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-medium text-slate-900">Befintliga utcheckningar</h2>
          <ul className="mt-3 space-y-2">
            {existingCheckouts.map((checkout) => (
              <li
                key={checkout.id}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-800">
                  {checkout.user.name ?? checkout.user.email}
                </span>
                <span className="text-slate-500"> · {checkoutStatusLabel(checkout.status as never)}</span>
                <span className="text-slate-500">
                  {" "}
                  · {checkout.selection.objectIds.length} objekt
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Kartfilen är {sourceLabel}. Välj samma format som din OCAD-installation — t.ex. OCAD 12 om
        du inte har OCAD 2018.
      </p>
    </div>
  );
}
