"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  userId: string;
  initialNotifications: boolean;
  initialOcdAttachment: boolean;
  showOcdAttachment?: boolean;
  disabled?: boolean;
  updateAction: (formData: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export function AdminUserNotificationToggle({
  userId,
  initialNotifications,
  initialOcdAttachment,
  showOcdAttachment = true,
  disabled = false,
  updateAction,
}: Props) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [ocdAttachment, setOcdAttachment] = useState(initialOcdAttachment);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(nextNotifications: boolean, nextOcdAttachment: boolean) {
    setError(null);
    const prevNotifications = notifications;
    const prevOcdAttachment = ocdAttachment;
    setNotifications(nextNotifications);
    setOcdAttachment(nextNotifications ? nextOcdAttachment : false);

    const formData = new FormData();
    formData.set("userId", userId);
    formData.set("receiveNotifications", nextNotifications ? "true" : "false");
    formData.set(
      "receiveOcdAttachment",
      nextNotifications && nextOcdAttachment ? "true" : "false",
    );

    startTransition(async () => {
      const result = await updateAction(formData);
      if (!result.ok) {
        setNotifications(prevNotifications);
        setOcdAttachment(prevOcdAttachment);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <label
        className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-700"
        title="Får e-post när nya kartversioner laddas upp"
      >
        <input
          type="checkbox"
          checked={notifications}
          disabled={disabled || pending}
          onChange={(e) => save(e.target.checked, ocdAttachment)}
          className="h-4 w-4 rounded border-slate-300 text-ifk-blue focus:ring-ifk-blue/20 disabled:opacity-50"
        />
        <span className="whitespace-nowrap">Notis</span>
      </label>
      {showOcdAttachment && (
      <label
        className={`inline-flex items-center gap-2 text-xs ${
          notifications ? "cursor-pointer text-slate-700" : "cursor-not-allowed text-slate-400"
        }`}
        title="Bifoga kartfilen (.ocd) i e-postnotisen"
      >
        <input
          type="checkbox"
          checked={notifications && ocdAttachment}
          disabled={disabled || pending || !notifications}
          onChange={(e) => save(notifications, e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-ifk-blue focus:ring-ifk-blue/20 disabled:opacity-50"
        />
        <span className="whitespace-nowrap">Bifoga .ocd</span>
      </label>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
