-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "notifications";

-- CreateEnum
CREATE TYPE "notifications"."NotificationKind" AS ENUM ('VERIFICATION_INFORMATION_REQUESTED', 'CREDENTIAL_VERIFIED', 'CREDENTIAL_REJECTED');

-- CreateEnum
CREATE TYPE "notifications"."NotificationStatus" AS ENUM ('UNREAD', 'READ');

-- CreateTable
CREATE TABLE "notifications"."notifications" (
    "id" UUID NOT NULL,
    "recipient_account_id" UUID NOT NULL,
    "kind" "notifications"."NotificationKind" NOT NULL,
    "status" "notifications"."NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "title" VARCHAR(180) NOT NULL,
    "message" TEXT NOT NULL,
    "resource_type" VARCHAR(120) NOT NULL,
    "resource_id" VARCHAR(120) NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_recipient_account_id_status_created_at_idx" ON "notifications"."notifications"("recipient_account_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "notifications"."notifications" ADD CONSTRAINT "notifications_recipient_account_id_fkey" FOREIGN KEY ("recipient_account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
