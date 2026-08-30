import { type NextRequest } from "next/server";
import { forwardLicensingJson } from "@/lib/server/licensing-bff";
import type { ApiLicencePathwaySummary } from "@/lib/server/vetlinx-api";

export async function GET(request: NextRequest) {
  const query = new URLSearchParams();
  for (const key of ["jurisdictionCode", "licenceTypeCode"] as const) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) query.set(key, value);
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  return forwardLicensingJson<ApiLicencePathwaySummary[]>(
    `/api/v1/licensing/pathways${suffix}`,
    undefined,
    {
      fallback: "Licensing pathways could not be loaded.",
      wrap: (pathways) => ({ pathways: pathways ?? [] }),
    },
  );
}
