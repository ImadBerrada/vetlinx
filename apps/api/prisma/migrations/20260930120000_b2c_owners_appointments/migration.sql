-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "appointments";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "owners";

-- CreateEnum
CREATE TYPE "appointments"."AppointmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notifications"."NotificationKind" ADD VALUE 'APPOINTMENT_REQUESTED';
ALTER TYPE "notifications"."NotificationKind" ADD VALUE 'APPOINTMENT_UPDATED';

-- AlterTable
ALTER TABLE "organizations"."organizations" ADD COLUMN     "accepts_appointment_requests" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "owners"."owner_profiles" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "owner_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners"."pets" (
    "id" UUID NOT NULL,
    "owner_profile_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "species_code" VARCHAR(40) NOT NULL,
    "breed" VARCHAR(120),
    "sex" VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    "birth_date" DATE,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments"."appointments" (
    "id" UUID NOT NULL,
    "requester_account_id" UUID NOT NULL,
    "owner_profile_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "owner_name" VARCHAR(200) NOT NULL,
    "contact_phone" VARCHAR(40) NOT NULL,
    "pet_name" VARCHAR(100) NOT NULL,
    "species_code" VARCHAR(40) NOT NULL,
    "clinic_name" VARCHAR(250) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "time_zone" VARCHAR(100) NOT NULL,
    "visit_reason" VARCHAR(1000) NOT NULL,
    "sharing_consent_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "appointments"."AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "response_note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments"."appointment_history" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "actor_account_id" UUID NOT NULL,
    "from_status" "appointments"."AppointmentStatus",
    "to_status" "appointments"."AppointmentStatus" NOT NULL,
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_profiles_account_id_key" ON "owners"."owner_profiles"("account_id");

-- CreateIndex
CREATE INDEX "pets_owner_profile_id_archived_at_idx" ON "owners"."pets"("owner_profile_id", "archived_at");

-- CreateIndex
CREATE INDEX "appointments_requester_account_id_starts_at_idx" ON "appointments"."appointments"("requester_account_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_organization_id_status_starts_at_idx" ON "appointments"."appointments"("organization_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "appointment_history_appointment_id_created_at_idx" ON "appointments"."appointment_history"("appointment_id", "created_at");

-- AddForeignKey
ALTER TABLE "owners"."owner_profiles" ADD CONSTRAINT "owner_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners"."pets" ADD CONSTRAINT "pets_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "owners"."owner_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"."appointments" ADD CONSTRAINT "appointments_requester_account_id_fkey" FOREIGN KEY ("requester_account_id") REFERENCES "identity"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"."appointments" ADD CONSTRAINT "appointments_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "owners"."owner_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"."appointments" ADD CONSTRAINT "appointments_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "owners"."pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"."appointments" ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"."appointment_history" ADD CONSTRAINT "appointment_history_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"."appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
