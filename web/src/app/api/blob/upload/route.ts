import { getCheckoutById } from "@/lib/checkout/repository";
import { prisma } from "@/lib/prisma";
import { readTempCompareJob } from "@/lib/ocad/temp-compare";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";
import {
  blobRefToPathname,
  isCheckoutCheckinPath,
  isMapVersionPath,
  isSuggestionAttachmentPath,
  pathnamesEqual,
} from "@/lib/storage/blob-path-security";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canCheckout, canCreateMapSuggestion, canUpload } from "@/lib/auth/permissions";

export const maxDuration = 60;

type ClientPayload =
  | { kind: "mapVersion"; versionId: string; slug: string }
  | { kind: "verifyCompare"; jobId: string; slot: "A" | "B" }
  | { kind: "checkoutCheckin"; checkoutId: string; slug: string }
  | { kind: "suggestionAttachment"; slug: string };

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await auth();
        if (!session?.user?.id) {
          throw new Error("Ej inloggad");
        }

        const normalizedPath = blobRefToPathname(pathname);
        if (normalizedPath.includes("..") || normalizedPath.startsWith("/")) {
          throw new Error("Otillåten sökväg");
        }

        let payload: ClientPayload;
        try {
          payload = JSON.parse(clientPayload ?? "{}") as ClientPayload;
        } catch {
          throw new Error("Ogiltig clientPayload");
        }

        if (payload.kind === "mapVersion") {
          if (!canUpload(session.user.role)) {
            throw new Error("Saknar uppladdningsbehörighet");
          }
          const map = await prisma.mapFile.findUnique({
            where: { slug: payload.slug },
            select: { id: true },
          });
          if (!map) throw new Error("Kartfil hittades inte");
          const version = await prisma.mapVersion.findFirst({
            where: { id: payload.versionId, mapFileId: map.id },
          });
          if (!version) throw new Error("Version hittades inte");
          if (version.uploadedById !== session.user.id && session.user.role !== "ADMIN") {
            throw new Error("Endast uppladdaren får ladda upp till versionen");
          }
          if (!pathnamesEqual(normalizedPath, version.storagePath)) {
            throw new Error("Sökväg matchar inte versionen");
          }
          if (!isMapVersionPath(normalizedPath, map.id, version.versionNumber)) {
            throw new Error("Ogiltig versionssökväg");
          }
        } else if (payload.kind === "checkoutCheckin") {
          if (!canCheckout(session.user.role)) {
            throw new Error("Saknar checkin-behörighet");
          }
          const map = await prisma.mapFile.findUnique({
            where: { slug: payload.slug },
            select: { id: true },
          });
          if (!map) throw new Error("Kartfil hittades inte");
          const checkout = await getCheckoutById(map.id, payload.checkoutId);
          if (!checkout) throw new Error("Utcheckning hittades inte");
          if (checkout.userId !== session.user.id && session.user.role !== "ADMIN") {
            throw new Error("Endast utcheckningsägaren kan checka in");
          }
          if (!isCheckoutCheckinPath(normalizedPath, map.id, checkout.id)) {
            throw new Error("Sökväg matchar inte utcheckningen");
          }
        } else if (payload.kind === "suggestionAttachment") {
          if (!canCreateMapSuggestion(session.user.role)) {
            throw new Error("Saknar behörighet för kartförslag-bilaga");
          }
          const map = await prisma.mapFile.findUnique({
            where: { slug: payload.slug },
            select: { id: true },
          });
          if (!map) throw new Error("Kartfil hittades inte");
          if (!isSuggestionAttachmentPath(normalizedPath, map.id)) {
            throw new Error("Ogiltig bilagesökväg");
          }
        } else if (payload.kind === "verifyCompare") {
          const job = await readTempCompareJob(payload.jobId);
          if (!job || job.userId !== session.user.id) {
            throw new Error("Jämförelsejobb hittades inte");
          }
          const expected =
            payload.slot === "A"
              ? `temp-compare/${payload.jobId}/a.ocd`
              : `temp-compare/${payload.jobId}/b.ocd`;
          if (!pathnamesEqual(normalizedPath, expected)) {
            throw new Error("Sökväg matchar inte jämförelsejobbet");
          }
        } else {
          throw new Error("Okänd uppladdningstyp");
        }

        return {
          addRandomSuffix: false,
          // Tillåt omförsök till samma auktoriserade sökväg.
          allowOverwrite: true,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          allowedContentTypes:
            payload.kind === "suggestionAttachment"
              ? ["image/jpeg", "image/png", "image/webp"]
              : ["application/octet-stream"],
          tokenPayload: JSON.stringify(payload),
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Uppladdning nekades";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
