-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notifications"."NotificationKind" ADD VALUE 'CREDENTIAL_EXPIRED';
ALTER TYPE "notifications"."NotificationKind" ADD VALUE 'CREDENTIAL_REVOKED';

-- AlterTable
ALTER TABLE "identity"."accounts" ADD COLUMN     "mfa_enabled_at" TIMESTAMPTZ(3),
ADD COLUMN     "mfa_failed_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mfa_last_used_step" BIGINT,
ADD COLUMN     "mfa_locked_until" TIMESTAMPTZ(3),
ADD COLUMN     "mfa_pending_expires_at" TIMESTAMPTZ(3),
ADD COLUMN     "mfa_pending_secret_encrypted" TEXT,
ADD COLUMN     "mfa_secret_encrypted" TEXT;

-- AlterTable
ALTER TABLE "identity"."refresh_sessions" ADD COLUMN     "mfa_authenticated_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "platform"."email_deliveries" ADD COLUMN     "category" VARCHAR(40),
ADD COLUMN     "recipient_account_id" UUID;

-- CreateTable
CREATE TABLE "notifications"."notification_preferences" (
    "account_id" UUID NOT NULL,
    "appointment_updates_email" BOOLEAN NOT NULL DEFAULT true,
    "appointment_reminders_email" BOOLEAN NOT NULL DEFAULT true,
    "credential_updates_email" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "identity"."mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."mfa_challenges" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "auth_version" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ip_address" INET,
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials"."credential_lifecycle_history" (
    "id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "actor_account_id" UUID,
    "from_status" "credentials"."CredentialStatus" NOT NULL,
    "to_status" "credentials"."CredentialStatus" NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "verification_request_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_lifecycle_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mfa_recovery_codes_code_hash_key" ON "identity"."mfa_recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "mfa_recovery_codes_account_id_used_at_idx" ON "identity"."mfa_recovery_codes"("account_id", "used_at");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_challenges_token_hash_key" ON "identity"."mfa_challenges"("token_hash");

-- CreateIndex
CREATE INDEX "mfa_challenges_account_id_expires_at_idx" ON "identity"."mfa_challenges"("account_id", "expires_at");

-- CreateIndex
CREATE INDEX "credential_lifecycle_history_credential_id_created_at_idx" ON "credentials"."credential_lifecycle_history"("credential_id", "created_at");

-- AddForeignKey
ALTER TABLE "notifications"."notification_preferences" ADD CONSTRAINT "notification_preferences_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."mfa_challenges" ADD CONSTRAINT "mfa_challenges_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials"."credential_lifecycle_history" ADD CONSTRAINT "credential_lifecycle_history_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credentials"."credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

