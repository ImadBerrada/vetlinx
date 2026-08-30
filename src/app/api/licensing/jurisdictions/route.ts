import type { ApiLicensingJurisdiction } from "@/lib/server/vetlinx-api";
import { forwardLicensingJson } from "@/lib/server/licensing-bff";

export async function GET() {
  return forwardLicensingJson<ApiLicensingJurisdiction[]>(
    "/api/v1/licensing/jurisdictions",
    undefined,
    {
      fallback: "Licensing jurisdictions could not be loaded.",
      wrap: (jurisdictions) => ({ jurisdictions: jurisdictions ?? [] }),
    },
  );
}
