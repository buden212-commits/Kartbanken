"use client";

import { CheckoutMapPanel, OVERLAY_COLORS } from "@/components/checkout-map-panel";
import type { CheckoutListItem } from "@/components/checkout-list-panel";
import { CheckoutMode, checkoutModeLabel } from "@/lib/checkout/types";

type Props = {
  mapSlug: string;
  headVersionId: string;
  checkouts: CheckoutListItem[];
};

export function CheckoutOverviewMap({ mapSlug, headVersionId, checkouts }: Props) {
  const overlays = checkouts.map((checkout, index) => ({
    id: checkout.id,
    userLabel: checkout.user.name ?? checkout.user.email,
    status: checkout.status,
    selection: checkout.selection,
    color: OVERLAY_COLORS[index % OVERLAY_COLORS.length]!,
  }));

  return (
    <div className="mt-4">
      <CheckoutMapPanel
        previewUrl={`/api/maps/${mapSlug}/versions/${headVersionId}/preview`}
        mapSlug={mapSlug}
        versionId={headVersionId}
        existingCheckouts={overlays}
        disabled
      />
      <ul className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
        {checkouts.map((checkout, index) => (
          <li key={checkout.id} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm border border-slate-400"
              style={{ backgroundColor: OVERLAY_COLORS[index % OVERLAY_COLORS.length] }}
            />
            <span>
              {checkout.user.name ?? checkout.user.email}
              {checkout.mode === CheckoutMode.FIELD_EDIT && (
                <span className="text-slate-500"> · {checkoutModeLabel(checkout.mode as never)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
