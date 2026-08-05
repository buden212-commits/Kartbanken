"use client";

import { useState, useTransition } from "react";

type Props = {
  initialNotifications: boolean;
  initialOcdAttachment: boolean;
};

export function UserNotificationPreferences({
  initialNotifications,
  initialOcdAttachment,
}: Props) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [ocdAttachment, setOcdAttachment] = useState(initialOcdAttachment);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(nextNotifications: boolean, nextOcdAttachment: boolean) {
    setError(null);
    setSaved(false);
    const prevNotifications = notifications;
    const prevOcdAttachment = ocdAttachment;
    const effectiveOcd = nextNotifications && nextOcdAttachment;
    setNotifications(nextNotifications);
    setOcdAttachment(effectiveOcd);

    startTransition(async () => {
      try {
        const res = await fetch("/api/user/notification-preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiveNotifications: nextNotifications,
            receiveOcdAttachment: effectiveOcd,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error ?? "Kunde inte spara notisinställningar");
        }
        setSaved(true);
      } catch (err) {
        setNotifications(prevNotifications);
        setOcdAttachment(prevOcdAttachment);
        setError(err instanceof Error ? err.message : "Kunde inte spara notisinställningar");
      }
    });
  }

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={notifications}
          disabled={pending}
          onChange={(e) => save(e.target.checked, ocdAttachment)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-ifk-blue focus:ring-ifk-blue/20 disabled:opacity-50"
        />
        <span>
          <span className="font-medium text-slate-900">E-postnotiser</span>
          <span className="mt-0.5 block text-slate-600">
            Få e-post vid nya kartuppladdningar, utcheckningar, incheckningar och andra
            händelser i systemet.
          </span>
        </span>
      </label>
      <label
        className={`flex items-start gap-3 text-sm ${
          notifications ? "cursor-pointer text-slate-700" : "cursor-not-allowed text-slate-400"
        }`}
      >
        <input
          type="checkbox"
          checked={notifications && ocdAttachment}
          disabled={pending || !notifications}
          onChange={(e) => save(notifications, e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-ifk-blue focus:ring-ifk-blue/20 disabled:opacity-50"
        />
        <span>
          <span className="font-medium">Bifoga kartfil (.ocd)</span>
          <span className="mt-0.5 block text-slate-600">
            Bifoga kartfilen i e-post när det är möjligt (t.ex. vid incheckning).
          </span>
        </span>
      </label>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {saved && !error && !pending && (
        <p className="text-sm text-emerald-700">Notisinställningarna sparades.</p>
      )}
    </div>
  );
}
