import { auth } from "@/auth";
import { canCheckout, canCreateMapSuggestion, canUpload } from "@/lib/auth/permissions";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const maxDuration = 60;

type ClientPayload =
  | { kind: "mapVersion"; versionId: string; slug: string }
  | { kind: "verifyCompare"; jobId: string; slot: "A" | "B" }
  | { kind: "checkoutCheckin"; checkoutId: string; slug: string }
  | { kind: "suggestionAttachment"; slug: string };

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function isAllowedUploadPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".ocd") || lower.endsWith(".json") || lower.endsWith(".svg")) {
    return true;
  }
  if (lower.includes("suggestion-attachments/")) {
    return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }
  return false;
}

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
          if (!isAllowedUploadPath(pathname)) {
            throw new Error("Otillåten filtyp");
          }
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
        } else if (payload.kind === "suggestionAttachment") {
          if (!canCreateMapSuggestion(session.user.role)) {
            throw new Error("Saknar behörighet för kartförslag-bilaga");
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
          allowedContentTypes:
            payload.kind === "suggestionAttachment"
              ? ["image/jpeg", "image/png", "image/webp"]
              : ["application/octet-stream"],
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
