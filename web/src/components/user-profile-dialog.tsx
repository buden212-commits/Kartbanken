"use client";

import { ChangePasswordForm } from "@/components/change-password-form";
import { HelpLinkIcon } from "@/components/help-link-icon";
import { UserNotificationPreferences } from "@/components/user-notification-preferences";
import { roleDescription, roleLabel, canReceiveOcdAttachment } from "@/lib/auth/permissions";
import { canSubscribeToNotifications } from "@/lib/settings/notification-recipients";
import type { Role } from "@/lib/roles";

type Props = {
  open: boolean;
  onClose: () => void;
  name: string | null | undefined;
  email: string;
  role: Role;
  receiveNotifications: boolean;
  receiveOcdAttachment: boolean;
};

export function UserProfileDialog({
  open,
  onClose,
  name,
  email,
  role,
  receiveNotifications,
  receiveOcdAttachment,
}: Props) {
  if (!open) return null;

  const displayName = name?.trim() || email;
  const canManageNotifications = canSubscribeToNotifications(role);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-medium text-slate-900">Min profil</h3>
            <p className="mt-1 text-sm text-slate-600">{displayName}</p>
            {name?.trim() && <p className="text-sm text-slate-500">{email}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <HelpLinkIcon section="kom-igang" />
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Stäng"
            >
              ✕
            </button>
          </div>
        </div>

        <section className="mt-6 border-t border-slate-200 pt-5">
          <h4 className="text-sm font-semibold text-slate-900">Behörighet</h4>
          <p className="mt-2 text-sm text-slate-700">
            Din roll: <strong>{roleLabel(role)}</strong>
          </p>
          {roleDescription(role) && (
            <p className="mt-2 text-sm text-slate-600">{roleDescription(role)}</p>
          )}
        </section>

        {canManageNotifications && (
          <section className="mt-6 border-t border-slate-200 pt-5">
            <h4 className="text-sm font-semibold text-slate-900">Notiser</h4>
            <p className="mt-1 text-sm text-slate-600">
              Välj om du vill få e-post vid händelser i systemet.
            </p>
            <div className="mt-3">
              <UserNotificationPreferences
                initialNotifications={receiveNotifications}
                initialOcdAttachment={receiveOcdAttachment}
                showOcdAttachment={canReceiveOcdAttachment(role)}
              />
            </div>
          </section>
        )}

        <section className="mt-6 border-t border-slate-200 pt-5">
          <h4 className="text-sm font-semibold text-slate-900">Lösenord</h4>
          <p className="mt-1 text-sm text-slate-600">
            Byt ditt lösenord (minst 8 tecken).
          </p>
          <div className="mt-3">
            <ChangePasswordForm requireCurrentPassword onSuccess={onClose} onCancel={onClose} />
          </div>
        </section>
      </div>
    </div>
  );
}
