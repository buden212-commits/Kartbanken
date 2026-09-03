"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckoutAreaCta } from "@/components/checkout-area-cta";
import {
  CheckoutMode,
  checkoutModeLabel,
  checkoutStatusLabel,
  type CheckoutSelection,
} from "@/lib/checkout/types";
import { formatDate } from "@/lib/format";

export type CheckoutListItem = {
  id: string;
  mode: string;
  status: string;
  selection: CheckoutSelection;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
};

type Props = {
  mapSlug: string;
  checkouts: CheckoutListItem[];
  sessionUserId: string;
  isAdmin: boolean;
  canCheckout: boolean;
  headVersionId: string | null;
};

export function CheckoutListPanel({
  mapSlug,
  checkouts,
  sessionUserId,
  isAdmin,
  canCheckout,
  headVersionId,
}: Props) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function cancelCheckout(checkoutId: string, mode: string) {
    const reason = window.prompt("Anledning (valfritt):") ?? undefined;
    setLoadingId(checkoutId);
    const endpoint =
      mode === CheckoutMode.FIELD_EDIT
        ? `/api/maps/${mapSlug}/field-edits/${checkoutId}`
        : `/api/maps/${mapSlug}/checkouts/${checkoutId}`;
    const res = await fetch(endpoint, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setLoadingId(null);
    if (res.ok) router.refresh();
  }

  return (
    <section className="mt-10" id="utcheckningar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-slate-900">
          Aktiva utcheckningar ({checkouts.length})
        </h2>
        <CheckoutAreaCta
          mapSlug={mapSlug}
          canCheckout={canCheckout}
          headVersionId={headVersionId}
          showReaderHint
        />
      </div>

      {checkouts.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Inga aktiva utcheckningar eller fältredigeringar.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Typ</th>
                <th className="px-4 py-3 font-medium">Ägare</th>
                <th className="px-4 py-3 font-medium">Skapad</th>
                <th className="px-4 py-3 font-medium">Objekt</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {checkouts.map((checkout) => {
                const isOwner = checkout.user.id === sessionUserId;
                const isFieldEdit = checkout.mode === CheckoutMode.FIELD_EDIT;
                const canOpen = isOwner || isAdmin;
                const openHref = isFieldEdit
                  ? `/maps/${mapSlug}/field-edit/${checkout.id}`
                  : `/maps/${mapSlug}/checkout/${checkout.id}`;
                return (
                  <tr key={checkout.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-600">
                      {checkoutModeLabel(checkout.mode as never)}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {checkout.user.name ?? checkout.user.email}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(new Date(checkout.createdAt))}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {checkout.selection.objectIds.length}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {checkoutStatusLabel(checkout.status as never)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {canOpen && (
                          <Link href={openHref} className="text-ifk-blue hover:underline">
                            {isFieldEdit ? "Fortsätt" : "Öppna"}
                          </Link>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            disabled={loadingId === checkout.id}
                            onClick={() => cancelCheckout(checkout.id, checkout.mode)}
                            className="text-red-600 hover:underline disabled:opacity-50"
                          >
                            Avbryt
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
