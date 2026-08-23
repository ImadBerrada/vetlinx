-- CreateEnum
CREATE TYPE "recruitment"."InterviewMode" AS ENUM ('VIDEO', 'PHONE', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "recruitment"."InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "recruitment"."JobOfferStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notifications"."NotificationKind" ADD VALUE 'INTERVIEW_SCHEDULED';
ALTER TYPE "notifications"."NotificationKind" ADD VALUE 'INTERVIEW_UPDATED';
ALTER TYPE "notifications"."NotificationKind" ADD VALUE 'OFFER_RECEIVED';
ALTER TYPE "notifications"."NotificationKind" ADD VALUE 'OFFER_UPDATED';

-- CreateTable
CREATE TABLE "recruitment"."interviews" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "scheduled_by_account_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "time_zone" VARCHAR(80) NOT NULL,
    "mode" "recruitment"."InterviewMode" NOT NULL,
    "location" VARCHAR(500),
    "join_url" VARCHAR(1000),
    "notes" TEXT,
    "status" "recruitment"."InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment"."job_offers" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "created_by_account_id" UUID NOT NULL,
    "salary_monthly" INTEGER NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "proposed_start_date" DATE NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "terms" TEXT NOT NULL,
    "status" "recruitment"."JobOfferStatus" NOT NULL DEFAULT 'DRAFT',
    "sent_at" TIMESTAMPTZ(3),
    "responded_at" TIMESTAMPTZ(3),
    "response_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interviews_application_id_starts_at_idx" ON "recruitment"."interviews"("application_id", "starts_at");

-- CreateIndex
CREATE INDEX "interviews_status_starts_at_idx" ON "recruitment"."interviews"("status", "starts_at");

-- CreateIndex
CREATE INDEX "job_offers_application_id_status_created_at_idx" ON "recruitment"."job_offers"("application_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "job_offers_status_expires_at_idx" ON "recruitment"."job_offers"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "recruitment"."interviews" ADD CONSTRAINT "interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "recruitment"."job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment"."job_offers" ADD CONSTRAINT "job_offers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "recruitment"."job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
