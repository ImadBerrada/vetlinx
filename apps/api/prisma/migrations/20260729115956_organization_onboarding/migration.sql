-- CreateEnum
CREATE TYPE "organizations"."OrganizationType" AS ENUM ('CLINIC', 'HOSPITAL', 'LABORATORY', 'UNIVERSITY', 'COMPANY', 'OTHER');

-- CreateEnum
CREATE TYPE "organizations"."OrganizationInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "organizations"."OrganizationVerificationStatus" AS ENUM ('EVIDENCE_REQUIRED', 'READY_TO_SUBMIT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "organizations"."OrganizationVerificationDecisionAction" AS ENUM ('NEEDS_INFORMATION', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "organizations"."organizations" ADD COLUMN     "address_line_1" VARCHAR(250),
ADD COLUMN     "city" VARCHAR(120),
ADD COLUMN     "email" VARCHAR(320),
ADD COLUMN     "phone" VARCHAR(40),
ADD COLUMN     "postal_code" VARCHAR(30),
ADD COLUMN     "public_name" VARCHAR(250),
ADD COLUMN     "region" VARCHAR(120),
ADD COLUMN     "type" "organizations"."OrganizationType" NOT NULL DEFAULT 'CLINIC',
ADD COLUMN     "website" VARCHAR(500);

-- CreateTable
CREATE TABLE "organizations"."organization_invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role" "organizations"."OrganizationMemberRole" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "status" "organizations"."OrganizationInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invited_by" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations"."organization_verification_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" "organizations"."OrganizationVerificationStatus" NOT NULL DEFAULT 'EVIDENCE_REQUIRED',
    "assigned_reviewer_id" UUID,
    "submitted_at" TIMESTAMPTZ(3),
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations"."organization_verification_evidence" (
    "id" UUID NOT NULL,
    "verification_request_id" UUID NOT NULL,
    "file_object_id" UUID NOT NULL,
    "kind" VARCHAR(60) NOT NULL DEFAULT 'BUSINESS_REGISTRATION',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_verification_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations"."organization_verification_decisions" (
    "id" UUID NOT NULL,
    "verification_request_id" UUID NOT NULL,
    "reviewer_account_id" UUID NOT NULL,
    "action" "organizations"."OrganizationVerificationDecisionAction" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_verification_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_invitations_token_hash_key" ON "organizations"."organization_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "organization_invitations_organization_id_status_created_at_idx" ON "organizations"."organization_invitations"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "organization_invitations_email_status_idx" ON "organizations"."organization_invitations"("email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_verification_requests_organization_id_key" ON "organizations"."organization_verification_requests"("organization_id");

-- CreateIndex
CREATE INDEX "organization_verification_requests_status_submitted_at_idx" ON "organizations"."organization_verification_requests"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "organization_verification_requests_assigned_reviewer_id_sta_idx" ON "organizations"."organization_verification_requests"("assigned_reviewer_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_verification_evidence_file_object_id_key" ON "organizations"."organization_verification_evidence"("file_object_id");

-- CreateIndex
CREATE INDEX "organization_verification_evidence_verification_request_id__idx" ON "organizations"."organization_verification_evidence"("verification_request_id", "created_at");

-- CreateIndex
CREATE INDEX "organization_verification_decisions_verification_request_id_idx" ON "organizations"."organization_verification_decisions"("verification_request_id", "created_at");

-- CreateIndex
CREATE INDEX "organization_verification_decisions_reviewer_account_id_cre_idx" ON "organizations"."organization_verification_decisions"("reviewer_account_id", "created_at");

-- AddForeignKey
ALTER TABLE "organizations"."organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations"."organization_verification_requests" ADD CONSTRAINT "organization_verification_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations"."organization_verification_requests" ADD CONSTRAINT "organization_verification_requests_assigned_reviewer_id_fkey" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations"."organization_verification_evidence" ADD CONSTRAINT "organization_verification_evidence_verification_request_id_fkey" FOREIGN KEY ("verification_request_id") REFERENCES "organizations"."organization_verification_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations"."organization_verification_decisions" ADD CONSTRAINT "organization_verification_decisions_verification_request_i_fkey" FOREIGN KEY ("verification_request_id") REFERENCES "organizations"."organization_verification_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations"."organization_verification_decisions" ADD CONSTRAINT "organization_verification_decisions_reviewer_account_id_fkey" FOREIGN KEY ("reviewer_account_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
