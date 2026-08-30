import type { NextRequest } from "next/server";
import { licensingAdminTransition } from "@/lib/server/licensing-admin-bff";

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/review/licensing/versions/[versionId]/supersede">,
) {
  const { versionId } = await context.params;
  return licensingAdminTransition(
    request,
    `/api/v1/licensing/admin/versions/${encodeURIComponent(versionId)}/supersede`,
    "The pathway version could not be superseded.",
  );
}
