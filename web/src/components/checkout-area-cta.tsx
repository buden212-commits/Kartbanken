import Link from "next/link";

const buttonClass =
  "rounded-lg border border-ifk-blue/30 bg-ifk-blue-pale px-4 py-2 text-sm font-medium text-ifk-blue transition hover:border-ifk-blue hover:bg-ifk-blue-muted";

const disabledClass =
  "rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400";

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
        <p className="text-sm text-slate-500">Checkout kräver redaktörsbehörighet</p>
      );
    }
    return null;
  }

  if (headVersionId) {
    return (
      <Link href={`/maps/${mapSlug}/checkout`} className={buttonClass}>
        Checka ut område
      </Link>
    );
  }

  return (
    <span className={disabledClass} title="Ladda upp en version först">
      Ladda upp en version först
    </span>
  );
}
