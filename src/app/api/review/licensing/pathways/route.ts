import type { NextRequest } from "next/server";
import { licensingAdminMutation } from "@/lib/server/licensing-admin-bff";
import { createLicencePathwaySchema } from "@/lib/validation/licensing";

export async function POST(request: NextRequest) {
  return licensingAdminMutation(request, {
    path: "/api/v1/licensing/admin/pathways",
    method: "POST",
    schema: createLicencePathwaySchema,
    fallback: "The licensing pathway could not be created.",
    idempotent: true,
  });
}
