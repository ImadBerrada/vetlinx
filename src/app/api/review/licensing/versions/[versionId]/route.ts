import type { NextRequest } from "next/server";
import { licensingAdminMutation } from "@/lib/server/licensing-admin-bff";
import { updatePathwayVersionSchema } from "@/lib/validation/licensing";

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/review/licensing/versions/[versionId]">,
) {
  const { versionId } = await context.params;
  return licensingAdminMutation(request, {
    path: `/api/v1/licensing/admin/versions/${encodeURIComponent(versionId)}`,
    method: "PATCH",
    schema: updatePathwayVersionSchema,
    fallback: "The pathway version could not be updated.",
  });
}
