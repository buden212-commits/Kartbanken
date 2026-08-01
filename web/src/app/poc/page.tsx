import { parseOcadFile, findExampleOcdFile, getRepoRoot } from "@/lib/ocad/read";

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`;
}

export default async function PocPage() {
  let error: string | null = null;
  let summary = null;

  try {
    const filePath = await findExampleOcdFile(getRepoRoot());
    summary = await parseOcadFile(filePath);
  } catch (err) {
    error = err instanceof Error ? err.message : "Okänt fel vid parsning";
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10 border-b border-slate-200 pb-8">
          <p className="page-eyebrow">IFK Mora · PoC</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            OCAD-parsning av exempelfil
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Validerar att <code className="rounded bg-ifk-blue-pale px-1.5 py-0.5 text-ifk-blue">ocad2geojson</code>{" "}
            kan läsa våra kartfiler innan vi bygger versionshantering och diff.
          </p>
          <div className="mt-4 flex gap-4 text-sm">
            <a href="/poc/diff" className="link-primary">
              OCD-jämförelse →
            </a>
            <a href="/" className="link-muted">
              Startsida
            </a>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
            <h2 className="text-lg font-medium">Parsning misslyckades</h2>
            <p className="mt-2 font-mono text-sm">{error}</p>
          </div>
        ) : summary ? (
          <div className="space-y-8">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Objekt", summary.objectCount.toLocaleString("sv-SE")],
                ["Symboler", summary.symbolCount.toLocaleString("sv-SE")],
                ["Storlek", formatBytes(summary.fileSizeBytes)],
                ["Parsningstid", formatDuration(summary.parseDurationMs)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-sm text-slate-600">{label}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </section>

            <section className="card">
              <h2 className="text-lg font-medium text-slate-900">Filinformation</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Filnamn</dt>
                  <dd className="mt-1 font-mono text-slate-800">{summary.fileName}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">OCAD-version</dt>
                  <dd className="mt-1">{summary.ocadVersion}</dd>
                </div>
              </dl>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="card">
                <h2 className="text-lg font-medium text-slate-900">Objekt per typ</h2>
                <ul className="mt-4 space-y-2 text-sm">
                  {Object.entries(summary.byType)
                    .filter(([, count]) => count > 0)
                    .map(([type, count]) => (
                      <li key={type} className="flex justify-between border-b border-slate-100 py-2">
                        <span className="capitalize text-slate-700">{type}</span>
                        <span className="font-mono">{count.toLocaleString("sv-SE")}</span>
                      </li>
                    ))}
                </ul>
              </div>

              <div className="card">
                <h2 className="text-lg font-medium text-slate-900">Topp 15 symboler</h2>
                <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto text-sm">
                  {summary.topSymbols.map((symbol) => (
                    <li
                      key={symbol.symbolNumber}
                      className="flex justify-between gap-4 border-b border-slate-100 py-2"
                    >
                      <span className="truncate text-slate-700">
                        <span className="font-mono text-ifk-blue">{symbol.symbolNumber}</span>{" "}
                        {symbol.symbolName}
                      </span>
                      <span className="shrink-0 font-mono">{symbol.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {summary.warnings.length > 0 && (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
                <h2 className="text-lg font-medium text-amber-800">
                  Parsningsvarningar ({summary.warnings.length})
                </h2>
                <ul className="mt-4 space-y-2 font-mono text-xs text-amber-900/80">
                  {summary.warnings.slice(0, 10).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-xl border border-ifk-blue/20 bg-ifk-blue-pale p-6">
              <h2 className="text-lg font-medium text-ifk-blue">Resultat</h2>
              <p className="mt-2 text-slate-700">
                PoC lyckades. Nästa steg: diff-algoritm mellan två versioner och SVG-preview.
              </p>
            </section>
          </div>
        ) : null}
    </div>
  );
}
