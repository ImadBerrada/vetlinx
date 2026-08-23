-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "credentials";

-- CreateEnum
CREATE TYPE "credentials"."CredentialStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVOKED');

-- CreateTable
CREATE TABLE "credentials"."credentials" (
    "id" UUID NOT NULL,
    "professional_profile_id" UUID NOT NULL,
    "type_code" VARCHAR(60) NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "issuing_organization" VARCHAR(250) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "issue_date" DATE NOT NULL,
    "expiry_date" DATE,
    "status" "credentials"."CredentialStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credentials_professional_profile_id_status_idx" ON "credentials"."credentials"("professional_profile_id", "status");

-- CreateIndex
CREATE INDEX "credentials_country_code_type_code_idx" ON "credentials"."credentials"("country_code", "type_code");
