import { auth } from "@/auth";
import { canCheckout, canUpload } from "@/lib/auth/permissions";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const maxDuration = 60;

type ClientPayload =
  | { kind: "mapVersion"; versionId: string; slug: string }
  | { kind: "verifyCompare"; jobId: string; slot: "A" | "B" }
  | { kind: "checkoutCheckin"; checkoutId: string; slug: string };

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

        if (!pathname.endsWith(".ocd") && !pathname.endsWith(".json") && !pathname.endsWith(".svg")) {
          throw new Error("Otillåten filtyp");
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
        } else if (payload.kind === "checkoutCheckin") {
          if (!canCheckout(session.user.role)) {
            throw new Error("Saknar checkin-behörighet");
          }
        } else if (payload.kind === "verifyCompare") {
          // Alla inloggade användare får verifiera
        } else {
          throw new Error("Okänd uppladdningstyp");
        }

        return {
          addRandomSuffix: false,
          allowOverwrite: true,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          allowedContentTypes: ["application/octet-stream"],
          tokenPayload: JSON.stringify(payload),
        };
      },
      onUploadCompleted: async () => {
        // Slutförs via upload-complete-routes efter klientuppladdning
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Uppladdning misslyckades";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
