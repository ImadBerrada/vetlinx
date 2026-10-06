-- CreateEnum
CREATE TYPE "identity"."SecurityTokenPurpose" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFY');

-- AlterEnum
ALTER TYPE "notifications"."NotificationKind" ADD VALUE 'APPOINTMENT_REMINDER';

-- AlterTable
ALTER TABLE "identity"."accounts" ADD COLUMN     "auth_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "email_verified_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "notifications"."notifications" ADD COLUMN     "deduplication_key" VARCHAR(240);

-- AlterTable
ALTER TABLE "appointments"."appointments" ADD COLUMN     "proposal_expires_at" TIMESTAMPTZ(3),
ADD COLUMN     "proposal_reason" VARCHAR(1000),
ADD COLUMN     "proposal_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "proposed_by_account_id" UUID,
ADD COLUMN     "proposed_starts_at" TIMESTAMPTZ(3),
ADD COLUMN     "proposed_time_zone" VARCHAR(100);

-- AlterTable
ALTER TABLE "appointments"."appointment_history" ADD COLUMN     "action" VARCHAR(40) NOT NULL DEFAULT 'STATUS_CHANGED',
ADD COLUMN     "proposal_expires_at" TIMESTAMPTZ(3),
ADD COLUMN     "proposal_version" INTEGER,
ADD COLUMN     "proposed_starts_at" TIMESTAMPTZ(3),
ADD COLUMN     "proposed_time_zone" VARCHAR(100);

-- CreateTable
CREATE TABLE "identity"."security_tokens" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "purpose" "identity"."SecurityTokenPurpose" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments"."appointment_reminders" (
    "idempotency_key" VARCHAR(160) NOT NULL,
    "appointment_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "queued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_reminders_pkey" PRIMARY KEY ("idempotency_key")
);

-- CreateTable
CREATE TABLE "platform"."email_deliveries" (
    "id" UUID NOT NULL,
    "idempotency_key" VARCHAR(240) NOT NULL,
    "to" VARCHAR(320) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "encrypted_text" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_id" UUID,
    "leased_until" TIMESTAMPTZ(3),
    "last_error" VARCHAR(80),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."event_deliveries" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "state" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_id" UUID,
    "leased_until" TIMESTAMPTZ(3),
    "last_error" VARCHAR(80),
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."worker_heartbeats" (
    "name" VARCHAR(80) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
    "last_succeeded_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(80),

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "security_tokens_token_hash_key" ON "identity"."security_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "security_tokens_account_id_purpose_created_at_idx" ON "identity"."security_tokens"("account_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "appointment_reminders_appointment_id_starts_at_idx" ON "appointments"."appointment_reminders"("appointment_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_deliveries_idempotency_key_key" ON "platform"."email_deliveries"("idempotency_key");

-- CreateIndex
CREATE INDEX "email_deliveries_state_available_at_idx" ON "platform"."email_deliveries"("state", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_deliveries_event_id_key" ON "platform"."event_deliveries"("event_id");

-- CreateIndex
CREATE INDEX "event_deliveries_state_available_at_idx" ON "platform"."event_deliveries"("state", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_deduplication_key_key" ON "notifications"."notifications"("deduplication_key");

-- AddForeignKey
ALTER TABLE "identity"."security_tokens" ADD CONSTRAINT "security_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"."appointment_reminders" ADD CONSTRAINT "appointment_reminders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"."appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
