import type { NextRequest } from "next/server";
import { licensingAdminMutation } from "@/lib/server/licensing-admin-bff";
import { createLicensingJurisdictionSchema } from "@/lib/validation/licensing";

export async function POST(request: NextRequest) {
  return licensingAdminMutation(request, {
    path: "/api/v1/licensing/admin/jurisdictions",
    method: "POST",
    schema: createLicensingJurisdictionSchema,
    fallback: "The licensing jurisdiction could not be created.",
    idempotent: true,
  });
}
