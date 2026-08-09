import { requireAdmin } from "@/lib/auth/api";
import { logAction } from "@/lib/audit";
import {
  normalizeOptionalText,
  validateAdminComment,
  validateFeedbackAdminStatus,
} from "@/lib/feedback/access";
import { getFeedbackById, updateFeedbackStatus } from "@/lib/feedback/repository";
import { FeedbackType, type FeedbackTypeValue } from "@/lib/feedback/types";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const existing = await getFeedbackById(id);
  if (!existing) {
    return NextResponse.json({ error: "Feedback hittades inte" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Ogiltig begäran" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  if (typeof record.status !== "string") {
    return NextResponse.json({ error: "Status krävs" }, { status: 400 });
  }

  const statusError = validateFeedbackAdminStatus(
    existing.type as FeedbackTypeValue,
    record.status,
  );
  if (statusError) return NextResponse.json({ error: statusError }, { status: 400 });

  const commentError = validateAdminComment(record.adminComment);
  if (commentError) return NextResponse.json({ error: commentError }, { status: 400 });

  const item = await updateFeedbackStatus({
    id,
    status: record.status,
    adminComment: normalizeOptionalText(record.adminComment),
    reviewedById: session.user.id,
  });

  await logAction(session.user.id, "FEEDBACK_REVIEWED", "FeedbackItem", item.id, {
    type: item.type,
    status: item.status,
    title: item.title,
  });

  return NextResponse.json(item);
}
