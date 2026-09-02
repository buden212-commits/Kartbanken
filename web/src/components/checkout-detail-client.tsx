"use client";



import { useRouter } from "next/navigation";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {

  CheckoutStatus,

  checkoutStatusLabel,

  type CheckoutSelection,

} from "@/lib/checkout/types";

import type { OcadObjectChange } from "@/lib/ocad/diff-types";

import { CheckoutDiffMap } from "@/components/checkout-diff-map";

import { ocadExportVersionLabel, parseOcadExportVersion } from "@/lib/ocad/ocad-export-shared";
import type { OcadExportVersion } from "@/lib/ocad/ocad-export-shared";
import { formatDate } from "@/lib/format";

import { uploadCheckoutCheckin } from "@/lib/upload-client";

import {
  buildAddedNotIntegratedWarning,
  hasIntegrationResultStored,
  parseIntegrationWarningsFromDiffJson,
  type IntegrationWarning,
} from "@/lib/checkout/integration-warnings";

import { IntegrationWarningsPanel } from "@/components/integration-warnings-panel";
import { HelpSectionHeading } from "@/components/help-link-icon";
import { readApiError } from "@/lib/api/read-api-error";



type DiffSummary = {

  added: number;

  removed: number;

  modified: number;

  headVersionId?: string;

  headChangedSinceCheckout?: boolean;

  outOfScopeWarnings?: string[];

  changes?: OcadObjectChange[];

  layerPaths?: {

    added: string;

    removed: string;

    modified: string;

  } | null;

};



type DiffStatusResponse =

  | { status: "not_applicable" }

  | { status: "pending"; objectCount: number; startedAt: string | null }

  | { status: "error"; objectCount: number; error: string; failedAt: string | null }

  | { status: "ready"; objectCount: number; summary: DiffSummary };



type CheckoutData = {

  id: string;

  status: string;

  baseVersionId: string;

  selection: CheckoutSelection;

  diffSummaryJson?: unknown;

  integrationComment?: string | null;

  user: { id: string; name: string | null; email: string };

  createdAt: string;

  exportOcadVersion?: number;

  userConfirmedAt?: string | null;

  adminConfirmedAt?: string | null;

};



type Props = {

  mapSlug: string;

  mapTitle: string;

  checkout: CheckoutData;

  sessionUserId: string;

  isAdmin: boolean;

  isOwner: boolean;

  subsetNotice?: ReactNode;

};



function parseInitialDiff(raw: unknown): DiffSummary | null {

  if (!raw) return null;

  let parsed: unknown = raw;

  if (typeof raw === "string") {

    try {

      parsed = JSON.parse(raw);

    } catch {

      return null;

    }

  }

  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;

  if (record._status === "pending" || record._status === "error") return null;

  if (typeof record.added !== "number" || typeof record.removed !== "number") return null;

  return parsed as DiffSummary;

}



function parseIntegratedVersionNumber(raw: unknown): number | undefined {

  if (!raw) return undefined;

  let parsed: unknown = raw;

  if (typeof raw === "string") {

    try {

      parsed = JSON.parse(raw);

    } catch {

      return undefined;

    }

  }

  if (!parsed || typeof parsed !== "object") return undefined;

  const value = (parsed as Record<string, unknown>).integratedVersionNumber;

  return typeof value === "number" ? value : undefined;

}



function formatElapsed(seconds: number): string {

  const mins = Math.floor(seconds / 60);

  const secs = seconds % 60;

  if (mins === 0) return `${secs} s`;

  return `${mins} min ${secs} s`;

}



type PendingAction = "checkin" | "userConfirm" | "adminIntegrate" | "cancel";



function ButtonSpinner() {

  return (

    <span

      className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"

      aria-hidden

    />

  );

}



