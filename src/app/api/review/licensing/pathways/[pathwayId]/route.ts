import { forwardLicensingJson } from "@/lib/server/licensing-bff";
import type { ApiAdminLicencePathway } from "@/lib/server/vetlinx-api";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/review/licensing/pathways/[pathwayId]">,
) {
  const { pathwayId } = await context.params;
  return forwardLicensingJson<ApiAdminLicencePathway>(
    `/api/v1/licensing/admin/pathways/${encodeURIComponent(pathwayId)}`,
    undefined,
    {
      fallback: "The governed pathway could not be loaded.",
      wrap: (pathway) => ({ pathway }),
    },
  );
}
