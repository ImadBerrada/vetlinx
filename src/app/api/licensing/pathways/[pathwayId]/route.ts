import { forwardLicensingJson } from "@/lib/server/licensing-bff";
import type { ApiLicencePathwayDetail } from "@/lib/server/vetlinx-api";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/licensing/pathways/[pathwayId]">,
) {
  const { pathwayId } = await context.params;
  return forwardLicensingJson<ApiLicencePathwayDetail>(
    `/api/v1/licensing/pathways/${encodeURIComponent(pathwayId)}`,
    undefined,
    {
      fallback: "The licensing pathway could not be loaded.",
      wrap: (pathway) => ({ pathway }),
    },
  );
}
