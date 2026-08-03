import type { IntegrationWarning } from "@/lib/checkout/integration-warnings";

type Props = {
  warnings: IntegrationWarning[];
  versionNumber?: number;
};

export function IntegrationWarningsPanel({ warnings, versionNumber }: Props) {
  if (warnings.length === 0) return null;

  return (
    <section className="card border-amber-200 bg-amber-50/60">
      <h2 className="text-lg font-medium text-amber-950">
        {versionNumber != null
          ? `Integrerad som v${versionNumber} — manuell uppföljning krävs`
          : "Manuell uppföljning krävs efter integration"}
      </h2>
      <p className="mt-2 text-sm text-amber-900">
        Följande ändringar kunde inte appliceras automatiskt i aktuella versionen. Granska dem i OCAD
        Desktop.
      </p>

      <div className="mt-4 space-y-4">
        {warnings.map((warning, index) => (
          <article
            key={`${warning.code}-${index}`}
            className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm"
          >
            <h3 className="font-medium text-slate-900">{warning.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{warning.reason}</p>

            {warning.objects.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                {warning.objects.map((obj) => (
                  <li
                    key={`${warning.code}-${obj.objectIndex}-${obj.symbolNumber}`}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2"
                  >
                    <span className="font-medium text-slate-900">
                      {obj.symbolNumber} {obj.symbolName}
                    </span>
                    <span className="text-slate-500">
                      {obj.typeLabel} · {obj.location}
                    </span>
                    <span className="text-xs text-slate-400">index {obj.objectIndex}</span>
                    {obj.text && (
                      <span className="w-full text-slate-600">Text: «{obj.text}»</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
