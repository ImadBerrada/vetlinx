import { type NextRequest, NextResponse } from "next/server";
import {
  forwardLicensingJson,
  idempotencyHeaders,
} from "@/lib/server/licensing-bff";
import { isSameOriginMutation } from "@/lib/server/route-security";
import type { ApiPathwayEnrollment } from "@/lib/server/vetlinx-api";

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/licensing/pathways/[pathwayId]/enroll">,
) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { message: "Request origin is not allowed." },
      { status: 403 },
    );
  }
  const { pathwayId } = await context.params;
  return forwardLicensingJson<ApiPathwayEnrollment>(
    `/api/v1/licensing/pathways/${encodeURIComponent(pathwayId)}/enroll`,
    { method: "POST", headers: idempotencyHeaders(request) },
    {
      fallback: "The licensing pathway could not be started.",
      successStatus: 201,
      wrap: (enrollment) => ({ enrollment }),
    },
  );
}
