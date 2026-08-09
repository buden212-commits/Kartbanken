export const FeedbackType = {
  BUG: "BUG",
  IMPROVEMENT: "IMPROVEMENT",
} as const;

export type FeedbackTypeValue = (typeof FeedbackType)[keyof typeof FeedbackType];

export const FeedbackStatus = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  FIXED: "FIXED",
  BUILT: "BUILT",
  REJECTED: "REJECTED",
  DUPLICATE: "DUPLICATE",
  CANNOT_REPRODUCE: "CANNOT_REPRODUCE",
} as const;

export type FeedbackStatusValue = (typeof FeedbackStatus)[keyof typeof FeedbackStatus];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackTypeValue, string> = {
  BUG: "Bugg",
  IMPROVEMENT: "Förbättring",
};

export const BUG_STATUS_LABELS: Record<string, string> = {
  OPEN: "Öppen",
  IN_PROGRESS: "Pågår",
  FIXED: "Fixad",
  REJECTED: "Avvisad",
  DUPLICATE: "Duplicerad",
  CANNOT_REPRODUCE: "Kan inte reproducera",
};

export const IMPROVEMENT_STATUS_LABELS: Record<string, string> = {
  OPEN: "Öppen",
  IN_PROGRESS: "Planerad",
  BUILT: "Byggd",
  REJECTED: "Avvisad",
  DUPLICATE: "Duplicerad",
};

export const OPEN_FEEDBACK_STATUSES = [
  FeedbackStatus.OPEN,
  FeedbackStatus.IN_PROGRESS,
] as const;

export const CLOSED_FEEDBACK_STATUSES = [
  FeedbackStatus.FIXED,
  FeedbackStatus.BUILT,
  FeedbackStatus.REJECTED,
  FeedbackStatus.DUPLICATE,
  FeedbackStatus.CANNOT_REPRODUCE,
] as const;

export const BUG_ADMIN_STATUSES = [
  FeedbackStatus.IN_PROGRESS,
  FeedbackStatus.FIXED,
  FeedbackStatus.REJECTED,
  FeedbackStatus.DUPLICATE,
  FeedbackStatus.CANNOT_REPRODUCE,
] as const;

export const IMPROVEMENT_ADMIN_STATUSES = [
  FeedbackStatus.IN_PROGRESS,
  FeedbackStatus.BUILT,
  FeedbackStatus.REJECTED,
  FeedbackStatus.DUPLICATE,
] as const;

export function feedbackStatusLabel(
  type: FeedbackTypeValue,
  status: string,
): string {
  if (type === FeedbackType.BUG) {
    return BUG_STATUS_LABELS[status] ?? status;
  }
  return IMPROVEMENT_STATUS_LABELS[status] ?? status;
}

export function isOpenFeedbackStatus(status: string): boolean {
  return (OPEN_FEEDBACK_STATUSES as readonly string[]).includes(status);
}

export type FeedbackListItem = {
  id: string;
  type: FeedbackTypeValue;
  title: string;
  description: string;
  stepsToReproduce: string | null;
  status: string;
  statusLabel: string;
  adminComment: string | null;
  voteCount: number;
  hasVoted: boolean;
  createdAt: string;
  reviewedAt: string | null;
  createdBy: { id: string; name: string | null; email: string };
  reviewedBy: { id: string; name: string | null; email: string } | null;
};
