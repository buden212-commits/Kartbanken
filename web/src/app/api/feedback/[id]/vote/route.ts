import { requireSession } from "@/lib/auth/api";
import { logAction } from "@/lib/audit";
import { getFeedbackById, toggleFeedbackVote } from "@/lib/feedback/repository";
import { FeedbackType } from "@/lib/feedback/types";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const existing = await getFeedbackById(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Förslaget hittades inte" }, { status: 404 });
  }
  if (existing.type !== FeedbackType.IMPROVEMENT) {
    return NextResponse.json({ error: "Röstning gäller bara förbättringsförslag" }, { status: 400 });
  }

  try {
    const item = await toggleFeedbackVote({
      feedbackItemId: id,
      userId: session.user.id,
    });

    await logAction(session.user.id, "FEEDBACK_VOTED", "FeedbackItem", id, {
      hasVoted: item?.hasVoted ?? false,
    });

    return NextResponse.json(item);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kunde inte rösta";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
