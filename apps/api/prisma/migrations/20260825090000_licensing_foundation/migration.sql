-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "licensing";

-- CreateEnum
CREATE TYPE "licensing"."PathwayVersionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "licensing"."PathwayEnrollmentStatus" AS ENUM ('ACTIVE', 'SUBMITTED_EXTERNALLY', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "licensing"."RequirementProgressState" AS ENUM ('MISSING', 'IN_PROGRESS', 'SATISFIED', 'NEEDS_REVIEW', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "licensing"."ExternalLicenceApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "licensing"."LicenceApplicationVerificationSource" AS ENUM ('USER_REPORTED', 'AUTHORITY_INTEGRATION');

-- CreateEnum
CREATE TYPE "licensing"."ProfessionalLicenceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "identity"."SystemRole" ADD VALUE 'LICENSING_CURATOR';
ALTER TYPE "identity"."SystemRole" ADD VALUE 'LICENSING_REVIEWER';

-- CreateTable
CREATE TABLE "licensing"."jurisdictions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "name_ar" VARCHAR(200) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "jurisdictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licensing"."authorities" (
    "id" UUID NOT NULL,
    "jurisdiction_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(250) NOT NULL,
    "name_ar" VARCHAR(250) NOT NULL,
    "website_url" VARCHAR(1000) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "authorities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licensing"."licence_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "name_ar" VARCHAR(200) NOT NULL,
    "professional_title_code" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "licence_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licensing"."licence_pathways" (
    "id" UUID NOT NULL,
    "jurisdiction_id" UUID NOT NULL,
    "authority_id" UUID NOT NULL,
    "licence_type_id" UUID NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "licence_pathways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licensing"."licence_pathway_versions" (
    "id" UUID NOT NULL,
    "pathway_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "licensing"."PathwayVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" DATE,
    "effective_to" DATE,
    "source_url" VARCHAR(1000) NOT NULL,
    "source_title" VARCHAR(300) NOT NULL,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by_account_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "licence_pathway_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licensing"."pathway_requirements" (
    "id" UUID NOT NULL,
    "pathway_version_id" UUID NOT NULL,
    "code" VARCHAR(120) NOT NULL,
    "title_en" VARCHAR(250) NOT NULL,
    "title_ar" VARCHAR(250) NOT NULL,
    "description_en" TEXT NOT NULL,
    "description_ar" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "rule" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pathway_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licensing"."pathway_enrollments" (
    "id" UUID NOT NULL,
    "professional_profile_id" UUID NOT NULL,
    "pathway_version_id" UUID NOT NULL,
    "status" "licensing"."PathwayEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_externally_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pathway_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licensing"."requirement_progress" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "state" "licensing"."RequirementProgressState" NOT NULL DEFAULT 'MISSING',
    "linked_credential_id" UUID,
    "note" TEXT,
    "evaluated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "requirement_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licensing"."external_licence_applications" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "authority_reference" VARCHAR(200) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "licensing"."ExternalLicenceApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "verification_source" "licensing"."LicenceApplicationVerificationSource" NOT NULL DEFAULT 'USER_REPORTED',
    "last_reported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "external_licence_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licensing"."professional_licences" (
    "id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "authority_id" UUID NOT NULL,
    "licence_number" VARCHAR(160) NOT NULL,
    "status" "licensing"."ProfessionalLicenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "professional_licences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licensing"."licensing_reminder_preferences" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "time_zone" VARCHAR(80) NOT NULL,
    "renewal_enabled" BOOLEAN NOT NULL DEFAULT true,
    "lead_days" INTEGER NOT NULL DEFAULT 90,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "licensing_reminder_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licensing"."licensing_mutation_receipts" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "operation" VARCHAR(120) NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "resource_id" VARCHAR(120) NOT NULL,
    "response_status" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licensing_mutation_receipts_pkey" PRIMARY KEY ("id")
);

-- Domain checks not expressible in the Prisma schema.
ALTER TABLE "licensing"."licence_pathway_versions"
ADD CONSTRAINT "licence_pathway_versions_effective_dates_check"
CHECK ("effective_to" IS NULL OR "effective_from" IS NULL OR "effective_to" >= "effective_from");

ALTER TABLE "licensing"."pathway_requirements"
ADD CONSTRAINT "pathway_requirements_position_check"
CHECK ("position" > 0);

ALTER TABLE "licensing"."licensing_reminder_preferences"
ADD CONSTRAINT "licensing_reminder_preferences_lead_days_check"
CHECK ("lead_days" IN (30, 60, 90, 120));

-- CreateIndex
CREATE UNIQUE INDEX "jurisdictions_code_key" ON "licensing"."jurisdictions"("code");

-- CreateIndex
CREATE INDEX "jurisdictions_active_name_en_idx" ON "licensing"."jurisdictions"("active", "name_en");

-- CreateIndex
CREATE INDEX "authorities_jurisdiction_id_active_name_en_idx" ON "licensing"."authorities"("jurisdiction_id", "active", "name_en");

-- CreateIndex
CREATE UNIQUE INDEX "authorities_jurisdiction_id_code_key" ON "licensing"."authorities"("jurisdiction_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "licence_types_code_key" ON "licensing"."licence_types"("code");

-- CreateIndex
CREATE INDEX "licence_types_active_professional_title_code_idx" ON "licensing"."licence_types"("active", "professional_title_code");

-- CreateIndex
CREATE INDEX "licence_pathways_jurisdiction_id_licence_type_id_active_idx" ON "licensing"."licence_pathways"("jurisdiction_id", "licence_type_id", "active");

-- CreateIndex
CREATE INDEX "licence_pathways_authority_id_active_idx" ON "licensing"."licence_pathways"("authority_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "licence_pathways_jurisdiction_id_authority_id_licence_type__key" ON "licensing"."licence_pathways"("jurisdiction_id", "authority_id", "licence_type_id", "slug");

-- CreateIndex
CREATE INDEX "licence_pathway_versions_status_effective_from_idx" ON "licensing"."licence_pathway_versions"("status", "effective_from");

-- CreateIndex
CREATE INDEX "licence_pathway_versions_reviewed_by_account_id_reviewed_at_idx" ON "licensing"."licence_pathway_versions"("reviewed_by_account_id", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "licence_pathway_versions_pathway_id_version_key" ON "licensing"."licence_pathway_versions"("pathway_id", "version");

-- CreateIndex
CREATE INDEX "pathway_requirements_pathway_version_id_required_idx" ON "licensing"."pathway_requirements"("pathway_version_id", "required");

-- CreateIndex
CREATE UNIQUE INDEX "pathway_requirements_pathway_version_id_code_key" ON "licensing"."pathway_requirements"("pathway_version_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "pathway_requirements_pathway_version_id_position_key" ON "licensing"."pathway_requirements"("pathway_version_id", "position");

-- CreateIndex
CREATE INDEX "pathway_enrollments_professional_profile_id_status_started__idx" ON "licensing"."pathway_enrollments"("professional_profile_id", "status", "started_at");

-- CreateIndex
CREATE INDEX "pathway_enrollments_pathway_version_id_status_idx" ON "licensing"."pathway_enrollments"("pathway_version_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pathway_enrollments_professional_profile_id_pathway_version_key" ON "licensing"."pathway_enrollments"("professional_profile_id", "pathway_version_id");

-- CreateIndex
CREATE INDEX "requirement_progress_linked_credential_id_state_idx" ON "licensing"."requirement_progress"("linked_credential_id", "state");

-- CreateIndex
CREATE INDEX "requirement_progress_state_evaluated_at_idx" ON "licensing"."requirement_progress"("state", "evaluated_at");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_progress_enrollment_id_requirement_id_key" ON "licensing"."requirement_progress"("enrollment_id", "requirement_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_licence_applications_enrollment_id_key" ON "licensing"."external_licence_applications"("enrollment_id");

-- CreateIndex
CREATE INDEX "external_licence_applications_status_last_reported_at_idx" ON "licensing"."external_licence_applications"("status", "last_reported_at");

-- CreateIndex
CREATE UNIQUE INDEX "professional_licences_credential_id_key" ON "licensing"."professional_licences"("credential_id");

-- CreateIndex
CREATE UNIQUE INDEX "professional_licences_enrollment_id_key" ON "licensing"."professional_licences"("enrollment_id");

-- CreateIndex
CREATE INDEX "professional_licences_authority_id_status_idx" ON "licensing"."professional_licences"("authority_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "professional_licences_authority_id_licence_number_key" ON "licensing"."professional_licences"("authority_id", "licence_number");

-- CreateIndex
CREATE UNIQUE INDEX "licensing_reminder_preferences_account_id_key" ON "licensing"."licensing_reminder_preferences"("account_id");

-- CreateIndex
CREATE INDEX "licensing_reminder_preferences_renewal_enabled_lead_days_idx" ON "licensing"."licensing_reminder_preferences"("renewal_enabled", "lead_days");

-- CreateIndex
CREATE INDEX "licensing_mutation_receipts_created_at_idx" ON "licensing"."licensing_mutation_receipts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "licensing_mutation_receipts_account_id_operation_idempotenc_key" ON "licensing"."licensing_mutation_receipts"("account_id", "operation", "idempotency_key");

-- CreateIndex
CREATE INDEX "credentials_expiry_date_status_idx" ON "credentials"."credentials"("expiry_date", "status");

-- AddForeignKey
ALTER TABLE "licensing"."authorities" ADD CONSTRAINT "authorities_jurisdiction_id_fkey" FOREIGN KEY ("jurisdiction_id") REFERENCES "licensing"."jurisdictions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."licence_pathways" ADD CONSTRAINT "licence_pathways_jurisdiction_id_fkey" FOREIGN KEY ("jurisdiction_id") REFERENCES "licensing"."jurisdictions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."licence_pathways" ADD CONSTRAINT "licence_pathways_authority_id_fkey" FOREIGN KEY ("authority_id") REFERENCES "licensing"."authorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."licence_pathways" ADD CONSTRAINT "licence_pathways_licence_type_id_fkey" FOREIGN KEY ("licence_type_id") REFERENCES "licensing"."licence_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."licence_pathway_versions" ADD CONSTRAINT "licence_pathway_versions_pathway_id_fkey" FOREIGN KEY ("pathway_id") REFERENCES "licensing"."licence_pathways"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."licence_pathway_versions" ADD CONSTRAINT "licence_pathway_versions_reviewed_by_account_id_fkey" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."pathway_requirements" ADD CONSTRAINT "pathway_requirements_pathway_version_id_fkey" FOREIGN KEY ("pathway_version_id") REFERENCES "licensing"."licence_pathway_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."pathway_enrollments" ADD CONSTRAINT "pathway_enrollments_professional_profile_id_fkey" FOREIGN KEY ("professional_profile_id") REFERENCES "professionals"."professional_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."pathway_enrollments" ADD CONSTRAINT "pathway_enrollments_pathway_version_id_fkey" FOREIGN KEY ("pathway_version_id") REFERENCES "licensing"."licence_pathway_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."requirement_progress" ADD CONSTRAINT "requirement_progress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "licensing"."pathway_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."requirement_progress" ADD CONSTRAINT "requirement_progress_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "licensing"."pathway_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."requirement_progress" ADD CONSTRAINT "requirement_progress_linked_credential_id_fkey" FOREIGN KEY ("linked_credential_id") REFERENCES "credentials"."credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."external_licence_applications" ADD CONSTRAINT "external_licence_applications_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "licensing"."pathway_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."professional_licences" ADD CONSTRAINT "professional_licences_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credentials"."credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."professional_licences" ADD CONSTRAINT "professional_licences_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "licensing"."pathway_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."professional_licences" ADD CONSTRAINT "professional_licences_authority_id_fkey" FOREIGN KEY ("authority_id") REFERENCES "licensing"."authorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."licensing_reminder_preferences" ADD CONSTRAINT "licensing_reminder_preferences_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licensing"."licensing_mutation_receipts" ADD CONSTRAINT "licensing_mutation_receipts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
