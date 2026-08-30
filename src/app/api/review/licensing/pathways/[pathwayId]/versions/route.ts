import type { NextRequest } from "next/server";
import { licensingAdminMutation } from "@/lib/server/licensing-admin-bff";
import { createPathwayVersionSchema } from "@/lib/validation/licensing";

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/review/licensing/pathways/[pathwayId]/versions">,
) {
  const { pathwayId } = await context.params;
  return licensingAdminMutation(request, {
    path: `/api/v1/licensing/admin/pathways/${encodeURIComponent(pathwayId)}/versions`,
    method: "POST",
    schema: createPathwayVersionSchema,
    fallback: "The pathway version could not be created.",
    idempotent: true,
  });
}