export function CheckoutDetailClient({

  mapSlug,

  mapTitle,

  checkout,

  isAdmin,

  isOwner,

  subsetNotice,

}: Props) {

  const router = useRouter();

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const [integrationReviewed, setIntegrationReviewed] = useState(false);

  const loading = pendingAction !== null;

  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const [diff, setDiff] = useState<DiffSummary | null>(() => parseInitialDiff(checkout.diffSummaryJson));

  const [diffStatus, setDiffStatus] = useState<DiffStatusResponse["status"] | null>(null);

  const [diffError, setDiffError] = useState<string | null>(null);

  const [diffStartedAt, setDiffStartedAt] = useState<string | null>(null);

  const [objectCount, setObjectCount] = useState(checkout.selection.objectIds.length);

  const [elapsedSec, setElapsedSec] = useState(0);

  const [retryingDiff, setRetryingDiff] = useState(false);

  const [integrationWarnings, setIntegrationWarnings] = useState<IntegrationWarning[]>(() =>

    parseIntegrationWarningsFromDiffJson(checkout.diffSummaryJson),

  );

  const [integratedVersionNumber, setIntegratedVersionNumber] = useState<number | undefined>(() =>

    parseIntegratedVersionNumber(checkout.diffSummaryJson),

  );



  const initialDiff = useMemo(

    () => parseInitialDiff(checkout.diffSummaryJson),

    [checkout.diffSummaryJson],

  );



  useEffect(() => {

    setDiff(initialDiff);

  }, [initialDiff]);



  const fetchDiffStatus = useCallback(async (): Promise<DiffStatusResponse | null> => {

    const res = await fetch(`/api/maps/${mapSlug}/checkouts/${checkout.id}/diff`);

    if (!res.ok) return null;

    return (await res.json()) as DiffStatusResponse;

  }, [mapSlug, checkout.id]);



  useEffect(() => {

    if (checkout.status !== CheckoutStatus.CHECKED_IN) {

      setDiffStatus(null);

      return;

    }



    let cancelled = false;



    async function poll() {

      const data = await fetchDiffStatus();

      if (cancelled || !data) return;



      setDiffStatus(data.status);

      if (data.status === "ready") {

        setDiff(data.summary);

        setDiffError(null);

        setObjectCount(data.objectCount);

        router.refresh();

      } else if (data.status === "error") {

        setDiff(null);

        setDiffError(data.error);

        setObjectCount(data.objectCount);

      } else if (data.status === "pending") {

        setDiff(null);

        setDiffError(null);

        setObjectCount(data.objectCount);

        setDiffStartedAt(data.startedAt);

      }

    }



    void poll();

    const timer = setInterval(() => {

      void poll();

    }, 3000);



    return () => {

      cancelled = true;

      clearInterval(timer);

    };

  }, [checkout.status, fetchDiffStatus, router]);



  useEffect(() => {

    const isPending =

      checkout.status === CheckoutStatus.CHECKED_IN &&

      !diff &&

      !diffError &&

      (diffStatus === "pending" || diffStatus === null);



    if (!isPending) return;



    const startMs = diffStartedAt ? Date.parse(diffStartedAt) : Date.now();

    const updateElapsed = () => {

      setElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));

    };



    updateElapsed();

    const timer = setInterval(updateElapsed, 1000);

    return () => clearInterval(timer);

  }, [checkout.status, diff, diffError, diffStartedAt, diffStatus]);



  async function handleRetryDiff() {

    setRetryingDiff(true);

    setDiffError(null);

    setDiffStatus("pending");

    setDiffStartedAt(new Date().toISOString());

    setElapsedSec(0);



    const res = await fetch(`/api/maps/${mapSlug}/checkouts/${checkout.id}/diff`, {

      method: "POST",

    });

    setRetryingDiff(false);



    if (!res.ok) {

      const data = await res.json().catch(() => ({}));

      setDiffError((data as { error?: string }).error ?? "Kunde inte starta om diff");

      setDiffStatus("error");

      return;

    }



    const data = (await res.json()) as DiffStatusResponse;

    setDiffStatus(data.status);

    if (data.status === "ready") {

      setDiff(data.summary);

      router.refresh();

    } else if (data.status === "pending") {

      setDiffStartedAt(data.startedAt);

    }

  }



  async function handleCheckin(e: React.FormEvent<HTMLFormElement>) {

    e.preventDefault();

    setError(null);

    setMessage(null);

    setPendingAction("checkin");



    const form = new FormData(e.currentTarget);

    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {

      setError("Välj en .ocd-fil");

      setPendingAction(null);

      return;

    }



    const res = await uploadCheckoutCheckin(
      mapSlug,
      checkout.id,
      file,
      form.get("comment")?.toString().trim() || undefined,
    );

    setPendingAction(null);



    if (!res.ok) {

      const data = await res.json().catch(() => ({}));

      setError(data.error ?? "Incheckning misslyckades");

      return;

    }



    setDiff(null);

    setDiffError(null);

    setDiffStatus("pending");

    setDiffStartedAt(new Date().toISOString());

    setElapsedSec(0);

    setMessage(null);

    router.refresh();

  }



  async function handleUserConfirm() {

    setPendingAction("userConfirm");

    setError(null);

    const res = await fetch(`/api/maps/${mapSlug}/checkouts/${checkout.id}/confirm-user`, {

      method: "POST",

    });

    setPendingAction(null);

    if (!res.ok) {

      const data = await res.json().catch(() => ({}));

      setError(data.error ?? "Bekräftelse misslyckades");

      return;

    }

    setMessage("Bekräftat. Väntar på admin.");

    router.refresh();

  }



  async function handleAdminIntegrate() {

    setPendingAction("adminIntegrate");

    setError(null);

    const res = await fetch(`/api/maps/${mapSlug}/checkouts/${checkout.id}/confirm-admin`, {

      method: "POST",

    });

    setPendingAction(null);

    if (!res.ok) {

      // Integration can finish in DB even when the HTTP response crashes (post-process OOM).

      try {

        const statusRes = await fetch(`/api/maps/${mapSlug}/checkouts/${checkout.id}`);

        if (statusRes.ok) {

          const statusData = (await statusRes.json()) as { status?: string };

          if (statusData.status === CheckoutStatus.INTEGRATED) {

            setError(null);

            setMessage(
              "Integrationen är klar (serverns svar avbröts efter sparning). Laddar om…",
            );

            router.refresh();

            return;

          }

        }

      } catch {

        // Fall through to normal error handling.

      }

      const { message } = await readApiError(res, "Integration misslyckades");

      setMessage(null);

      setError(

        `${message}\n\nTips: ladda om sidan. Om status redan är «Integrerad» lyckades det trots felmeddelandet.`,

      );

      return;

    }

    const data = (await res.json()) as {

      warnings?: IntegrationWarning[];

      versionNumber?: number;

    };

    if (Array.isArray(data.warnings) && data.warnings.length > 0) {

      setIntegrationWarnings(data.warnings);

    }

    if (typeof data.versionNumber === "number") {

      setIntegratedVersionNumber(data.versionNumber);

    }

    const hasDetailedWarnings =

      Array.isArray(data.warnings) && data.warnings.length > 0;

    setMessage(

      hasDetailedWarnings

        ? `Integrerad som v${data.versionNumber}. Se varningarna nedan för objekt som kräver manuell åtgärd i OCAD.`

        : `Integrerad som v${data.versionNumber}.`,

    );

    router.refresh();

  }



  async function handleCancel() {

    const reason = window.prompt("Anledning till avbryt (valfritt):") ?? undefined;

    setPendingAction("cancel");

    const res = await fetch(`/api/maps/${mapSlug}/checkouts/${checkout.id}`, {

      method: "DELETE",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ reason }),

    });

    setPendingAction(null);

    if (!res.ok) {

      const data = await res.json().catch(() => ({}));

      setError(data.error ?? "Avbryt misslyckades");

      return;

    }

    router.push(`/maps/${mapSlug}`);

    router.refresh();

  }



  const canCheckin =

    isOwner &&

    (checkout.status === CheckoutStatus.ACTIVE || checkout.status === CheckoutStatus.CHECKED_IN);



  const isDiffPending =

    checkout.status === CheckoutStatus.CHECKED_IN &&

    !diff &&

    !diffError &&

    (diffStatus === "pending" || diffStatus === null);



  const isDiffReady = !!diff && !isDiffPending && !diffError;

  const diffHeadVersionId = diff?.headVersionId ?? checkout.baseVersionId;

  const canUserConfirm =

    isOwner && checkout.status === CheckoutStatus.CHECKED_IN && !!diff;



  const canAdminIntegrate =

    isAdmin && checkout.status === CheckoutStatus.PENDING_ADMIN_CONFIRM;



  const displayedIntegrationWarnings = useMemo(() => {

    if (integrationWarnings.length > 0) return integrationWarnings;

    if (checkout.status !== CheckoutStatus.INTEGRATED || !diff?.changes) return [];

    // Newer integrations store integrationWarnings (empty array = all added objects appended).
    if (hasIntegrationResultStored(checkout.diffSummaryJson)) return [];

    const addedWarning = buildAddedNotIntegratedWarning(

      diff.changes.filter((change) => change.changeType === "added"),

    );

    return addedWarning ? [addedWarning] : [];

  }, [checkout.status, checkout.diffSummaryJson, diff?.changes, integrationWarnings]);



  return (

    <div className="space-y-6">

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">

        <dl className="grid gap-3 text-sm sm:grid-cols-2">

          <div>

            <dt className="text-slate-500">Status</dt>

            <dd className="font-medium text-slate-900">

              {checkoutStatusLabel(checkout.status as never)}

            </dd>

          </div>

          <div>

            <dt className="text-slate-500">Skapad</dt>

            <dd className="text-slate-900">{formatDate(new Date(checkout.createdAt))}</dd>

          </div>

          <div>

            <dt className="text-slate-500">Ägare</dt>

            <dd className="text-slate-900">{checkout.user.name ?? checkout.user.email}</dd>

          </div>

          <div>

            <dt className="text-slate-500">Objekt i urval</dt>

            <dd className="text-slate-900">{checkout.selection.objectIds.length}</dd>

          </div>

          <div>

            <dt className="text-slate-500">OCAD-format</dt>

            <dd className="text-slate-900">

              {ocadExportVersionLabel(

                parseOcadExportVersion(checkout.exportOcadVersion) ?? (12 as OcadExportVersion),

              )}

            </dd>

          </div>

        </dl>

        {checkout.selection.importPartial ? (
          <p className="mt-4 rounded-lg border border-ifk-blue/20 bg-ifk-blue-pale px-3 py-2 text-sm text-ifk-blue">
            Skapad via «Importera delkarta» — filen checkades in utan föregående utcheckning här.
            Kantöverskridande objekt raderas inte automatiskt.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">

          <a

            href={`/api/maps/${mapSlug}/checkouts/${checkout.id}/download`}

            className="rounded-lg border border-ifk-blue/30 bg-ifk-blue-pale px-4 py-2 text-sm font-medium text-ifk-blue"

          >

            Ladda ner utcheckning .ocd (

            {ocadExportVersionLabel(

              parseOcadExportVersion(checkout.exportOcadVersion) ?? (12 as OcadExportVersion),

            )}

            )

          </a>

          {isAdmin && checkout.status !== CheckoutStatus.INTEGRATED && (

            <button

              type="button"

              disabled={loading}

              onClick={handleCancel}

              className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700"

            >

              Avbryt utcheckning

            </button>

          )}

        </div>



        {subsetNotice}

      </div>



      {canCheckin && (

        <section className="card">

          <HelpSectionHeading section="checkout">Checka in redigerad utcheckning</HelpSectionHeading>

          <form onSubmit={handleCheckin} className="mt-4 space-y-3">

            <input name="file" type="file" accept=".ocd" required className="form-file" />

            <div>
              <label htmlFor="checkin-comment" className="form-label">
                Kommentar
              </label>
              <input
                id="checkin-comment"
                name="comment"
                type="text"
                defaultValue={checkout.integrationComment ?? ""}
                placeholder="t.ex. Justerat stigar vid sjön"
                className="form-input"
              />
            </div>

            <button

              type="submit"

              disabled={loading || isDiffPending}

              className="inline-flex items-center gap-2 rounded-lg bg-ifk-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"

            >

              {pendingAction === "checkin" ? (

                <>

                  <ButtonSpinner />

                  Laddar upp…

                </>

              ) : (

                "Checka in"

              )}

            </button>

          </form>

        </section>

      )}



      {isDiffPending && (

        <section className="card border-amber-200 bg-amber-50/50">

          <div className="flex items-start gap-4">

            <div

              className="mt-0.5 h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700"

              aria-hidden

            />

            <div className="min-w-0 flex-1">

              <h2 className="text-lg font-medium text-amber-900">Beräknar utcheckningsdiff</h2>

              <p className="mt-2 text-sm text-amber-800">

                Incheckning mottagen. Jämför {objectCount} objekt i urvalet mot aktuell version.

              </p>

              <p className="mt-2 text-sm text-slate-600">

                Förfluten tid: {formatElapsed(elapsedSec)}

                {elapsedSec >= 30 && " — stora kartfiler kan ta upp till några minuter."}

              </p>

              <p className="mt-1 text-xs text-slate-500">Sidan uppdateras automatiskt när diff är klar.</p>

            </div>

          </div>

        </section>

      )}



      {diffError && (

        <section className="card border-red-200 bg-red-50">

          <h2 className="text-lg font-medium text-red-900">Diff misslyckades</h2>

          <p className="mt-2 text-sm text-red-800">{diffError}</p>

          <button

            type="button"

            disabled={retryingDiff}

            onClick={() => void handleRetryDiff()}

            className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-800 disabled:opacity-50"

          >

            {retryingDiff ? "Startar om…" : "Försök beräkna diff igen"}

          </button>

        </section>

      )}



      {diff && (

        <section className="card">

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <HelpSectionHeading section="checkout">Utcheckningsdiff mot aktuell version</HelpSectionHeading>
            </div>
            <button
              type="button"
              disabled={retryingDiff}
              onClick={() => void handleRetryDiff()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {retryingDiff ? "Räknar om…" : "Räkna om diff"}
            </button>
          </div>

          {diff.headChangedSinceCheckout && (

            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">

              Aktuell version har ändrats sedan utcheckningen skapades. Granska diff noggrant innan integration.

            </p>

          )}

          <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">

            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">

              +{diff.added} tillagda

            </div>

            <div className="rounded-lg bg-red-50 px-3 py-2 text-red-800">−{diff.removed} borttagna</div>

            <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">

              ~{diff.modified} ändrade

            </div>

          </div>

          {diff.outOfScopeWarnings && diff.outOfScopeWarnings.length > 0 && (

            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-800">

              {diff.outOfScopeWarnings.map((warning) => (

                <li key={warning}>{warning}</li>

              ))}

            </ul>

          )}

        </section>

      )}



      {isDiffReady && diffHeadVersionId && (

        <CheckoutDiffMap

          mapSlug={mapSlug}

          checkoutId={checkout.id}

          headVersionId={diffHeadVersionId}

          changes={diff?.changes ?? []}

          layerPaths={diff?.layerPaths ?? null}

        />

      )}



      {canUserConfirm && (

        <section className="card">

          <HelpSectionHeading section="checkout">Bekräfta integration</HelpSectionHeading>

          <p className="mt-2 text-sm text-slate-600">

            Granska diff ovan. Efter din bekräftelse krävs admin-godkännande innan ändringar slås ihop

            med {mapTitle}.

          </p>

          <button

            type="button"

            disabled={loading}

            onClick={handleUserConfirm}

            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"

          >

            {pendingAction === "userConfirm" ? (

              <>

                <ButtonSpinner />

                Bekräftar…

              </>

            ) : (

              "Bekräfta integration"

            )}

          </button>

        </section>

      )}



      {checkout.status === CheckoutStatus.PENDING_ADMIN_CONFIRM && isOwner && !isAdmin && (

        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">

          Du har bekräftat. Väntar på admin-bekräftelse.

        </p>

      )}



      {canAdminIntegrate && (

        <section className="card border-ifk-blue/20">

          <HelpSectionHeading section="checkout">Admin: bekräfta och integrera</HelpSectionHeading>

          <p className="mt-2 text-sm text-slate-600">

            Skapar ny kartversion med integrerade ändringar mot aktuell version.

          </p>

          {checkout.integrationComment && (

            <p className="mt-2 text-sm text-slate-700">

              <span className="font-medium">Versionskommentar:</span>{" "}

              {checkout.integrationComment}

            </p>

          )}

          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={integrationReviewed}
              onChange={(e) => setIntegrationReviewed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-ifk-blue focus:ring-ifk-blue/20"
            />
            <span>
              Jag har granskat diff och eventuella varningar och vill integrera ändringarna.
            </span>
          </label>

          <button

            type="button"

            disabled={loading || !integrationReviewed}

            onClick={handleAdminIntegrate}

            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-ifk-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"

          >

            {pendingAction === "adminIntegrate" ? (

              <>

                <ButtonSpinner />

                Integrerar…

              </>

            ) : (

              "Bekräfta och integrera"

            )}

          </button>

        </section>

      )}



      {error && (

        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">

          <p className="font-medium">Fel</p>

          <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">{error}</pre>

          <p className="mt-2 text-xs text-red-700">

            Utchecknings-id: <span className="font-mono">{checkout.id}</span> — ange gärna id och tidpunkt

            om du behöver hjälp.

          </p>

        </div>

      )}

      {message && (

        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">

          {message}

        </p>

      )}



      {displayedIntegrationWarnings.length > 0 && (

        <IntegrationWarningsPanel

          warnings={displayedIntegrationWarnings}

          versionNumber={integratedVersionNumber}

          mapSlug={mapSlug}

          checkoutId={checkout.id}

          headVersionId={diffHeadVersionId}

        />

      )}

    </div>

  );

}


