-- CreateEnum
CREATE TYPE "recruitment"."EmploymentStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notifications"."NotificationKind" ADD VALUE 'EMPLOYMENT_CONFIRMED';
ALTER TYPE "notifications"."NotificationKind" ADD VALUE 'EMPLOYMENT_ENDED';

-- CreateTable
CREATE TABLE "recruitment"."employments" (
    "id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "professional_profile_id" UUID NOT NULL,
    "confirmed_by_account_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "employment_type" "recruitment"."EmploymentType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "recruitment"."EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "verification_source" VARCHAR(80) NOT NULL DEFAULT 'ORGANIZATION_CONFIRMED',
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment"."employment_history" (
    "id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "from_status" "recruitment"."EmploymentStatus",
    "to_status" "recruitment"."EmploymentStatus" NOT NULL,
    "actor_account_id" UUID NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employments_offer_id_key" ON "recruitment"."employments"("offer_id");

-- CreateIndex
CREATE INDEX "employments_professional_profile_id_status_start_date_idx" ON "recruitment"."employments"("professional_profile_id", "status", "start_date");

-- CreateIndex
CREATE INDEX "employments_organization_id_status_start_date_idx" ON "recruitment"."employments"("organization_id", "status", "start_date");

-- CreateIndex
CREATE INDEX "employment_history_employment_id_created_at_idx" ON "recruitment"."employment_history"("employment_id", "created_at");

-- AddForeignKey
ALTER TABLE "recruitment"."employments" ADD CONSTRAINT "employments_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "recruitment"."job_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment"."employments" ADD CONSTRAINT "employments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "recruitment"."jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment"."employments" ADD CONSTRAINT "employments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment"."employments" ADD CONSTRAINT "employments_professional_profile_id_fkey" FOREIGN KEY ("professional_profile_id") REFERENCES "professionals"."professional_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment"."employment_history" ADD CONSTRAINT "employment_history_employment_id_fkey" FOREIGN KEY ("employment_id") REFERENCES "recruitment"."employments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
