import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminNav } from "@/components/admin-nav";
import { FeedbackList } from "@/components/feedback-list";
import { canAdmin } from "@/lib/auth/permissions";
import { listFeedback } from "@/lib/feedback/repository";
import { FeedbackType } from "@/lib/feedback/types";

export default async function AdminFeedbackPage() {
  const session = await auth();
  if (!session || !canAdmin(session.user.role)) {
    redirect("/");
  }

  const [bugs, improvements] = await Promise.all([
    listFeedback({ type: FeedbackType.BUG, status: "all" }),
    listFeedback({ type: FeedbackType.IMPROVEMENT, status: "all" }),
  ]);

  const openBugs = bugs.filter((b) => b.status === "OPEN" || b.status === "IN_PROGRESS").length;
  const openImprovements = improvements.filter(
    (i) => i.status === "OPEN" || i.status === "IN_PROGRESS",
  ).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="page-eyebrow">Administration</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Feedback</h1>
      <p className="mt-2 text-sm text-slate-600">
        Hantera buggar och förbättringsförslag från användare. {openBugs} öppna buggar,{" "}
        {openImprovements} öppna förbättringsförslag.
      </p>

      <AdminNav active="feedback" />

      <section className="mt-10">
        <h2 className="text-lg font-medium text-slate-900">Buggar</h2>
        <div className="mt-4">
          <FeedbackList initialItems={bugs} type={FeedbackType.BUG} adminMode />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-medium text-slate-900">Förbättringsförslag</h2>
        <div className="mt-4">
          <FeedbackList
            initialItems={improvements}
            type={FeedbackType.IMPROVEMENT}
            adminMode
          />
        </div>
      </section>
    </div>
  );
}
