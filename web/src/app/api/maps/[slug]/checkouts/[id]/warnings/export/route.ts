import { logAction } from "@/lib/audit";
import { requireDownload } from "@/lib/auth/api";
import {
  canAdminConfirmIntegration,
  canConfirmCheckoutIntegration,
} from "@/lib/auth/permissions";
import {
  collectWarningObjectIndices,
  parseIntegrationWarningsFromDiffJson,
} from "@/lib/checkout/integration-warnings";
import { getCheckoutById } from "@/lib/checkout/repository";
import { exportObjectsByIndices } from "@/lib/ocad/ocad-export-server";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const session = await requireDownload();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const map = await prisma.mapFile.findUnique({
    where: { slug },
    select: { id: true, title: true },
  });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout) {
    return NextResponse.json({ error: "Utcheckning hittades inte" }, { status: 404 });
  }

  const canAccess =
    canAdminConfirmIntegration(session.user.role) ||
    canConfirmCheckoutIntegration(session.user.role, checkout.userId, session.user.id);

  if (!canAccess) {
    return NextResponse.json({ error: "Ingen behörighet" }, { status: 403 });
  }

  const url = new URL(request.url);
  const indicesParam = url.searchParams.get("indices");
  let indices: number[];

  if (indicesParam) {
    indices = indicesParam
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0);
  } else {
    const warnings = parseIntegrationWarningsFromDiffJson(checkout.diffSummaryJson);
    indices = collectWarningObjectIndices(warnings);

    // Legacy integrated checkouts without stored warnings: use added changes from diff.
    if (indices.length === 0 && checkout.diffSummaryJson) {
      try {
        const summary =
          typeof checkout.diffSummaryJson === "string"
            ? (JSON.parse(checkout.diffSummaryJson) as { changes?: Array<{ changeType?: string; objectIndex?: number }> })
            : (checkout.diffSummaryJson as {
                changes?: Array<{ changeType?: string; objectIndex?: number }>;
              });
        indices = (summary.changes ?? [])
          .filter((change) => change.changeType === "added" && typeof change.objectIndex === "number")
          .map((change) => change.objectIndex as number);
      } catch {
        indices = [];
      }
    }
  }

  if (indices.length === 0) {
    return NextResponse.json({ error: "Inga felobjekt att exportera" }, { status: 400 });
  }

  const sourcePath = checkout.checkinStoragePath ?? checkout.exportStoragePath;
  if (!sourcePath) {
    return NextResponse.json(
      { error: "Inchecknings- eller utcheckningsfil saknas för export" },
      { status: 404 },
    );
  }

  try {
    const sourceBuffer = await readStoredFile(sourcePath);
    const exported = exportObjectsByIndices(sourceBuffer, new Set(indices));
    const fileName = `${map.title.replace(/\s+/g, "-")}-utcheckning-${id.slice(0, 8)}-felobjekt.ocd`;

    await logAction(session.user.id, "DOWNLOAD", "MapCheckout", checkout.id, {
      mapSlug: slug,
      kind: "integration-warnings",
      objectCount: exported.keptObjects,
      indices,
    });

    return new NextResponse(new Uint8Array(exported.buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Content-Length": String(exported.buffer.byteLength),
      },
    });
  } catch (err) {
    console.error("Warning objects export failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export misslyckades" },
      { status: 500 },
    );
  }
}
