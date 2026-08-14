import { logAction } from "@/lib/audit";
import { requireDownload } from "@/lib/auth/api";
import {
  canAdminConfirmIntegration,
  canConfirmCheckoutIntegration,
} from "@/lib/auth/permissions";
import { getCheckoutById } from "@/lib/checkout/repository";
import { ocadExportVersionLabel, parseOcadExportVersion } from "@/lib/ocad/ocad-export-shared";
import type { OcadExportVersion } from "@/lib/ocad/ocad-export-shared";
import { prisma } from "@/lib/prisma";
import { fileExists } from "@/lib/storage";
import { streamStoredFile } from "@/lib/storage/stream-response";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireDownload();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true, title: true } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout) {
    return NextResponse.json({ error: "Utcheckning hittades inte" }, { status: 404 });
  }

  const canDownload =
    canAdminConfirmIntegration(session.user.role) ||
    canConfirmCheckoutIntegration(session.user.role, checkout.userId, session.user.id);

  if (!canDownload) {
    return NextResponse.json({ error: "Ingen behörighet att ladda ner utcheckning" }, { status: 403 });
  }

  if (!checkout.exportStoragePath) {
    return NextResponse.json({ error: "Subset-fil saknas" }, { status: 404 });
  }

  if (!(await fileExists(checkout.exportStoragePath))) {
    return NextResponse.json({ error: "Subset-fil saknas" }, { status: 404 });
  }

  try {
    const version = parseOcadExportVersion(checkout.exportOcadVersion) ?? (12 as OcadExportVersion);
    const fileName = `${map.title.replace(/\s+/g, "-")}-utcheckning-v${version}-${id.slice(0, 8)}.ocd`;

    await logAction(session.user.id, "DOWNLOAD", "MapCheckout", checkout.id, {
      mapSlug: slug,
      kind: "subset",
      ocadVersion: version,
      ocadVersionLabel: ocadExportVersionLabel(version),
    });

    return await streamStoredFile(checkout.exportStoragePath, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    });
  } catch (err) {
    console.error("Checkout download failed:", err);
    return NextResponse.json({ error: "Nedladdning misslyckades" }, { status: 500 });
  }
}
