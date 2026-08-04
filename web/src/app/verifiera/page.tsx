import { VerifyCompareClient } from "@/components/verify-compare-client";

export default function VerifieraPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Verifiera OCAD-filer</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Jämför två kartfiler tillfälligt innan du laddar upp en ny version. Fungerar på samma sätt
        som jämförelsen vid uppladdning — med kartvyer, ändringslista och diff per symbol.
        Filerna sparas inte som kartversion.
      </p>

      <div className="mt-10">
        <VerifyCompareClient />
      </div>
    </div>
  );
}
