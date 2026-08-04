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
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

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

  async function handleTestEmail() {
    setTesting(true);
    setTestState(null);

    try {
      const res = await fetch("/api/admin/settings/test-email", {
        method: "POST",
      });

      const data = (await res.json()) as { error?: string; message?: string };

      if (!res.ok) {
        throw new Error(data.error ?? "Kunde inte skicka testmail");
      }

      setTestState({
        ok: true,
        message: data.message ?? "Testmail skickades.",
      });
    } catch (error) {
      setTestState({
        ok: false,
        message: error instanceof Error ? error.message : "Kunde inte skicka testmail",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        key={`${settings.enabled}-${settings.smtpHost}-${settings.smtpPort}-${settings.smtpUser}-${settings.hasPassword}-${settings.adminNotificationEmail}`}
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
          <input
            id="adminNotificationEmail"
            name="adminNotificationEmail"
            type="email"
            defaultValue={settings.adminNotificationEmail}
            className="form-input"
            placeholder="admin@example.com"
          />
          <p className="mt-1 text-xs text-slate-500">
            Huvudmottagare för notiser och kartkopior (.ocd) vid nya versioner om inget annat anges
            per användare. Notisprenumeranter hanteras under Admin → Användare. Om tomt används
            INITIAL_ADMIN_EMAIL från .env.
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
          Skickar ett testmail till admin-notisadressen med aktuella inställningar.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleTestEmail()}
            disabled={testing}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {testing ? "Skickar…" : "Skicka testmail"}
          </button>
          {testState && (
            <p className={`text-sm ${testState.ok ? "text-emerald-700" : "text-red-600"}`}>
              {testState.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
