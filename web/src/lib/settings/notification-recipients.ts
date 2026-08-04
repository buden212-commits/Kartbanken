import { resolveAdminNotificationEmail } from "@/lib/settings/app-settings";
import { prisma } from "@/lib/prisma";
import { Role, type Role as RoleType } from "@/lib/roles";

export type NotificationUserOption = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  receiveNotifications: boolean;
  receiveOcdAttachment: boolean;
};

const SUBSCRIBABLE_ROLES: RoleType[] = [Role.READER, Role.EDITOR, Role.ADMIN];

export function canSubscribeToNotifications(role: string): boolean {
  return (SUBSCRIBABLE_ROLES as string[]).includes(role);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function listNotificationUserOptions(): Promise<NotificationUserOption[]> {
  return prisma.user.findMany({
    where: {
      role: { in: [Role.READER, Role.EDITOR, Role.ADMIN] },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      receiveNotifications: true,
      receiveOcdAttachment: true,
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

export async function setUserNotificationPreferences(
  userId: string,
  preferences: {
    receiveNotifications: boolean;
    receiveOcdAttachment: boolean;
  },
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user || !canSubscribeToNotifications(user.role)) {
    throw new Error("Användaren kan inte prenumerera på notiser");
  }

  const receiveNotifications = preferences.receiveNotifications;
  const receiveOcdAttachment = receiveNotifications && preferences.receiveOcdAttachment;

  await prisma.user.update({
    where: { id: userId },
    data: { receiveNotifications, receiveOcdAttachment },
  });
}

/** @deprecated Use setUserNotificationPreferences */
export async function setUserNotificationSubscription(
  userId: string,
  receiveNotifications: boolean,
): Promise<void> {
  await setUserNotificationPreferences(userId, {
    receiveNotifications,
    receiveOcdAttachment: false,
  });
}

export async function updateNotificationSubscribers(userIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(userIds)];
  const validUsers = uniqueIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: uniqueIds },
          role: { in: [Role.READER, Role.EDITOR, Role.ADMIN] },
        },
        select: { id: true },
      })
    : [];
  const validIds = validUsers.map((user) => user.id);

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { receiveNotifications: true },
      data: { receiveNotifications: false, receiveOcdAttachment: false },
    }),
    ...(validIds.length
      ? [
          prisma.user.updateMany({
            where: { id: { in: validIds } },
            data: { receiveNotifications: true },
          }),
        ]
      : []),
  ]);
}

export async function resolveNotificationRecipients(): Promise<string[]> {
  const adminEmail = await resolveAdminNotificationEmail();
  const subscribers = await prisma.user.findMany({
    where: {
      receiveNotifications: true,
      role: { in: [Role.READER, Role.EDITOR, Role.ADMIN] },
    },
    select: { email: true },
  });

  const recipients = new Set<string>();
  if (adminEmail) recipients.add(normalizeEmail(adminEmail));
  for (const user of subscribers) {
    if (user.email.trim()) recipients.add(normalizeEmail(user.email));
  }

  return [...recipients];
}

export async function resolveOcdAttachmentRecipients(): Promise<Set<string>> {
  const recipients = new Set<string>();

  const adminEmail = await resolveAdminNotificationRecipient();
  if (adminEmail) recipients.add(adminEmail);

  const subscribers = await prisma.user.findMany({
    where: {
      receiveNotifications: true,
      receiveOcdAttachment: true,
      role: { in: [Role.READER, Role.EDITOR, Role.ADMIN] },
    },
    select: { email: true },
  });

  for (const user of subscribers) {
    if (user.email.trim()) recipients.add(normalizeEmail(user.email));
  }

  return recipients;
}

export async function resolveAdminNotificationRecipient(): Promise<string | null> {
  const adminEmail = await resolveAdminNotificationEmail();
  return adminEmail ? normalizeEmail(adminEmail) : null;
}
