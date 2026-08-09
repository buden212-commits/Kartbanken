"use client";

import { uploadMapVersion, type UploadMapVersionOptions } from "@/lib/upload-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import { HelpSectionHeading } from "@/components/help-link-icon";

type ActiveCheckout = {
  id: string;
  userLabel: string;
  createdAt: string;
  objectCount: number;
};

type Props = {
  mapSlug: string;
  activeCheckouts?: ActiveCheckout[];
  isAdmin?: boolean;
  mapArchived?: boolean;
};

type PendingUpload = {
  form: FormData;
  kind: "checkout" | "duplicate";
};

export function UploadVersionForm({
  mapSlug,
  activeCheckouts = [],
  isAdmin = false,
  mapArchived = false,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);

  async function performUpload(form: FormData, options: UploadMapVersionOptions = {}) {
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
      options,
    );

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.code === "DUPLICATE_CONTENT") {
        setPendingUpload({ form, kind: "duplicate" });
        return;
      }
      if (data.code === "ACTIVE_CHECKOUTS_ADMIN") {
        setPendingUpload({ form, kind: "checkout" });
        return;
      }
      setError(data.error ?? "Uppladdning misslyckades");
      return;
    }

    const result = await res.json();
    if (result.duplicateOfPrevious) {
      setWarning("Filen har identiskt innehåll som föregående version.");
    }

    setPendingUpload(null);

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
    if (mapArchived) {
      setError("Området är arkiverat och kan inte uppdateras.");
      return;
    }

    const form = new FormData(e.currentTarget);

    if (activeCheckouts.length > 0 && !isAdmin) {
      setError(
        `Det finns ${activeCheckouts.length === 1 ? "1 aktiv utcheckning" : `${activeCheckouts.length} aktiva utcheckningar`}. Vänta tills de är integrerade eller avbrutna.`,
      );
      return;
    }

    if (activeCheckouts.length > 0 && isAdmin) {
      setPendingUpload({ form, kind: "checkout" });
      return;
    }

    await performUpload(form);
    (e.target as HTMLFormElement).reset();
  }

  async function confirmPendingUpload() {
    if (!pendingUpload) return;
    const options: UploadMapVersionOptions = {
      forceDespiteCheckouts: pendingUpload.kind === "checkout" ? true : undefined,
      forceDuplicate: pendingUpload.kind === "duplicate" ? true : undefined,
    };
    await performUpload(pendingUpload.form, options);
    setPendingUpload(null);
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
            disabled={mapArchived || loading}
            className="form-file"
          />
        </div>
        <div>
          <label htmlFor="comment" className="form-label">
            Kommentar (valfritt)
          </label>
          <input
            id="comment"
            name="comment"
            type="text"
            disabled={mapArchived || loading}
            className="form-input"
            placeholder="t.ex. Uppdaterad efter terränglöp"
          />
        </div>
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        {warning && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {warning}
          </p>
        )}
        <button
          type="submit"
          disabled={mapArchived || loading}
          className="btn-primary disabled:opacity-50"
        >
          {loading ? "Laddar upp…" : "Ladda upp"}
        </button>
      </form>

      {pendingUpload?.kind === "checkout" && activeCheckouts.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <HelpSectionHeading section="checkout">Aktiva utcheckningar</HelpSectionHeading>
          <p className="mt-2 text-sm text-amber-900">
            Det finns {activeCheckouts.length === 1 ? "1 aktiv utcheckning" : `${activeCheckouts.length} aktiva utcheckningar`}. Full uppladdning kan ogiltigförglora
            pågående arbete och ändra senaste versionen.
          </p>
          <ul className="mt-2 list-inside list-disc text-sm text-amber-900">
            {activeCheckouts.map((checkout) => (
              <li key={checkout.id}>
                {checkout.userLabel} · {formatDate(new Date(checkout.createdAt))} ·{" "}
                {checkout.objectCount} objekt
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void confirmPendingUpload()}
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
            >
              Ladda upp ändå
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => setPendingUpload(null)}
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm text-amber-900"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      {pendingUpload?.kind === "duplicate" && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-950">Identiskt innehåll</p>
          <p className="mt-1 text-sm text-amber-900">
            Filen har samma innehåll som senaste versionen. Vill du skapa en ny version ändå?
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void confirmPendingUpload()}
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
            >
              Skapa version ändå
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => setPendingUpload(null)}
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm text-amber-900"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
    </>
  );
}
