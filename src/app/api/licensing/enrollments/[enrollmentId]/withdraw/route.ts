import { type NextRequest, NextResponse } from "next/server";
import {
  forwardLicensingJson,
  idempotencyHeaders,
} from "@/lib/server/licensing-bff";
import { isSameOriginMutation } from "@/lib/server/route-security";
import type { ApiPathwayEnrollment } from "@/lib/server/vetlinx-api";

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/licensing/enrollments/[enrollmentId]/withdraw">,
) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  }
  const { enrollmentId } = await context.params;
  return forwardLicensingJson<ApiPathwayEnrollment>(
    `/api/v1/licensing/me/enrollments/${encodeURIComponent(enrollmentId)}/withdraw`,
    { method: "POST", headers: idempotencyHeaders(request) },
    {
      fallback: "The licensing enrollment could not be withdrawn.",
      wrap: (enrollment) => ({ enrollment }),
    },
  );
}
