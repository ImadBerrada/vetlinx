import type { NextRequest } from "next/server";
import { licensingAdminMutation } from "@/lib/server/licensing-admin-bff";
import { forwardLicensingJson } from "@/lib/server/licensing-bff";
import type { ApiAdminLicencePathway } from "@/lib/server/vetlinx-api";
import { createLicencePathwaySchema } from "@/lib/validation/licensing";

export async function GET(request: NextRequest) {
  const query = new URLSearchParams();
  for (const key of ["jurisdictionCode", "licenceTypeCode", "status"] as const) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) query.set(key, value);
  }
  return forwardLicensingJson<ApiAdminLicencePathway[]>(
    `/api/v1/licensing/admin/pathways${query.size ? `?${query.toString()}` : ""}`,
    undefined,
    {
      fallback: "The licensing review queue could not be loaded.",
      wrap: (pathways) => ({ pathways: pathways ?? [] }),
    },
  );
}

export async function POST(request: NextRequest) {
  return licensingAdminMutation(request, {
    path: "/api/v1/licensing/admin/pathways",
    method: "POST",
    schema: createLicencePathwaySchema,
    fallback: "The licensing pathway could not be created.",
    idempotent: true,
  });
}
