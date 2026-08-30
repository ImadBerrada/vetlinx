import { forwardLicensingJson } from "@/lib/server/licensing-bff";
import type { ApiPathwayEnrollment } from "@/lib/server/vetlinx-api";

export async function GET() {
  return forwardLicensingJson<ApiPathwayEnrollment[]>(
    "/api/v1/licensing/me/enrollments",
    undefined,
    {
      fallback: "Licensing enrollments could not be loaded.",
      wrap: (enrollments) => ({ enrollments: enrollments ?? [] }),
    },
  );
}
