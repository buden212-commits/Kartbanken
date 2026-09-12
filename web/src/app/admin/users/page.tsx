import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { AdminNav } from "@/components/admin-nav";
import { AdminUserEditForm, AdminUserEditTableRow } from "@/components/admin-user-edit-form";
import { AdminUserNotificationToggle } from "@/components/admin-user-notification-toggle";
import { HelpLinkIcon, HelpSectionHeading } from "@/components/help-link-icon";
import { logAction } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { canAdmin, canReceiveOcdAttachment, roleLabel } from "@/lib/auth/permissions";
import { queueNotifyUserApproved } from "@/lib/email";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { Role, type Role as RoleType } from "@/lib/roles";
import {
  canSubscribeToNotifications,
  setUserNotificationPreferences,
} from "@/lib/settings/notification-recipients";
import { redirect } from "next/navigation";

const ASSIGNABLE_ROLES: RoleType[] = [
  Role.READER,
  Role.EDITOR,
  Role.ADMIN,
  Role.PENDING,
  Role.REJECTED,
];

const APPROVE_ROLES: RoleType[] = [Role.READER, Role.EDITOR, Role.ADMIN];

const userListSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  lastLoginAt: true,
  receiveNotifications: true,
  receiveOcdAttachment: true,
  canFieldEdit: true,
} as const;

type ListedUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  receiveNotifications: boolean;
  receiveOcdAttachment: boolean;
  canFieldEdit: boolean;
};

async function requireAdmin() {
  const session = await auth();
  if (!session || !canAdmin(session.user.role)) {
    redirect("/");
  }
  return session;
}

function isRole(value: string | undefined, allowed: RoleType[]): value is RoleType {
  return !!value && (allowed as string[]).includes(value);
}

function formatLastLogin(lastLoginAt: Date | null): string {
  if (!lastLoginAt) return "Aldrig";
  return formatDate(lastLoginAt);
}

async function createUser(formData: FormData) {
  "use server";
  const session = await requireAdmin();

  const name = formData.get("name")?.toString().trim() || null;
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();
  const role = formData.get("role")?.toString() as RoleType;

  if (!email || !password) {
    return;
  }

  if (!isRole(role, APPROVE_ROLES)) {
    return;
  }

  if (password.length < 8) {
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return;
  }

  const passwordHash = await hashPassword(password);

  const created = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      approvedAt: new Date(),
      approvedById: session.user.id,
    },
  });

  await logAction(session.user.id, "USER_CREATED", "User", created.id, { email, role });

  revalidatePath("/admin/users");
}

async function approveUser(formData: FormData) {
  "use server";
  const session = await requireAdmin();

  const userId = formData.get("userId")?.toString();
  const role = formData.get("role")?.toString() as RoleType;

  if (!userId) return;
  if (!isRole(role, APPROVE_ROLES)) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true, name: true },
  });
  if (!user || user.role !== Role.PENDING) return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      role,
      approvedAt: new Date(),
      approvedById: session.user.id,
    },
  });

  queueNotifyUserApproved({ email: user.email, name: user.name, role });

  await logAction(session.user.id, "ROLE_CHANGE", "User", userId, {
    from: Role.PENDING,
    to: role,
    action: "approve",
  });

  revalidatePath("/admin/users");
}

async function rejectUser(formData: FormData) {
  "use server";
  const session = await requireAdmin();

  const userId = formData.get("userId")?.toString();
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user || user.role !== Role.PENDING) return;

  await prisma.user.update({
    where: { id: userId },
    data: { role: Role.REJECTED },
  });

  await logAction(session.user.id, "ROLE_CHANGE", "User", userId, {
    from: Role.PENDING,
    to: Role.REJECTED,
    action: "reject",
  });

  revalidatePath("/admin/users");
}

async function deleteUser(formData: FormData) {
  "use server";
  const session = await requireAdmin();

  const userId = formData.get("userId")?.toString();
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true },
  });
  if (!user || user.role !== Role.PENDING) return;

  await prisma.user.delete({ where: { id: userId } });
  await logAction(session.user.id, "USER_DELETED", "User", userId, { email: user.email });

  revalidatePath("/admin/users");
}

