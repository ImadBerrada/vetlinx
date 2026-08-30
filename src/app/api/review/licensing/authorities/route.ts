import type { NextRequest } from "next/server";
import { licensingAdminMutation } from "@/lib/server/licensing-admin-bff";
import { createLicensingAuthoritySchema } from "@/lib/validation/licensing";

export async function POST(request: NextRequest) {
  return licensingAdminMutation(request, {
    path: "/api/v1/licensing/admin/authorities",
    method: "POST",
    schema: createLicensingAuthoritySchema,
    fallback: "The licensing authority could not be created.",
    idempotent: true,
  });
}
