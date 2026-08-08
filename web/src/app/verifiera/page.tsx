import { VerifyCompareClient } from "@/components/verify-compare-client";
import { HelpLinkIcon } from "@/components/help-link-icon";

export default function VerifieraPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Verifiera OCAD-filer</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Jämför två kartfiler tillfälligt innan du laddar upp en ny version. Fungerar på samma sätt
            som jämförelsen vid uppladdning — med kartvyer, ändringslista och diff per symbol.
            Filerna sparas inte som kartversion.
          </p>
        </div>
        <HelpLinkIcon section="verifiera" className="mt-1 shrink-0" />
      </div>

      <div className="mt-10">
        <VerifyCompareClient />
      </div>
    </div>
  );
}
