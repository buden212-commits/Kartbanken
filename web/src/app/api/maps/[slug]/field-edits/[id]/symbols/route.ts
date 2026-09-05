import { requireFieldEdit } from "@/lib/auth/api";
import { getCheckoutById } from "@/lib/checkout/repository";
import { CheckoutMode, CheckoutStatus } from "@/lib/checkout/types";
import { buildFieldEditSymbolCatalog } from "@/lib/field-edit/symbol-catalog";
import { parseOcadBufferWithFile } from "@/lib/ocad/read";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { NextResponse } from "next/server";

export const maxDuration = 300;

type RouteParams = { params: Promise<{ slug: string; id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await requireFieldEdit();
  if (session instanceof NextResponse) return session;

  const { slug, id } = await params;
  const map = await prisma.mapFile.findUnique({ where: { slug }, select: { id: true } });
  if (!map) {
    return NextResponse.json({ error: "Kartfil hittades inte" }, { status: 404 });
  }

  const checkout = await getCheckoutById(map.id, id);
  if (!checkout || checkout.mode !== CheckoutMode.FIELD_EDIT) {
    return NextResponse.json({ error: "Fältredigering hittades inte" }, { status: 404 });
  }
  if (checkout.status !== CheckoutStatus.ACTIVE) {
    return NextResponse.json({ error: "Fältredigeringen är inte aktiv" }, { status: 409 });
  }

  let buffer: Buffer;
  let fileName: string;

  if (checkout.exportStoragePath) {
    buffer = await readStoredFile(checkout.exportStoragePath);
    fileName = "field-edit-subset.ocd";
  } else {
    const version = await prisma.mapVersion.findUnique({
      where: { id: checkout.baseVersionId },
      select: { storagePath: true, originalFilename: true },
    });
    if (!version) {
      return NextResponse.json({ error: "Basversion hittades inte" }, { status: 404 });
    }
    buffer = await readStoredFile(version.storagePath);
    fileName = version.originalFilename;
  }

  try {
    const { ocadFile } = await parseOcadBufferWithFile(buffer, fileName);
    const symbols = await buildFieldEditSymbolCatalog(
      ocadFile as { symbols: Array<{
        symNum: number;
        number?: string;
        description?: string;
        otp?: number;
        type?: number;
        iconBits?: number[];
        isHidden?: () => boolean;
      }> },
    );
    return NextResponse.json(
      { symbols, count: symbols.length },
      { headers: { "Cache-Control": "private, max-age=600" } },
    );
  } catch (err) {
    console.error("Field edit symbols catalogue failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunde inte läsa symboler" },
      { status: 500 },
    );
  }
}
