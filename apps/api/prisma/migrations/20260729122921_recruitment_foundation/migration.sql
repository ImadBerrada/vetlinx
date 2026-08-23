-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "recruitment";

-- CreateEnum
CREATE TYPE "recruitment"."JobStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "recruitment"."EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'LOCUM', 'CONTRACT', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "recruitment"."WorkMode" AS ENUM ('ON_SITE', 'HYBRID', 'REMOTE');

-- CreateEnum
CREATE TYPE "recruitment"."JobRequirementCategory" AS ENUM ('SPECIALTY', 'SPECIES', 'LICENCE', 'LANGUAGE', 'QUALIFICATION');

-- CreateEnum
CREATE TYPE "recruitment"."JobApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEWING', 'OFFERED', 'REJECTED', 'WITHDRAWN', 'HIRED');

-- CreateTable
CREATE TABLE "recruitment"."jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_by_account_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "employment_type" "recruitment"."EmploymentType" NOT NULL,
    "work_mode" "recruitment"."WorkMode" NOT NULL,
    "min_experience_years" INTEGER NOT NULL DEFAULT 0,
    "salary_min_monthly" INTEGER,
    "salary_max_monthly" INTEGER,
    "currency_code" CHAR(3),
    "status" "recruitment"."JobStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(3),
    "closing_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment"."job_requirements" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "category" "recruitment"."JobRequirementCategory" NOT NULL,
    "value_code" VARCHAR(120) NOT NULL,
    "label" VARCHAR(180) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment"."job_applications" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "professional_profile_id" UUID NOT NULL,
    "cover_note" TEXT,
    "status" "recruitment"."JobApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment"."job_application_history" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "from_status" "recruitment"."JobApplicationStatus",
    "to_status" "recruitment"."JobApplicationStatus" NOT NULL,
    "actor_account_id" UUID NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_application_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_organization_id_status_created_at_idx" ON "recruitment"."jobs"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "jobs_status_country_code_city_published_at_idx" ON "recruitment"."jobs"("status", "country_code", "city", "published_at");

-- CreateIndex
CREATE INDEX "job_requirements_category_value_code_idx" ON "recruitment"."job_requirements"("category", "value_code");

-- CreateIndex
CREATE UNIQUE INDEX "job_requirements_job_id_category_value_code_key" ON "recruitment"."job_requirements"("job_id", "category", "value_code");

-- CreateIndex
CREATE INDEX "job_applications_professional_profile_id_status_submitted_a_idx" ON "recruitment"."job_applications"("professional_profile_id", "status", "submitted_at");

-- CreateIndex
CREATE INDEX "job_applications_job_id_status_submitted_at_idx" ON "recruitment"."job_applications"("job_id", "status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_applications_job_id_professional_profile_id_key" ON "recruitment"."job_applications"("job_id", "professional_profile_id");

-- CreateIndex
CREATE INDEX "job_application_history_application_id_created_at_idx" ON "recruitment"."job_application_history"("application_id", "created_at");

-- AddForeignKey
ALTER TABLE "recruitment"."jobs" ADD CONSTRAINT "jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment"."jobs" ADD CONSTRAINT "jobs_created_by_account_id_fkey" FOREIGN KEY ("created_by_account_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment"."job_requirements" ADD CONSTRAINT "job_requirements_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "recruitment"."jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment"."job_applications" ADD CONSTRAINT "job_applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "recruitment"."jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment"."job_applications" ADD CONSTRAINT "job_applications_professional_profile_id_fkey" FOREIGN KEY ("professional_profile_id") REFERENCES "professionals"."professional_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment"."job_application_history" ADD CONSTRAINT "job_application_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "recruitment"."job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
