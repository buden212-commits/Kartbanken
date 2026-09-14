import Link from "next/link";

type Props = {
  mapSlug: string;
  canCheckout: boolean;
  headVersionId: string | null;
  showReaderHint?: boolean;
};

export function CheckoutAreaCta({
  mapSlug,
  canCheckout,
  headVersionId,
  showReaderHint = false,
}: Props) {
  if (!canCheckout) {
    if (showReaderHint) {
      return (
        <p className="text-sm text-slate-500">Utcheckning kräver redaktörsbehörighet</p>
      );
    }
    return null;
  }

  if (headVersionId) {
    return (
      <div className="flex flex-wrap gap-2">
        <Link href={`/maps/${mapSlug}/checkout`} className="btn-primary">
          Checka ut område
        </Link>
        <Link href={`/maps/${mapSlug}/importera-delkarta`} className="btn-primary">
          Importera delkarta
        </Link>
      </div>
    );
  }

  return (
    <span
      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400"
      title="Ladda upp en version först"
    >
      Ladda upp en version först
    </span>
  );
}
