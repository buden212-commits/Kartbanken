"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckoutMapPanel, OVERLAY_COLORS } from "@/components/checkout-map-panel";
import {
  CheckoutSelectionType,
  checkoutStatusLabel,
  type CheckoutSelection,
} from "@/lib/checkout/types";

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
  existingCheckouts: ExistingCheckout[];
};

export function CheckoutPageClient({
  mapSlug,
  mapTitle,
  headVersionId,
  existingCheckouts,
}: Props) {
  const router = useRouter();
  const [selection, setSelection] = useState<{
    selectionType: CheckoutSelectionType;
    selection: CheckoutSelection;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.conflicts?.[0]?.message) {
        setError(data.conflicts[0].message);
      } else {
        setError(data.error ?? "Checkout misslyckades");
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
        disabled={loading}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={loading || !selection}
          onClick={handleCreateCheckout}
          className="rounded-lg bg-ifk-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Skapar checkout…" : "Checka ut område"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {existingCheckouts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-medium text-slate-900">Befintliga checkouts</h2>
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

      <p className="mt-6 text-sm text-slate-500">
        Checkout baseras på senaste version av {mapTitle}. Utcheckning .ocd genereras automatiskt.
      </p>
    </div>
  );
}
