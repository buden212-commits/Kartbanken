import { auth } from "@/auth";
import { AdminNav } from "@/components/admin-nav";
import { SmtpSettingsForm } from "@/components/smtp-settings-form";
import { HelpSectionHeading } from "@/components/help-link-icon";
import { canAdmin } from "@/lib/auth/permissions";
import { getSmtpSettingsPublic } from "@/lib/settings/app-settings";
import { redirect } from "next/navigation";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session || !canAdmin(session.user.role)) {
    redirect("/");
  }

  const settings = await getSmtpSettingsPublic();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="page-eyebrow">Administration</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Inställningar</h1>
      <p className="mt-2 text-sm text-slate-600">
        Konfigurera SMTP för e-postnotiser från systemet.
      </p>

      <AdminNav active="settings" />

      <section className="card mt-8">
        <HelpSectionHeading section="admin">E-post (SMTP)</HelpSectionHeading>
        <p className="mt-1 text-sm text-slate-600">
          För Gmail krävs ett app-lösenord om tvåfaktorsautentisering är aktiverat.
        </p>
        <div className="mt-6">
          <SmtpSettingsForm initialSettings={settings} />
        </div>
      </section>
    </div>
  );
}