async function updateUserNotificationPreferences(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  "use server";
  const session = await requireAdmin();

  const userId = formData.get("userId")?.toString();
  const receiveNotifications = formData.get("receiveNotifications") === "true";
  const receiveOcdAttachment = formData.get("receiveOcdAttachment") === "true";

  if (!userId) {
    return { ok: false, error: "Användare saknas" };
  }

  try {
    await setUserNotificationPreferences(userId, {
      receiveNotifications,
      receiveOcdAttachment,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Kunde inte uppdatera notisinställningar",
    };
  }

  await logAction(session.user.id, "USER_NOTIFICATIONS_UPDATED", "User", userId, {
    receiveNotifications,
    receiveOcdAttachment,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

async function updateUser(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  "use server";
  const session = await requireAdmin();

  const userId = formData.get("userId")?.toString();
  const nameRaw = formData.get("name")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const role = formData.get("role")?.toString();
  const password = formData.get("password")?.toString() ?? "";

  if (!userId) {
    return { ok: false, error: "Användare saknas" };
  }
  if (!email) {
    return { ok: false, error: "E-post krävs" };
  }
  if (!isRole(role, ASSIGNABLE_ROLES)) {
    return { ok: false, error: "Ogiltig roll" };
  }
  if (password && password.length < 8) {
    return { ok: false, error: "Lösenordet måste vara minst 8 tecken" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, receiveNotifications: true, receiveOcdAttachment: true, canFieldEdit: true },
  });
  if (!user) {
    return { ok: false, error: "Användaren hittades inte" };
  }

  const nextRole = userId === session.user.id ? (user.role as RoleType) : role;
  if (userId === session.user.id && role !== user.role) {
    return { ok: false, error: "Du kan inte ändra din egen roll" };
  }

  if (email !== user.email) {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing && existing.id !== userId) {
      return { ok: false, error: "E-postadressen används redan" };
    }
  }

  if (user.role === Role.ADMIN && nextRole !== Role.ADMIN) {
    const adminCount = await prisma.user.count({ where: { role: Role.ADMIN } });
    if (adminCount <= 1) {
      return { ok: false, error: "Det måste finnas minst en administratör" };
    }
  }

  const name = nameRaw || null;
  const receiveNotifications =
    canSubscribeToNotifications(nextRole) && formData.get("receiveNotifications") === "on";
  const receiveOcdAttachment =
    receiveNotifications &&
    canReceiveOcdAttachment(nextRole) &&
    formData.get("receiveOcdAttachment") === "on";
  const canFieldEditGranted =
    (nextRole === Role.READER || nextRole === Role.EDITOR) &&
    formData.get("canFieldEdit") === "on";
  const data: {
    name: string | null;
    email: string;
    role: RoleType;
    passwordHash?: string;
    approvedAt?: Date | null;
    approvedById?: string | null;
    receiveNotifications: boolean;
    receiveOcdAttachment: boolean;
    canFieldEdit: boolean;
  } = {
    name,
    email,
    role: nextRole,
    receiveNotifications,
    receiveOcdAttachment,
    canFieldEdit: nextRole === Role.ADMIN ? true : canFieldEditGranted,
  };

  if (password) {
    data.passwordHash = await hashPassword(password);
  }

  const becomingApproved =
    (user.role === Role.PENDING || user.role === Role.REJECTED) &&
    (nextRole === Role.READER || nextRole === Role.EDITOR || nextRole === Role.ADMIN);
  if (becomingApproved) {
    data.approvedAt = new Date();
    data.approvedById = session.user.id;
  }

  await prisma.user.update({
    where: { id: userId },
    data,
  });

  if (
    becomingApproved &&
    (user.role === Role.PENDING || user.role === Role.REJECTED)
  ) {
    queueNotifyUserApproved({ email, name, role: nextRole });
  }

  await logAction(session.user.id, "USER_UPDATED", "User", userId, {
    previous: {
      name: user.name,
      email: user.email,
      role: user.role,
      receiveNotifications: user.receiveNotifications,
      receiveOcdAttachment: user.receiveOcdAttachment,
      canFieldEdit: user.canFieldEdit,
    },
    next: { name, email, role: nextRole, receiveNotifications, receiveOcdAttachment, canFieldEdit: data.canFieldEdit },
    passwordChanged: Boolean(password),
  });

  if (user.role !== nextRole) {
    await logAction(session.user.id, "ROLE_CHANGE", "User", userId, {
      from: user.role,
      to: nextRole,
      action: "edit",
    });
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

function PendingBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
      {count} väntar på godkännande
    </span>
  );
}

function PendingActions({ user }: { user: ListedUser }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={approveUser} className="flex items-center gap-2">
        <input type="hidden" name="userId" value={user.id} />
        <select name="role" defaultValue={Role.READER} className="form-select !mt-0 py-1 text-xs">
          <option value={Role.READER}>Läsare</option>
          <option value={Role.EDITOR}>Redaktör</option>
          <option value={Role.ADMIN}>Admin</option>
        </select>
        <button type="submit" className="btn-primary py-1 text-xs">
          Godkänn
        </button>
      </form>
      <form action={rejectUser}>
        <input type="hidden" name="userId" value={user.id} />
        <button
          type="submit"
          className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          Avvisa
        </button>
      </form>
      <form action={deleteUser}>
        <input type="hidden" name="userId" value={user.id} />
        <button
          type="submit"
          className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
        >
          Radera
        </button>
      </form>
    </div>
  );
}

export default async function AdminUsersPage() {
  const session = await requireAdmin();

  const users = await prisma.user.findMany({
    select: userListSelect,
    orderBy: [{ createdAt: "desc" }],
  });

  const pendingUsers = users.filter((u) => u.role === Role.PENDING);
  const otherUsers = users.filter((u) => u.role !== Role.PENDING);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="page-eyebrow">Administration</p>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            Användarhantering
            <PendingBadge count={pendingUsers.length} />
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Godkänn registrerade konton, skapa konton manuellt eller redigera befintliga användare.
            Notisprenumeration för uppladdade kartfiler hanteras per användare. Lösenord visas aldrig.
          </p>
        </div>
        <HelpLinkIcon section="admin" className="mt-3 shrink-0" />
      </div>

      <AdminNav active="users" />

      {pendingUsers.length > 0 && (
        <section className="card mt-8 border-amber-200 bg-amber-50/50">
          <HelpSectionHeading section="admin">
            Väntar på godkännande ({pendingUsers.length})
          </HelpSectionHeading>
          <p className="mt-1 text-sm text-slate-600">
            Välj roll och godkänn, eller avvisa/radera kontot.
          </p>

          <ul className="mt-4 space-y-3 md:hidden">
            {pendingUsers.map((user) => (
              <li
                key={user.id}
                className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm"
              >
                <p className="font-medium text-slate-900">{user.name ?? "—"}</p>
                <p className="mt-1 break-all text-sm text-slate-600">{user.email}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Registrerad {user.createdAt.toLocaleDateString("sv-SE")} · Senaste inloggning{" "}
                  {formatLastLogin(user.lastLoginAt)}
                </p>
                <div className="mt-3 space-y-2">
                  <PendingActions user={user} />
                  <AdminUserEditForm
                    user={user}
                    currentUserId={session.user.id}
                    updateUser={updateUser}
                  />
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 hidden overflow-x-auto rounded-xl border border-amber-200 bg-white shadow-sm md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                  <th className="px-4 pb-2 pt-3 pr-4 font-medium">Namn</th>
                  <th className="pb-2 pt-3 pr-4 font-medium">E-post</th>
                  <th className="pb-2 pt-3 pr-4 font-medium">Registrerad</th>
                  <th className="pb-2 pt-3 pr-4 font-medium">Senaste inloggning</th>
                  <th className="px-4 pb-2 pt-3 font-medium">Åtgärder</th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.map((user) => (
                  <AdminUserEditTableRow
                    key={user.id}
                    colSpan={5}
                    user={user}
                    currentUserId={session.user.id}
                    updateUser={updateUser}
                    actionsCell={<PendingActions user={user} />}
                  >
                    <td className="px-4 py-2 pr-4">{user.name ?? "—"}</td>
                    <td className="py-2 pr-4">{user.email}</td>
                    <td className="py-2 pr-4 text-slate-500">
                      {user.createdAt.toLocaleDateString("sv-SE")}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{formatLastLogin(user.lastLoginAt)}</td>
                  </AdminUserEditTableRow>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card mt-8">
        <HelpSectionHeading section="admin">Skapa nytt konto</HelpSectionHeading>
        <p className="mt-1 text-sm text-slate-600">
          Skapa ett konto direkt med tilldelad roll (godkänns automatiskt).
        </p>
        <form action={createUser} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="form-label">
              Namn
            </label>
            <input id="name" name="name" type="text" className="form-input" autoComplete="off" />
          </div>
          <div>
            <label htmlFor="email" className="form-label">
              E-post *
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="form-input"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="password" className="form-label">
              Lösenord * (min 8 tecken)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="form-input"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label htmlFor="role" className="form-label">
              Roll *
            </label>
            <select id="role" name="role" required defaultValue={Role.READER} className="form-select">
              <option value={Role.READER}>Läsare — kan ladda ner</option>
              <option value={Role.EDITOR}>Redaktör — kan ladda upp</option>
              <option value={Role.ADMIN}>Administratör</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">
              Skapa konto
            </button>
          </div>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium text-slate-900">
          Användare ({otherUsers.length})
        </h2>
        <ul className="mt-4 space-y-3 md:hidden">
          {otherUsers.map((user) => (
            <li
              key={user.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="font-medium text-slate-900">{user.name ?? "—"}</p>
              <p className="mt-1 break-all text-sm text-slate-600">{user.email}</p>
              <p className="mt-2 text-xs text-slate-500">
                <span className="font-mono">{user.role}</span> ({roleLabel(user.role as RoleType)})
                {user.canFieldEdit && user.role !== Role.ADMIN && (
                  <span className="ml-2 text-ifk-blue">· Fältredigering</span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Skapad {user.createdAt.toLocaleDateString("sv-SE")} · Senaste inloggning{" "}
                {formatLastLogin(user.lastLoginAt)}
              </p>
              {canSubscribeToNotifications(user.role) && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium text-slate-500">Uppladdningsnotiser</p>
                  <AdminUserNotificationToggle
                    userId={user.id}
                    initialNotifications={user.receiveNotifications}
                    initialOcdAttachment={user.receiveOcdAttachment}
                    showOcdAttachment={canReceiveOcdAttachment(user.role as RoleType)}
                    updateAction={updateUserNotificationPreferences}
                  />
                </div>
              )}
              <div className="mt-3">
                <AdminUserEditForm
                  user={user}
                  currentUserId={session.user.id}
                  updateUser={updateUser}
                />
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <th className="px-4 pb-2 pt-3 pr-4 font-medium">Namn</th>
                <th className="pb-2 pt-3 pr-4 font-medium">E-post</th>
                <th className="pb-2 pt-3 pr-4 font-medium">Roll</th>
                <th className="pb-2 pt-3 pr-4 font-medium">Skapad</th>
                <th className="pb-2 pt-3 pr-4 font-medium">Senaste inloggning</th>
                <th className="pb-2 pt-3 pr-4 font-medium">Uppladdningsnotiser</th>
                <th className="px-4 pb-2 pt-3 font-medium">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {otherUsers.map((user) => (
                <AdminUserEditTableRow
                  key={user.id}
                  colSpan={7}
                  user={user}
                  currentUserId={session.user.id}
                  updateUser={updateUser}
                >
                  <td className="px-4 py-3 pr-4">{user.name ?? "—"}</td>
                  <td className="py-3 pr-4">{user.email}</td>
                  <td className="py-3 pr-4">
                    <span className="font-mono text-xs">{user.role}</span>
                    <span className="ml-2 text-slate-500">
                      ({roleLabel(user.role as RoleType)})
                    </span>
                    {user.canFieldEdit && user.role !== Role.ADMIN && (
                      <span className="ml-2 text-xs text-ifk-blue">Fältredigering</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-slate-500">
                    {user.createdAt.toLocaleDateString("sv-SE")}
                  </td>
                  <td className="py-3 pr-4 text-slate-500">{formatLastLogin(user.lastLoginAt)}</td>
                  <td className="py-3 pr-4">
                    {canSubscribeToNotifications(user.role) ? (
                      <AdminUserNotificationToggle
                        userId={user.id}
                        initialNotifications={user.receiveNotifications}
                        initialOcdAttachment={user.receiveOcdAttachment}
                        showOcdAttachment={canReceiveOcdAttachment(user.role as RoleType)}
                        updateAction={updateUserNotificationPreferences}
                      />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </AdminUserEditTableRow>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
