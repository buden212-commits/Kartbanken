"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Role } from "@/lib/roles";
import { canSubscribeToNotifications } from "@/lib/settings/notification-recipients";

export type EditableUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  receiveNotifications: boolean;
  receiveOcdAttachment: boolean;
};

type UpdateResult = { ok: true } | { ok: false; error: string };

type Props = {
  user: EditableUser;
  currentUserId: string;
  updateUser: (formData: FormData) => Promise<UpdateResult>;
};

export function AdminUserEditForm({ user, currentUserId, updateUser }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isSelf = user.id === currentUserId;
  const canSubscribe = canSubscribeToNotifications(user.role);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateUser(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
      >
        Redigera
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left"
    >
      <input type="hidden" name="userId" value={user.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="form-label" htmlFor={`edit-name-${user.id}`}>
            Namn
          </label>
          <input
            id={`edit-name-${user.id}`}
            name="name"
            type="text"
            defaultValue={user.name ?? ""}
            disabled={pending}
            className="form-input"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="form-label" htmlFor={`edit-email-${user.id}`}>
            E-post
          </label>
          <input
            id={`edit-email-${user.id}`}
            name="email"
            type="email"
            required
            defaultValue={user.email}
            disabled={pending}
            className="form-input"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="form-label" htmlFor={`edit-role-${user.id}`}>
            Roll
          </label>
          <select
            id={`edit-role-${user.id}`}
            name="role"
            required
            defaultValue={user.role}
            disabled={pending || isSelf}
            className="form-select"
          >
            <option value={Role.READER}>Läsare</option>
            <option value={Role.EDITOR}>Redaktör</option>
            <option value={Role.ADMIN}>Administratör</option>
            <option value={Role.PENDING}>Väntar godkännande</option>
            <option value={Role.REJECTED}>Avvisad</option>
          </select>
          {isSelf && (
            <p className="mt-1 text-xs text-slate-500">Du kan inte ändra din egen roll.</p>
          )}
          {isSelf && <input type="hidden" name="role" value={user.role} />}
        </div>
        <div>
          <label className="form-label" htmlFor={`edit-password-${user.id}`}>
            Nytt lösenord
          </label>
          <input
            id={`edit-password-${user.id}`}
            name="password"
            type="password"
            minLength={8}
            disabled={pending}
            className="form-input"
            autoComplete="new-password"
            placeholder="Lämna tomt för att behålla"
          />
          <p className="mt-1 text-xs text-slate-500">
            Lösenordet visas aldrig. Fyll i bara om du vill byta det.
          </p>
        </div>
        {canSubscribe && (
          <div className="sm:col-span-2 space-y-2">
            <label className="inline-flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="receiveNotifications"
                defaultChecked={user.receiveNotifications}
                disabled={pending}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-ifk-blue focus:ring-ifk-blue/20"
              />
              <span>
                <span className="font-medium text-slate-900">Notisprenumerant</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Får e-post när nya kartversioner laddas upp.
                </span>
              </span>
            </label>
            <label className="inline-flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="receiveOcdAttachment"
                defaultChecked={user.receiveOcdAttachment}
                disabled={pending || !user.receiveNotifications}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-ifk-blue focus:ring-ifk-blue/20 disabled:opacity-50"
              />
              <span>
                <span className="font-medium text-slate-900">Bifoga kartfil (.ocd)</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Kartfilen bifogas i e-postnotisen. Kräver att notisprenumeration är aktiverad.
                </span>
              </span>
            </label>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn-primary py-1.5 text-sm">
          {pending ? "Sparar…" : "Spara"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Avbryt
        </button>
      </div>
    </form>
  );
}
