import {
  feedbackStatusLabel,
  type FeedbackListItem,
  type FeedbackTypeValue,
} from "@/lib/feedback/types";
import { prisma } from "@/lib/prisma";

const userSelect = { id: true, name: true, email: true } as const;

type FeedbackRow = {
  id: string;
  type: string;
  title: string;
  description: string;
  stepsToReproduce: string | null;
  status: string;
  adminComment: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  createdBy: { id: string; name: string | null; email: string };
  reviewedBy: { id: string; name: string | null; email: string } | null;
  _count: { votes: number };
  votes?: { userId: string }[];
};

function serializeFeedback(row: FeedbackRow, currentUserId?: string): FeedbackListItem {
  const type = row.type as FeedbackTypeValue;
  return {
    id: row.id,
    type,
    title: row.title,
    description: row.description,
    stepsToReproduce: row.stepsToReproduce,
    status: row.status,
    statusLabel: feedbackStatusLabel(type, row.status),
    adminComment: row.adminComment,
    voteCount: row._count.votes,
    hasVoted: row.votes?.some((v) => v.userId === currentUserId) ?? false,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    reviewedBy: row.reviewedBy,
  };
}

export async function listFeedback(input: {
  type: FeedbackTypeValue;
  status?: "open" | "closed" | "all";
  currentUserId?: string;
}) {
  const statusFilter =
    input.status === "open"
      ? { in: ["OPEN", "IN_PROGRESS"] }
      : input.status === "closed"
        ? {
            in: ["FIXED", "BUILT", "REJECTED", "DUPLICATE", "CANNOT_REPRODUCE"],
          }
        : undefined;

  const rows = await prisma.feedbackItem.findMany({
    where: {
      type: input.type,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      createdBy: { select: userSelect },
      reviewedBy: { select: userSelect },
      _count: { select: { votes: true } },
      votes: input.currentUserId
        ? { where: { userId: input.currentUserId }, select: { userId: true } }
        : false,
    },
    orderBy:
      input.type === "IMPROVEMENT"
        ? [{ votes: { _count: "desc" } }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }],
  });

  return rows.map((row) => serializeFeedback(row as FeedbackRow, input.currentUserId));
}

export async function createFeedback(input: {
  type: FeedbackTypeValue;
  title: string;
  description: string;
  stepsToReproduce?: string | null;
  createdById: string;
}) {
  const row = await prisma.feedbackItem.create({
    data: {
      type: input.type,
      title: input.title.trim(),
      description: input.description.trim(),
      stepsToReproduce: input.stepsToReproduce?.trim() || null,
      createdById: input.createdById,
    },
    include: {
      createdBy: { select: userSelect },
      reviewedBy: { select: userSelect },
      _count: { select: { votes: true } },
    },
  });

  return serializeFeedback(row as FeedbackRow, input.createdById);
}

export async function getFeedbackById(id: string, currentUserId?: string) {
  const row = await prisma.feedbackItem.findUnique({
    where: { id },
    include: {
      createdBy: { select: userSelect },
      reviewedBy: { select: userSelect },
      _count: { select: { votes: true } },
      votes: currentUserId
        ? { where: { userId: currentUserId }, select: { userId: true } }
        : false,
    },
  });
  if (!row) return null;
  return serializeFeedback(row as FeedbackRow, currentUserId);
}

export async function updateFeedbackStatus(input: {
  id: string;
  status: string;
  adminComment?: string | null;
  reviewedById: string;
}) {
  const row = await prisma.feedbackItem.update({
    where: { id: input.id },
    data: {
      status: input.status,
      adminComment: input.adminComment?.trim() || null,
      reviewedById: input.reviewedById,
      reviewedAt: new Date(),
    },
    include: {
      createdBy: { select: userSelect },
      reviewedBy: { select: userSelect },
      _count: { select: { votes: true } },
    },
  });

  return serializeFeedback(row as FeedbackRow);
}

export async function toggleFeedbackVote(input: {
  feedbackItemId: string;
  userId: string;
}) {
  const item = await prisma.feedbackItem.findUnique({
    where: { id: input.feedbackItemId },
    select: { id: true, type: true },
  });
  if (!item) return null;
  if (item.type !== "IMPROVEMENT") {
    throw new Error("Röstning gäller bara förbättringsförslag");
  }

  const existing = await prisma.feedbackVote.findUnique({
    where: {
      feedbackItemId_userId: {
        feedbackItemId: input.feedbackItemId,
        userId: input.userId,
      },
    },
  });

  if (existing) {
    await prisma.feedbackVote.delete({ where: { id: existing.id } });
  } else {
    await prisma.feedbackVote.create({
      data: {
        feedbackItemId: input.feedbackItemId,
        userId: input.userId,
      },
    });
  }

  return getFeedbackById(input.feedbackItemId, input.userId);
}

export async function countOpenFeedback() {
  const [bugs, improvements] = await Promise.all([
    prisma.feedbackItem.count({
      where: { type: "BUG", status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    prisma.feedbackItem.count({
      where: { type: "IMPROVEMENT", status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
  ]);
  return { bugs, improvements, total: bugs + improvements };
}
