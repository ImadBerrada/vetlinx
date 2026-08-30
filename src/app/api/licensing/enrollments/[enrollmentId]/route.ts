import { forwardLicensingJson } from "@/lib/server/licensing-bff";
import type { ApiPathwayEnrollment } from "@/lib/server/vetlinx-api";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/licensing/enrollments/[enrollmentId]">,
) {
  const { enrollmentId } = await context.params;
  return forwardLicensingJson<ApiPathwayEnrollment>(
    `/api/v1/licensing/me/enrollments/${encodeURIComponent(enrollmentId)}`,
    undefined,
    {
      fallback: "The licensing enrollment could not be loaded.",
      wrap: (enrollment) => ({ enrollment }),
    },
  );
}
