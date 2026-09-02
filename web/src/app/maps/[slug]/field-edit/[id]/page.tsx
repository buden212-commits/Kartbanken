import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { userCanFieldEdit } from "@/lib/auth/permissions";
import { getCheckoutById } from "@/lib/checkout/repository";
import { CheckoutMode, CheckoutStatus, parseSelectionJson } from "@/lib/checkout/types";
import { FieldEditSessionClient } from "@/components/field-edit/field-edit-session-client";
import { parseFieldEditOps } from "@/lib/field-edit/types";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ slug: string; id: string }> };

export default async function FieldEditSessionPage({ params }: PageProps) {
  const { slug, id } = await params;
  const session = await auth();
  if (!session?.user?.role) redirect("/login");

  if (!userCanFieldEdit(session.user)) {
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

  const selection = parseSelectionJson(checkout.selectionJson);
  const ops = parseFieldEditOps(checkout.editOpsJson);

  return (
    <div className="mx-auto max-w-6xl px-2 py-4 sm:px-6 sm:py-12">
      <Link href={`/maps/${slug}`} className="link-muted text-sm">
        ← {map.title}
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-slate-900 sm:mt-4 sm:text-3xl">Fältredigering</h1>
      <p className="mt-2 hidden text-sm text-slate-600 sm:block">
        Klicka på objekt för att radera eller redigera, lägg till nya objekt, eller använd snappning och CAD-verktyg. Publicera skapar en ny version.
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
