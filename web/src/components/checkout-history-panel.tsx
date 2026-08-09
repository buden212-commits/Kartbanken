import Link from "next/link";
import { checkoutStatusLabel, type CheckoutStatus } from "@/lib/checkout/types";
import { formatDate } from "@/lib/format";

export type CheckoutHistoryItem = {
  id: string;
  status: string;
  createdAt: string;
  integratedAt: string | null;
  integratedVersionId: string | null;
  user: { name: string | null; email: string };
};

type Props = {
  mapSlug: string;
  items: CheckoutHistoryItem[];
};

export function CheckoutHistoryPanel({ mapSlug, items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium text-slate-900">Utcheckningshistorik</h2>
      <p className="mt-1 text-sm text-slate-600">
        Avslutade utcheckningar — integrerade och avbrutna.
      </p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Ägare</th>
              <th className="px-4 py-3 font-medium">Skapad</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Resultat</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-800">
                  {item.user.name ?? item.user.email}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDate(new Date(item.createdAt))}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {checkoutStatusLabel(item.status as CheckoutStatus)}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/maps/${mapSlug}/checkout/${item.id}`}
                    className="text-ifk-blue hover:underline"
                  >
                    Visa detaljer
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
