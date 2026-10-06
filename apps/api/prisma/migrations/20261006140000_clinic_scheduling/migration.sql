-- AlterTable
ALTER TABLE "organizations"."organizations" ADD COLUMN     "appointment_scheduling_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "appointments"."appointments" ADD COLUMN     "duration_minutes" INTEGER,
ADD COLUMN     "proposed_slot_id" UUID,
ADD COLUMN     "request_hold_id" UUID,
ADD COLUMN     "service_name" VARCHAR(120),
ADD COLUMN     "slot_id" UUID;

-- AlterTable
ALTER TABLE "appointments"."appointment_history" ADD COLUMN     "slot_id" UUID;

-- CreateTable
CREATE TABLE "appointments"."clinic_services" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments"."appointment_slots" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "time_zone" VARCHAR(100) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments"."booking_holds" (
    "id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinic_services_organization_id_active_idx" ON "appointments"."clinic_services"("organization_id", "active");

-- CreateIndex
CREATE INDEX "appointment_slots_service_id_published_starts_at_idx" ON "appointments"."appointment_slots"("service_id", "published", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_slots_service_id_starts_at_key" ON "appointments"."appointment_slots"("service_id", "starts_at");

-- CreateIndex
CREATE INDEX "booking_holds_slot_id_expires_at_idx" ON "appointments"."booking_holds"("slot_id", "expires_at");

-- CreateIndex
CREATE INDEX "booking_holds_account_id_expires_at_idx" ON "appointments"."booking_holds"("account_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_request_hold_id_key" ON "appointments"."appointments"("request_hold_id");

-- CreateIndex
CREATE INDEX "appointments_slot_id_status_idx" ON "appointments"."appointments"("slot_id", "status");

-- AddForeignKey
ALTER TABLE "appointments"."appointments" ADD CONSTRAINT "appointments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "appointments"."appointment_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"."appointments" ADD CONSTRAINT "appointments_proposed_slot_id_fkey" FOREIGN KEY ("proposed_slot_id") REFERENCES "appointments"."appointment_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"."clinic_services" ADD CONSTRAINT "clinic_services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"."appointment_slots" ADD CONSTRAINT "appointment_slots_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "appointments"."clinic_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"."booking_holds" ADD CONSTRAINT "booking_holds_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "appointments"."appointment_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"."booking_holds" ADD CONSTRAINT "booking_holds_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"."booking_holds" ADD CONSTRAINT "booking_holds_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "owners"."pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointments"."clinic_services" ADD CONSTRAINT "clinic_service_duration_range" CHECK ("duration_minutes" BETWEEN 5 AND 240);
ALTER TABLE "appointments"."appointment_slots" ADD CONSTRAINT "slot_capacity_range" CHECK ("capacity" BETWEEN 1 AND 10), ADD CONSTRAINT "slot_positive_interval" CHECK ("ends_at" > "starts_at");

