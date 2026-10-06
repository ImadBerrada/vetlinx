-- AlterEnum
ALTER TYPE "appointments"."AppointmentStatus" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "appointments"."appointments" ADD COLUMN     "checked_in_at" TIMESTAMPTZ(3),
ADD COLUMN     "proposal_initiator" VARCHAR(20);

-- AlterTable
ALTER TABLE "appointments"."appointment_history" ADD COLUMN     "proposal_initiator" VARCHAR(20);

