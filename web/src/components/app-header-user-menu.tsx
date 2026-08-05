"use client";

import { useState } from "react";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { roleLabel } from "@/lib/auth/permissions";
import type { Role } from "@/lib/roles";

type Props = {
  name: string | null | undefined;
  email: string;
  role: Role;
};

export function AppHeaderUserMenu({ name, email, role }: Props) {
  const [open, setOpen] = useState(false);
  const displayName = name?.trim() || email;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-md px-1 py-0.5 text-white/80 transition hover:bg-white/10 hover:text-white"
        title={`${displayName} (${roleLabel(role)}) — klicka för att byta lösenord`}
      >
        {displayName}
      </button>
      <ChangePasswordDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
