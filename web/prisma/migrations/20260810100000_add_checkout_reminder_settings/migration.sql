-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "checkoutReminderDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "AppSettings" ADD COLUMN "checkoutReminderRepeatDays" INTEGER NOT NULL DEFAULT 7;
