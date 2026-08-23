-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "organizations";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "professionals";

-- CreateEnum
CREATE TYPE "identity"."AccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "professionals"."ProfessionalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "organizations"."OrganizationStatus" AS ENUM ('DRAFT', 'VERIFICATION_PENDING', 'VERIFIED', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "organizations"."OrganizationMemberRole" AS ENUM ('OWNER', 'ADMIN', 'RECRUITER', 'STAFF');

-- CreateEnum
CREATE TYPE "platform"."OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "identity"."accounts" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "status" "identity"."AccountStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professionals"."professional_profiles" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "status" "professionals"."ProfessionalStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "professional_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations"."organizations" (
    "id" UUID NOT NULL,
    "legal_name" VARCHAR(250) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "status" "organizations"."OrganizationStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations"."organization_memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "role" "organizations"."OrganizationMemberRole" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."audit_events" (
    "id" UUID NOT NULL,
    "actor_id" VARCHAR(120) NOT NULL,
    "action" VARCHAR(160) NOT NULL,
    "resource_type" VARCHAR(120) NOT NULL,
    "resource_id" VARCHAR(120) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "correlation_id" VARCHAR(120) NOT NULL,
    "reason" TEXT,
    "changes" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."outbox_events" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "version" INTEGER NOT NULL,
    "aggregate_id" VARCHAR(120) NOT NULL,
    "correlation_id" VARCHAR(120) NOT NULL,
    "causation_id" VARCHAR(120),
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "platform"."OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "identity"."accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "professional_profiles_account_id_key" ON "professionals"."professional_profiles"("account_id");

-- CreateIndex
CREATE INDEX "professional_profiles_country_code_status_idx" ON "professionals"."professional_profiles"("country_code", "status");

-- CreateIndex
CREATE INDEX "organizations_country_code_status_idx" ON "organizations"."organizations"("country_code", "status");

-- CreateIndex
CREATE INDEX "organization_memberships_account_id_idx" ON "organizations"."organization_memberships"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_account_id_key" ON "organizations"."organization_memberships"("organization_id", "account_id");

-- CreateIndex
CREATE INDEX "audit_events_resource_type_resource_id_occurred_at_idx" ON "audit"."audit_events"("resource_type", "resource_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_actor_id_occurred_at_idx" ON "audit"."audit_events"("actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_occurred_at_idx" ON "platform"."outbox_events"("status", "occurred_at");

-- AddForeignKey
ALTER TABLE "professionals"."professional_profiles" ADD CONSTRAINT "professional_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations"."organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations"."organization_memberships" ADD CONSTRAINT "organization_memberships_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
