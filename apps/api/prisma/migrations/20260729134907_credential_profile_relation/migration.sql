-- AddForeignKey
ALTER TABLE "credentials"."credentials" ADD CONSTRAINT "credentials_professional_profile_id_fkey" FOREIGN KEY ("professional_profile_id") REFERENCES "professionals"."professional_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
