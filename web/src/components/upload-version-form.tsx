"use client";

import { uploadMapVersion } from "@/lib/upload-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/format";

type ActiveCheckout = {
  id: string;
  userLabel: string;
  createdAt: string;
  objectCount: number;
};

type Props = {
  mapSlug: string;
  activeCheckouts?: ActiveCheckout[];
};

export function UploadVersionForm({ mapSlug, activeCheckouts = [] }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCheckoutWarning, setShowCheckoutWarning] = useState(false);
  const [pendingForm, setPendingForm] = useState<FormData | null>(null);

  async function performUpload(form: FormData) {
    setError(null);
    setWarning(null);
    setLoading(true);

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Välj en .ocd-fil");
      setLoading(false);
      return;
    }

    const res = await uploadMapVersion(
      mapSlug,
      file,
      form.get("comment")?.toString().trim() || undefined,
    );

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Uppladdning misslyckades");
      return;
    }

    const result = await res.json();
    if (result.duplicateOfPrevious) {
      setWarning("Filen har identiskt innehåll som föregående version.");
    }

    if (result.previousVersionId) {
      router.push(
        `/maps/${mapSlug}/compare?v1=${result.previousVersionId}&v2=${result.id}`,
      );
    } else {
      router.refresh();
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = new FormData(e.currentTarget);

    if (activeCheckouts.length > 0 && !showCheckoutWarning) {
      setPendingForm(form);
      setShowCheckoutWarning(true);
      return;
    }

    await performUpload(form);
    setShowCheckoutWarning(false);
    setPendingForm(null);
    (e.target as HTMLFormElement).reset();
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="file" className="form-label">
            OCAD-fil (.ocd) *
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".ocd"
            required
            className="form-file"
          />
        </div>
        <div>
          <label htmlFor="comment" className="form-label">
            Kommentar
          </label>
          <input
            id="comment"
            name="comment"
            type="text"
            placeholder="t.ex. Justerat stigar vid sjön"
            className="form-input"
          />
        </div>
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        {warning && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {warning}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-ifk-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Laddar upp…" : "Ladda upp version"}
        </button>
      </form>

      {showCheckoutWarning && activeCheckouts.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-w-lg rounded-xl border border-amber-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-medium text-slate-900">Aktiva checkouts</h3>
            <p className="mt-2 text-sm text-slate-600">
              Det finns {activeCheckouts.length} aktiv(a) checkout(s). Full uppladdning kan påverka
              parallellt arbete — fortsätt endast om du vet vad du gör.
            </p>
            <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto text-sm">
              {activeCheckouts.map((checkout) => (
                <li
                  key={checkout.id}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-slate-700"
                >
                  <span className="font-medium">{checkout.userLabel}</span>
                  <span className="text-slate-500">
                    {" "}
                    · {formatDate(new Date(checkout.createdAt))} · {checkout.objectCount} objekt
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-ifk-blue px-4 py-2 text-sm font-medium text-white"
                onClick={async () => {
                  if (pendingForm) {
                    await performUpload(pendingForm);
                    setShowCheckoutWarning(false);
                    setPendingForm(null);
                  }
                }}
              >
                Fortsätt ändå
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                onClick={() => {
                  setShowCheckoutWarning(false);
                  setPendingForm(null);
                }}
              >
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
