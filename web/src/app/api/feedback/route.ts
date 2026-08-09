import { requireSession, requireAdmin } from "@/lib/auth/api";
import { logAction } from "@/lib/audit";
import {
  normalizeOptionalText,
  validateFeedbackDescription,
  validateFeedbackSteps,
  validateFeedbackTitle,
  validateFeedbackType,
} from "@/lib/feedback/access";
import { createFeedback, listFeedback } from "@/lib/feedback/repository";
import { FeedbackType, type FeedbackTypeValue } from "@/lib/feedback/types";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const statusParam = url.searchParams.get("status");

  if (typeParam !== FeedbackType.BUG && typeParam !== FeedbackType.IMPROVEMENT) {
    return NextResponse.json({ error: "type måste vara BUG eller IMPROVEMENT" }, { status: 400 });
  }

  const status =
    statusParam === "open" || statusParam === "closed" || statusParam === "all"
      ? statusParam
      : "open";

  const items = await listFeedback({
    type: typeParam as FeedbackTypeValue,
    status,
    currentUserId: session.user.id,
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

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
  const type = validateFeedbackType(record.type);
  if (!type) {
    return NextResponse.json({ error: "Ogiltig typ" }, { status: 400 });
  }

  const titleError = validateFeedbackTitle(record.title);
  if (titleError) return NextResponse.json({ error: titleError }, { status: 400 });

  const descriptionError = validateFeedbackDescription(record.description);
  if (descriptionError) {
    return NextResponse.json({ error: descriptionError }, { status: 400 });
  }

  const stepsError = validateFeedbackSteps(record.stepsToReproduce, type);
  if (stepsError) return NextResponse.json({ error: stepsError }, { status: 400 });

  const item = await createFeedback({
    type,
    title: String(record.title),
    description: String(record.description),
    stepsToReproduce: normalizeOptionalText(record.stepsToReproduce),
    createdById: session.user.id,
  });

  await logAction(session.user.id, "FEEDBACK_CREATED", "FeedbackItem", item.id, {
    type: item.type,
    title: item.title,
  });

  return NextResponse.json(item, { status: 201 });
}
