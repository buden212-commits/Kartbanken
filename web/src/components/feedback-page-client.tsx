"use client";

import { FeedbackSubmitForm } from "@/components/feedback-submit-form";
import { FeedbackList } from "@/components/feedback-list";
import type { FeedbackListItem } from "@/lib/feedback/types";
import { FeedbackType } from "@/lib/feedback/types";

type Props = {
  initialItems: FeedbackListItem[];
  type: typeof FeedbackType.BUG | typeof FeedbackType.IMPROVEMENT;
  showVote?: boolean;
};

export function FeedbackPageClient({ initialItems, type, showVote = false }: Props) {
  return (
    <div className="space-y-10">
      <FeedbackSubmitForm type={type} />
      <section>
        <h2 className="text-lg font-medium text-slate-900">
          {type === FeedbackType.BUG ? "Inskickade buggar" : "Förbättringsförslag"}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {type === FeedbackType.IMPROVEMENT
            ? "Rösta med tumme upp på förslag du vill prioritera. En röst per person."
            : "Alla godkända användare kan rapportera buggar. Admin kvitterar när de är hanterade."}
        </p>
        <div className="mt-4">
          <FeedbackList initialItems={initialItems} type={type} showVote={showVote} />
        </div>
      </section>
    </div>
  );
}
