/*
  Warnings:

  - Added the required column `family_id` to the `refresh_sessions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "identity"."refresh_sessions" ADD COLUMN     "family_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "refresh_sessions_family_id_revoked_at_idx" ON "identity"."refresh_sessions"("family_id", "revoked_at");
