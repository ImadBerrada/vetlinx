import { type NextRequest, NextResponse } from "next/server";
import { forwardLicensingJson } from "@/lib/server/licensing-bff";
import { isSameOriginMutation } from "@/lib/server/route-security";
import type { ApiRequirementProgress } from "@/lib/server/vetlinx-api";
import { flattenErrors } from "@/lib/validation/auth";
import { requirementProgressSchema } from "@/lib/validation/licensing";

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/licensing/enrollments/[enrollmentId]/requirements/[requirementId]">,
) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  }
  const parsed = requirementProgressSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenErrors(parsed.error) }, { status: 400 });
  }
  const { enrollmentId, requirementId } = await context.params;
  return forwardLicensingJson<ApiRequirementProgress>(
    `/api/v1/licensing/me/enrollments/${encodeURIComponent(enrollmentId)}/requirements/${encodeURIComponent(requirementId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    },
    {
      fallback: "Requirement progress could not be saved.",
      wrap: (progress) => ({ progress }),
    },
  );
}
