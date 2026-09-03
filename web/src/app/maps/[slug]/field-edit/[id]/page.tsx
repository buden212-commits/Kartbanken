import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { canAdmin, userCanFieldEdit } from "@/lib/auth/permissions";
import { getCheckoutById } from "@/lib/checkout/repository";
import { CheckoutMode, CheckoutStatus, parseSelectionJson } from "@/lib/checkout/types";
import { FieldEditPendingClient } from "@/components/field-edit/field-edit-pending-client";
import { FieldEditSessionClient } from "@/components/field-edit/field-edit-session-client";
import { buildFieldEditReviewSummary } from "@/lib/field-edit/review-summary";
import { parseFieldEditOps } from "@/lib/field-edit/types";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ slug: string; id: string }> };

export default async function FieldEditSessionPage({ params }: PageProps) {
  const { slug, id } = await params;
  const session = await auth();
  if (!session?.user?.role) redirect("/login");

  if (!userCanFieldEdit(session.user) && !canAdmin(session.user.role)) {
    redirect(`/maps/${slug}`);
  }

  const map = await prisma.mapFile.findUnique({ where: { slug } });
  if (!map) notFound();

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout || checkout.mode !== CheckoutMode.FIELD_EDIT) notFound();

  if (checkout.status === CheckoutStatus.INTEGRATED && checkout.integratedVersionId) {
    redirect(`/maps/${slug}/versions/${checkout.integratedVersionId}`);
  }
  if (checkout.status === CheckoutStatus.CANCELLED) {
    redirect(`/maps/${slug}`);
  }

  const isAdmin = canAdmin(session.user.role);
  const isOwner = checkout.userId === session.user.id;

  if (checkout.status === CheckoutStatus.PENDING_ADMIN_CONFIRM) {
    if (!isAdmin && !isOwner) {
      redirect(`/maps/${slug}`);
    }
    let summary = buildFieldEditReviewSummary(parseFieldEditOps(checkout.editOpsJson));
    if (checkout.diffSummaryJson) {
      try {
        summary = JSON.parse(checkout.diffSummaryJson) as typeof summary;
      } catch {
        // keep built summary
      }
    }
    return (
      <div className="mx-auto max-w-6xl px-2 py-4 sm:px-6 sm:py-12">
        <Link href={`/maps/${slug}`} className="link-muted text-sm">
          ← {map.title}
        </Link>
        <h1 className="mt-3 text-xl font-semibold text-slate-900 sm:mt-4 sm:text-3xl">
          Fältredigering — granskning
        </h1>
        <div className="mt-4 sm:mt-6">
          <FieldEditPendingClient
            mapSlug={map.slug}
            mapTitle={map.title}
            sessionId={checkout.id}
            summary={summary}
            ownerLabel={checkout.user.name ?? checkout.user.email}
            isAdmin={isAdmin}
            isOwner={isOwner}
          />
        </div>
      </div>
    );
  }

  if (!userCanFieldEdit(session.user)) {
    redirect(`/maps/${slug}`);
  }

  const selection = parseSelectionJson(checkout.selectionJson);
  const ops = parseFieldEditOps(checkout.editOpsJson);

  return (
    <div className="mx-auto max-w-6xl px-2 py-4 sm:px-6 sm:py-12">
      <Link href={`/maps/${slug}`} className="link-muted text-sm">
        ← {map.title}
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-slate-900 sm:mt-4 sm:text-3xl">Fältredigering</h1>
      <p className="mt-2 hidden text-sm text-slate-600 sm:block">
        Redigera kartan i fält. Checka in för jämförelse — en administratör godkänner innan ny version
        skapas. Du kan lämna sidan och fortsätta senare via Aktiva utcheckningar.
      </p>

      <div className="mt-4 sm:mt-6">
        <FieldEditSessionClient
          mapSlug={map.slug}
          mapTitle={map.title}
          sessionId={checkout.id}
          selection={selection}
          initialOps={ops}
        />
      </div>
    </div>
  );
}
