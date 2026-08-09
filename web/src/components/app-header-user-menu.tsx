"use client";

import { useState } from "react";
import { UserProfileDialog } from "@/components/user-profile-dialog";
import type { Role } from "@/lib/roles";

type Props = {
  name: string | null | undefined;
  email: string;
  role: Role;
  receiveNotifications: boolean;
  receiveOcdAttachment: boolean;
};

export function AppHeaderUserMenu({
  name,
  email,
  role,
  receiveNotifications,
  receiveOcdAttachment,
}: Props) {
  const [open, setOpen] = useState(false);
  const displayName = name?.trim() || email;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-md px-1 py-0.5 text-white/80 transition hover:bg-white/10 hover:text-white"
        title={`${displayName} — öppna profil`}
      >
        {displayName}
      </button>
      <UserProfileDialog
        open={open}
        onClose={() => setOpen(false)}
        name={name}
        email={email}
        role={role}
        receiveNotifications={receiveNotifications}
        receiveOcdAttachment={receiveOcdAttachment}
      />
    </>
  );
}
