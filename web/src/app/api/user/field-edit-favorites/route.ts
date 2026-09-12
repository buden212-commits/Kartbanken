import { NextResponse } from "next/server";
import { requireFieldEdit } from "@/lib/auth/api";
import {
  parseFieldEditFavorites,
  serializeFieldEditFavorites,
  type FieldEditFavoriteSymbols,
} from "@/lib/field-edit/favorites";
import { prisma } from "@/lib/prisma";

function parseBodyFavorites(body: unknown): FieldEditFavoriteSymbols | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const source = record.favorites ?? body;
  return parseFieldEditFavorites(JSON.stringify(source));
}

export async function GET() {
  const session = await requireFieldEdit();
  if (session instanceof NextResponse) return session;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { fieldEditFavoriteSymbols: true },
  });

  return NextResponse.json({
    favorites: parseFieldEditFavorites(user?.fieldEditFavoriteSymbols),
  });
}

export async function PATCH(request: Request) {
  const session = await requireFieldEdit();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }

  const favorites = parseBodyFavorites(body);
  if (!favorites) {
    return NextResponse.json({ error: "Ogiltiga favoriter" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { fieldEditFavoriteSymbols: serializeFieldEditFavorites(favorites) },
  });

  return NextResponse.json({ favorites });
}
