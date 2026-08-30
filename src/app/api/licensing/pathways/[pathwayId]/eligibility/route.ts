import { forwardLicensingJson } from "@/lib/server/licensing-bff";
import type { ApiLicensingEligibility } from "@/lib/server/vetlinx-api";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/licensing/pathways/[pathwayId]/eligibility">,
) {
  const { pathwayId } = await context.params;
  return forwardLicensingJson<ApiLicensingEligibility>(
    `/api/v1/licensing/pathways/${encodeURIComponent(pathwayId)}/eligibility`,
    undefined,
    {
      fallback: "Eligibility could not be evaluated.",
      wrap: (eligibility) => ({ eligibility }),
    },
  );
}
