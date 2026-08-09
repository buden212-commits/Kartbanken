import { auth } from "@/auth";
import { FeedbackPageClient } from "@/components/feedback-page-client";
import { HelpNav } from "@/components/help-nav";
import { listFeedback } from "@/lib/feedback/repository";
import { FeedbackType } from "@/lib/feedback/types";

export default async function HelpBugsPage() {
  const session = await auth();
  const items = await listFeedback({
    type: FeedbackType.BUG,
    status: "all",
    currentUserId: session?.user?.id,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="page-eyebrow">Hjälp · Feedback</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Rapportera bugg</h1>
      <p className="mt-3 text-slate-600">
        Rapportera fel i tjänsten (inte terrängändringar på kartan — det görs via{" "}
        <strong>Kartförslag</strong>).
      </p>

      <div className="mt-8">
        <HelpNav active="buggar" />
      </div>

      <div className="mt-10">
        <FeedbackPageClient initialItems={items} type={FeedbackType.BUG} />
      </div>
    </div>
  );
}
