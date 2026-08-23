-- CreateEnum
CREATE TYPE "identity"."SystemRole" AS ENUM ('PROFESSIONAL', 'REVIEWER', 'OPERATIONS_ADMIN', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "verification"."VerificationDecisionAction" AS ENUM ('NEEDS_INFORMATION', 'VERIFIED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "credentials"."CredentialStatus" ADD VALUE 'VERIFIED';
ALTER TYPE "credentials"."CredentialStatus" ADD VALUE 'REJECTED';
ALTER TYPE "credentials"."CredentialStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "verification"."verification_requests" ADD COLUMN     "assigned_reviewer_id" UUID,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "identity"."account_system_roles" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "role" "identity"."SystemRole" NOT NULL,
    "granted_by" VARCHAR(120) NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_system_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification"."verification_decisions" (
    "id" UUID NOT NULL,
    "verification_request_id" UUID NOT NULL,
    "reviewer_account_id" UUID NOT NULL,
    "action" "verification"."VerificationDecisionAction" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_system_roles_role_granted_at_idx" ON "identity"."account_system_roles"("role", "granted_at");

-- CreateIndex
CREATE UNIQUE INDEX "account_system_roles_account_id_role_key" ON "identity"."account_system_roles"("account_id", "role");

-- CreateIndex
CREATE INDEX "verification_decisions_verification_request_id_created_at_idx" ON "verification"."verification_decisions"("verification_request_id", "created_at");

-- CreateIndex
CREATE INDEX "verification_decisions_reviewer_account_id_created_at_idx" ON "verification"."verification_decisions"("reviewer_account_id", "created_at");

-- CreateIndex
CREATE INDEX "verification_requests_status_submitted_at_idx" ON "verification"."verification_requests"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "verification_requests_assigned_reviewer_id_status_idx" ON "verification"."verification_requests"("assigned_reviewer_id", "status");

-- AddForeignKey
ALTER TABLE "identity"."account_system_roles" ADD CONSTRAINT "account_system_roles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification"."verification_requests" ADD CONSTRAINT "verification_requests_assigned_reviewer_id_fkey" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification"."verification_decisions" ADD CONSTRAINT "verification_decisions_verification_request_id_fkey" FOREIGN KEY ("verification_request_id") REFERENCES "verification"."verification_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification"."verification_decisions" ADD CONSTRAINT "verification_decisions_reviewer_account_id_fkey" FOREIGN KEY ("reviewer_account_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
