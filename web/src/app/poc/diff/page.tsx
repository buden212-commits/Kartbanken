import { readdir } from "fs/promises";
import path from "path";
import { compareOcadFiles } from "@/lib/ocad/compare";
import { getRepoRoot } from "@/lib/ocad/read";
import type { ChangeType } from "@/lib/ocad/diff-types";

export const dynamic = "force-dynamic";

const CHANGE_LABELS: Record<ChangeType, string> = {
  added: "Tillagd",
  removed: "Borttagen",
  modified: "Ändrad",
};

const CHANGE_COLORS: Record<ChangeType, string> = {
  added: "text-emerald-600",
  removed: "text-red-600",
  modified: "text-amber-600",
};

async function listOcdFiles(): Promise<string[]> {
  const dir = path.join(getRepoRoot(), "Exempelfil");
  const entries = await readdir(dir);
  return entries.filter((f) => f.toLowerCase().endsWith(".ocd")).sort();
}

export default async function PocDiffPage() {
  let error: string | null = null;
  let diff = null;
  let fileA = "";
  let fileB = "";
  const files = await listOcdFiles();

  try {
    if (files.length === 0) throw new Error("Ingen .ocd-fil i Exempelfil/");

    const exampleDir = path.join(getRepoRoot(), "Exempelfil");
    fileA = path.join(exampleDir, files[0]!);
    fileB = path.join(exampleDir, files[files.length >= 2 ? 1 : 0]!);

    diff = await compareOcadFiles(fileA, fileB);
  } catch (err) {
    error = err instanceof Error ? err.message : "Okänt fel";
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10 border-b border-slate-200 pb-8">
        <p className="page-eyebrow">IFK Mora · PoC · Diff</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          OCD-jämförelse
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Jämför två versioner och klassificera tillagda, borttagna och ändrade kartobjekt.
          {files.length < 2 &&
            " Lägg en till .ocd-fil i Exempelfil/ för att jämföra olika versioner."}
        </p>
        <div className="mt-4 flex gap-4 text-sm">
          <a href="/poc" className="link-primary">
            ← Parsning
          </a>
          <a href="/" className="link-muted">
            Startsida
          </a>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">{error}</div>
      ) : diff ? (
        <div className="space-y-8">
          <section className="card">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Version A</dt>
                <dd className="mt-1 font-mono text-slate-800">{diff.versionA.fileName}</dd>
                <dd className="text-slate-600">
                  {diff.versionA.objectCount.toLocaleString("sv-SE")} objekt
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Version B</dt>
                <dd className="mt-1 font-mono text-slate-800">{diff.versionB.fileName}</dd>
                <dd className="text-slate-600">
                  {diff.versionB.objectCount.toLocaleString("sv-SE")} objekt
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-slate-500">
              Diff på {(diff.durationMs / 1000).toFixed(2)} s · spatial tolerans{" "}
              {diff.toleranceMeters} m
            </p>
          </section>

          <section className="grid gap-4 sm:grid-cols-4">
            {[
              ["Tillagda", diff.added, "text-emerald-600"],
              ["Borttagna", diff.removed, "text-red-600"],
              ["Ändrade", diff.modified, "text-amber-600"],
              ["Oförändrade", diff.unchanged, "text-slate-600"],
            ].map(([label, value, color]) => (
              <div
                key={label as string}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="text-sm text-slate-600">{label}</p>
                <p className={`mt-1 text-2xl font-semibold ${color}`}>
                  {(value as number).toLocaleString("sv-SE")}
                </p>
              </div>
            ))}
          </section>

          {diff.bySymbol.length > 0 ? (
            <>
              <section className="card">
                <h2 className="text-lg font-medium text-slate-900">Ändringar per symbol</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-2 pr-4">Symbol</th>
                        <th className="pb-2 pr-4">Namn</th>
                        <th className="pb-2 pr-4 text-emerald-600">+</th>
                        <th className="pb-2 pr-4 text-red-600">−</th>
                        <th className="pb-2 text-amber-600">~</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.bySymbol.slice(0, 20).map((row) => (
                        <tr key={row.symbolNumber} className="border-b border-slate-100">
                          <td className="py-2 pr-4 font-mono">{row.symbolNumber}</td>
                          <td className="py-2 pr-4">{row.symbolName}</td>
                          <td className="py-2 pr-4 font-mono text-emerald-600">
                            {row.added || "—"}
                          </td>
                          <td className="py-2 pr-4 font-mono text-red-600">
                            {row.removed || "—"}
                          </td>
                          <td className="py-2 font-mono text-amber-600">
                            {row.modified || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card">
                <h2 className="text-lg font-medium text-slate-900">
                  Detaljerade ändringar
                  {diff.changesTruncated && (
                    <span className="ml-2 text-sm font-normal text-amber-700">
                      (listan begränsad till {diff.changes.length.toLocaleString("sv-SE")} av{" "}
                      {diff.totalChanges.toLocaleString("sv-SE")})
                    </span>
                  )}
                </h2>
                <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto text-sm">
                  {diff.changes.map((change, i) => (
                    <li
                      key={`${change.symbolNumber}-${change.centroid[0]}-${i}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 py-2"
                    >
                      <span className={`font-medium ${CHANGE_COLORS[change.changeType]}`}>
                        {CHANGE_LABELS[change.changeType]}
                      </span>
                      <span className="font-mono text-slate-500">{change.symbolNumber}</span>
                      <span>{change.symbolName}</span>
                      <span className="font-mono text-xs text-slate-500">
                        ({change.centroid[0].toFixed(1)}, {change.centroid[1].toFixed(1)})
                      </span>
                      {change.text && (
                        <span className="text-slate-600">&quot;{change.text}&quot;</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : (
            <section className="rounded-xl border border-ifk-blue/20 bg-ifk-blue-pale p-6">
              <h2 className="text-lg font-medium text-ifk-blue">Inga skillnader</h2>
              <p className="mt-2 text-slate-700">
                Filerna är identiska enligt diff-motorn (inom {diff.toleranceMeters} m tolerans).
              </p>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}
