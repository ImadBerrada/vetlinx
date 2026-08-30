import type { NextRequest } from "next/server";
import { licensingAdminTransition } from "@/lib/server/licensing-admin-bff";

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/review/licensing/versions/[versionId]/submit">,
) {
  const { versionId } = await context.params;
  return licensingAdminTransition(
    request,
    `/api/v1/licensing/admin/versions/${encodeURIComponent(versionId)}/submit`,
    "The pathway version could not be submitted for review.",
  );
}
