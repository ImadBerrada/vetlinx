CREATE TYPE "professionals"."PortfolioVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');
CREATE TYPE "professionals"."ContactVisibility" AS ENUM ('PRIVATE', 'VERIFIED_EMPLOYERS', 'PUBLIC');

ALTER TABLE "professionals"."professional_profiles"
  ADD COLUMN "headline" VARCHAR(220),
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "public_slug" VARCHAR(180),
  ADD COLUMN "visibility" "professionals"."PortfolioVisibility" NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN "contact_visibility" "professionals"."ContactVisibility" NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN "specialty_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "species_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "language_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "professional_profiles_public_slug_key"
  ON "professionals"."professional_profiles"("public_slug");
CREATE INDEX "professional_profiles_visibility_public_slug_idx"
  ON "professionals"."professional_profiles"("visibility", "public_slug");
