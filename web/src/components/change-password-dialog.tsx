"use client";

import { ChangePasswordForm } from "@/components/change-password-form";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ChangePasswordDialog({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
        <h3 className="text-lg font-medium text-slate-900">Byt lösenord</h3>
        <p className="mt-2 text-sm text-slate-600">
          Ange nuvarande lösenord och välj ett nytt (minst 8 tecken).
        </p>
        <div className="mt-4">
          <ChangePasswordForm
            requireCurrentPassword
            onSuccess={onClose}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
