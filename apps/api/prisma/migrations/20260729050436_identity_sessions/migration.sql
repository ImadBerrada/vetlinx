/*
  Warnings:

  - Added the required column `password_hash` to the `accounts` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "identity"."accounts" ADD COLUMN     "password_hash" VARCHAR(255) NOT NULL;

-- CreateTable
CREATE TABLE "identity"."refresh_sessions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_id" UUID,
    "user_agent" VARCHAR(500),
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "identity"."refresh_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_sessions_account_id_expires_at_idx" ON "identity"."refresh_sessions"("account_id", "expires_at");

-- AddForeignKey
ALTER TABLE "identity"."refresh_sessions" ADD CONSTRAINT "refresh_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
