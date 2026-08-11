"use client";

import { useState } from "react";
import type { SmtpSettingsPublic } from "@/lib/settings/app-settings";
import { SMTP_PASS_PLACEHOLDER } from "@/lib/settings/app-settings";

type Props = {
  initialSettings: SmtpSettingsPublic;
};

type SaveState = {
  ok: boolean;
  message: string;
} | null;

export function SmtpSettingsForm({ initialSettings }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [saveState, setSaveState] = useState<SaveState>(null);
  const [testState, setTestState] = useState<SaveState>(null);
  const [testAttachmentState, setTestAttachmentState] = useState<SaveState>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingAttachment, setTestingAttachment] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveState(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      smtpHost: formData.get("smtpHost")?.toString() ?? "",
      smtpPort: Number(formData.get("smtpPort") ?? 587),
      smtpUser: formData.get("smtpUser")?.toString() ?? "",
      smtpPass: formData.get("smtpPass")?.toString() ?? "",
      adminNotificationEmail: formData.get("adminNotificationEmail")?.toString() ?? "",
      checkoutReminderDays: Number(formData.get("checkoutReminderDays") ?? 7),
      checkoutReminderRepeatDays: Number(formData.get("checkoutReminderRepeatDays") ?? 7),
      enabled: formData.get("enabled") === "on",
    };

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as SmtpSettingsPublic & { error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? "Kunde inte spara inställningarna");
      }

      setSettings(data);
      setSaveState({ ok: true, message: "Inställningarna sparades." });
    } catch (error) {
      setSaveState({
        ok: false,
        message: error instanceof Error ? error.message : "Kunde inte spara inställningarna",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestEmail(withAttachment: boolean) {
    const setState = withAttachment ? setTestAttachmentState : setTestState;
    const setLoading = withAttachment ? setTestingAttachment : setTesting;

    setLoading(true);
    setState(null);

    try {
      const res = await fetch("/api/admin/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withAttachment }),
      });

      const data = (await res.json()) as { error?: string; message?: string };

      if (!res.ok) {
        throw new Error(data.error ?? "Kunde inte skicka testmail");
      }

      setState({
        ok: true,
        message: data.message ?? "Testmail skickades.",
      });
    } catch (error) {
      setState({
        ok: false,
        message: error instanceof Error ? error.message : "Kunde inte skicka testmail",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        key={`${settings.enabled}-${settings.smtpHost}-${settings.smtpPort}-${settings.smtpUser}-${settings.hasPassword}-${settings.adminNotificationEmail}-${settings.checkoutReminderDays}-${settings.checkoutReminderRepeatDays}`}
        onSubmit={(event) => void handleSubmit(event)}
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={settings.enabled}
              className="h-4 w-4 rounded border-slate-300 text-ifk-blue focus:ring-ifk-blue/20"
            />
            <span>Aktivera e-post via databasinställningar</span>
          </label>
          <p className="mt-1 text-xs text-slate-500">
            När aktiverat används värdena här i stället för .env. Annars används .env som reserv.
          </p>
        </div>

        <div>
          <label htmlFor="smtpHost" className="form-label">
            SMTP-server
          </label>
          <input
            id="smtpHost"
            name="smtpHost"
            type="text"
            required
            defaultValue={settings.smtpHost}
            className="form-input"
            placeholder="smtp.gmail.com"
          />
        </div>

        <div>
          <label htmlFor="smtpPort" className="form-label">
            Port
          </label>
          <input
            id="smtpPort"
            name="smtpPort"
            type="number"
            required
            min={1}
            max={65535}
            defaultValue={settings.smtpPort}
            className="form-input"
          />
        </div>

        <div>
          <label htmlFor="smtpUser" className="form-label">
            SMTP-användare (Gmail-adress)
          </label>
          <input
            id="smtpUser"
            name="smtpUser"
            type="email"
            defaultValue={settings.smtpUser}
            className="form-input"
            placeholder="ditt@gmail.com"
          />
        </div>

        <div>
          <label htmlFor="smtpPass" className="form-label">
            App-lösenord
          </label>
          <input
            id="smtpPass"
            name="smtpPass"
            type="password"
            className="form-input"
            placeholder={settings.hasPassword ? SMTP_PASS_PLACEHOLDER : "App-lösenord från Google"}
            autoComplete="new-password"
          />
          {settings.hasPassword && (
            <p className="mt-1 text-xs text-slate-500">
              Lämna tomt för att behålla sparat lösenord.
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="adminNotificationEmail" className="form-label">
            Admin-notis e-post
          </label>
          <textarea
            id="adminNotificationEmail"
            name="adminNotificationEmail"
            rows={3}
            defaultValue={settings.adminNotificationEmail}
            className="form-input min-h-[5.5rem] resize-y"
            placeholder="admin@example.com, redaktion@example.com"
          />
          <p className="mt-1 text-xs text-slate-500">
            En eller flera adresser, separerade med komma, semikolon eller radbrytning. Huvudmottagare
            för notiser och kartkopior (.ocd) vid nya versioner om inget annat anges per användare.
            Notisprenumeranter hanteras under Admin → Användare. Om tomt används INITIAL_ADMIN_EMAIL
            från .env.
          </p>
        </div>

        <div>
          <label htmlFor="checkoutReminderDays" className="form-label">
            Utcheckningspåminnelse (dagar)
          </label>
          <input
            id="checkoutReminderDays"
            name="checkoutReminderDays"
            type="number"
            required
            min={1}
            max={365}
            defaultValue={settings.checkoutReminderDays}
            className="form-input"
          />
          <p className="mt-1 text-xs text-slate-500">
            Första påminnelsen skickas när en utcheckning varit aktiv (eller väntat på admin) minst
            så här många dagar.
          </p>
        </div>

        <div>
          <label htmlFor="checkoutReminderRepeatDays" className="form-label">
            Upprepa påminnelse (dagar)
          </label>
          <input
            id="checkoutReminderRepeatDays"
            name="checkoutReminderRepeatDays"
            type="number"
            required
            min={1}
            max={365}
            defaultValue={settings.checkoutReminderRepeatDays}
            className="form-input"
          />
          <p className="mt-1 text-xs text-slate-500">
            Ny påminnelse skickas med detta intervall tills utcheckningen är incheckad, integrerad
            eller avbruten.
          </p>
        </div>

        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Sparar…" : "Spara inställningar"}
          </button>
          {saveState && (
            <p className={`text-sm ${saveState.ok ? "text-emerald-700" : "text-red-600"}`}>
              {saveState.message}
            </p>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h3 className="text-sm font-medium text-blue-950">Gmail — app-lösenord krävs</h3>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-blue-900">
          <li>Logga in på ditt Google-konto → Säkerhet</li>
          <li>Aktivera verifiering i två steg (om den inte redan är på)</li>
          <li>Sök efter «App-lösenord» och skapa ett nytt för «Mail»</li>
          <li>Kopiera de 16 tecknen (utan mellanslag) till fältet App-lösenord ovan</li>
          <li>SMTP-användare ska vara samma Gmail-adress som app-lösenordet skapades för</li>
        </ol>
        <p className="mt-2 text-sm text-blue-900">
          Felmeddelandet «Application-specific password required» betyder att vanligt lösenord
          används i stället för app-lösenord.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h3 className="text-sm font-medium text-amber-950">Hamnar mailet i skräppost?</h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-900">
          <li>Markera mailet som «Inte skräppost» i Gmail (flyttar framtida meddelanden till inkorgen)</li>
          <li>Lägg till avsändaren i dina kontakter</li>
          <li>
            För produktion på kartor.ifkmora.se: överväg Google Workspace med egen domän och
            SPF/DKIM — personlig Gmail kan alltid ge viss skräppostrisk
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-medium text-slate-900">Testa e-post</h3>
        <p className="mt-1 text-sm text-slate-600">
          Skickar testmail till alla angivna admin-notisadresser. Använd bifogningstestet för att
          verifiera att .ocd-filer följer med i notiser.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleTestEmail(false)}
            disabled={testing || testingAttachment}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {testing ? "Skickar…" : "Skicka testmail"}
          </button>
          <button
            type="button"
            onClick={() => void handleTestEmail(true)}
            disabled={testing || testingAttachment}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {testingAttachment ? "Skickar…" : "Skicka testmail med bifogad fil"}
          </button>
          {testState && (
            <p className={`text-sm ${testState.ok ? "text-emerald-700" : "text-red-600"}`}>
              {testState.message}
            </p>
          )}
          {testAttachmentState && (
            <p
              className={`text-sm ${testAttachmentState.ok ? "text-emerald-700" : "text-red-600"}`}
            >
              {testAttachmentState.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
