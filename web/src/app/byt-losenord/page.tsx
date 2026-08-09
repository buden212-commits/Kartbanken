import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/change-password-form";
import { HelpLinkIcon } from "@/components/help-link-icon";

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!session.user.mustChangePassword) {
    redirect("/");
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-6">
      <main className="card w-full max-w-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="page-eyebrow">Säkerhet</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Byt lösenord</h1>
            <p className="mt-3 text-sm text-slate-600">
              Du har loggat in med ett tillfälligt lösenord. Välj ett nytt lösenord innan du fortsätter
              (minst 8 tecken).
            </p>
          </div>
          <HelpLinkIcon section="kom-igang" className="mt-1 shrink-0" />
        </div>
        <div className="mt-8">
          <ChangePasswordForm requireCurrentPassword={false} />
        </div>
      </main>
    </div>
  );
}
