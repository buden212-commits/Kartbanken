import {
  FeedbackStatus,
  FeedbackType,
  type FeedbackTypeValue,
} from "@/lib/feedback/types";

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;
const MAX_STEPS = 3000;
const MAX_ADMIN_COMMENT = 2000;

export function validateFeedbackTitle(title: unknown): string | null {
  if (typeof title !== "string") return "Titel krävs";
  const trimmed = title.trim();
  if (trimmed.length < 3) return "Titel måste vara minst 3 tecken";
  if (trimmed.length > MAX_TITLE) return `Titel får vara högst ${MAX_TITLE} tecken`;
  return null;
}

export function validateFeedbackDescription(description: unknown): string | null {
  if (typeof description !== "string") return "Beskrivning krävs";
  const trimmed = description.trim();
  if (trimmed.length < 10) return "Beskrivning måste vara minst 10 tecken";
  if (trimmed.length > MAX_DESCRIPTION) {
    return `Beskrivning får vara högst ${MAX_DESCRIPTION} tecken`;
  }
  return null;
}

export function validateFeedbackSteps(steps: unknown, type: FeedbackTypeValue): string | null {
  if (type !== FeedbackType.BUG) return null;
  if (steps == null || steps === "") return null;
  if (typeof steps !== "string") return "Ogiltiga reproduktionssteg";
  if (steps.trim().length > MAX_STEPS) {
    return `Reproduktionssteg får vara högst ${MAX_STEPS} tecken`;
  }
  return null;
}

export function validateFeedbackType(type: unknown): FeedbackTypeValue | null {
  if (type === FeedbackType.BUG || type === FeedbackType.IMPROVEMENT) return type;
  return null;
}

export function validateFeedbackAdminStatus(
  type: FeedbackTypeValue,
  status: unknown,
): string | null {
  if (typeof status !== "string") return "Status krävs";

  const allowed: string[] =
    type === FeedbackType.BUG
      ? [
          FeedbackStatus.IN_PROGRESS,
          FeedbackStatus.FIXED,
          FeedbackStatus.REJECTED,
          FeedbackStatus.DUPLICATE,
          FeedbackStatus.CANNOT_REPRODUCE,
        ]
      : [
          FeedbackStatus.IN_PROGRESS,
          FeedbackStatus.BUILT,
          FeedbackStatus.REJECTED,
          FeedbackStatus.DUPLICATE,
        ];

  if (!allowed.includes(status)) {
    return "Ogiltig status för denna typ";
  }
  return null;
}

export function validateAdminComment(comment: unknown): string | null {
  if (comment == null || comment === "") return null;
  if (typeof comment !== "string") return "Ogiltig admin-kommentar";
  if (comment.trim().length > MAX_ADMIN_COMMENT) {
    return `Admin-kommentar får vara högst ${MAX_ADMIN_COMMENT} tecken`;
  }
  return null;
}

export function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
