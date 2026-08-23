-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "files";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "verification";

-- CreateEnum
CREATE TYPE "files"."FileValidationStatus" AS ENUM ('VALIDATED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "verification"."VerificationRequestStatus" AS ENUM ('EVIDENCE_REQUIRED', 'READY_TO_SUBMIT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'VERIFIED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "files"."file_objects" (
    "id" UUID NOT NULL,
    "owner_account_id" UUID NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "media_type" VARCHAR(120) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "validation_status" "files"."FileValidationStatus" NOT NULL DEFAULT 'VALIDATED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification"."verification_requests" (
    "id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "professional_profile_id" UUID NOT NULL,
    "status" "verification"."VerificationRequestStatus" NOT NULL DEFAULT 'EVIDENCE_REQUIRED',
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification"."verification_evidence" (
    "id" UUID NOT NULL,
    "verification_request_id" UUID NOT NULL,
    "file_object_id" UUID NOT NULL,
    "kind" VARCHAR(60) NOT NULL DEFAULT 'SUPPORTING_DOCUMENT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "file_objects_object_key_key" ON "files"."file_objects"("object_key");

-- CreateIndex
CREATE INDEX "file_objects_owner_account_id_created_at_idx" ON "files"."file_objects"("owner_account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_requests_credential_id_key" ON "verification"."verification_requests"("credential_id");

-- CreateIndex
CREATE INDEX "verification_requests_professional_profile_id_status_idx" ON "verification"."verification_requests"("professional_profile_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "verification_evidence_file_object_id_key" ON "verification"."verification_evidence"("file_object_id");

-- CreateIndex
CREATE INDEX "verification_evidence_verification_request_id_created_at_idx" ON "verification"."verification_evidence"("verification_request_id", "created_at");

-- AddForeignKey
ALTER TABLE "verification"."verification_evidence" ADD CONSTRAINT "verification_evidence_verification_request_id_fkey" FOREIGN KEY ("verification_request_id") REFERENCES "verification"."verification_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
