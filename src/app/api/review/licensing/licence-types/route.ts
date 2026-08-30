import type { NextRequest } from "next/server";
import { licensingAdminMutation } from "@/lib/server/licensing-admin-bff";
import { createLicenceTypeSchema } from "@/lib/validation/licensing";

export async function POST(request: NextRequest) {
  return licensingAdminMutation(request, {
    path: "/api/v1/licensing/admin/licence-types",
    method: "POST",
    schema: createLicenceTypeSchema,
    fallback: "The licence type could not be created.",
    idempotent: true,
  });
}
