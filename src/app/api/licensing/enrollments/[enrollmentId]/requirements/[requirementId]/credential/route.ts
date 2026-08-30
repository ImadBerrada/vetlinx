import { type NextRequest, NextResponse } from "next/server";
import { forwardLicensingJson } from "@/lib/server/licensing-bff";
import { isSameOriginMutation } from "@/lib/server/route-security";
import type { ApiRequirementProgress } from "@/lib/server/vetlinx-api";
import { flattenErrors } from "@/lib/validation/auth";
import { linkRequirementCredentialSchema } from "@/lib/validation/licensing";

type Context = RouteContext<"/api/licensing/enrollments/[enrollmentId]/requirements/[requirementId]/credential">;

export async function PUT(request: NextRequest, context: Context) {
  if (!isSameOriginMutation(request)) return forbidden();
  const parsed = linkRequirementCredentialSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { errors: flattenErrors(parsed.error) },
      { status: 400 },
    );
  }
  const { enrollmentId, requirementId } = await context.params;
  return forwardLicensingJson<ApiRequirementProgress>(
    `/api/v1/licensing/me/enrollments/${encodeURIComponent(enrollmentId)}/requirements/${encodeURIComponent(requirementId)}/credential`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    },
    {
      fallback: "The credential could not be linked.",
      wrap: (progress) => ({ progress }),
    },
  );
}

export async function DELETE(request: NextRequest, context: Context) {
  if (!isSameOriginMutation(request)) return forbidden();
  const { enrollmentId, requirementId } = await context.params;
  return forwardLicensingJson<ApiRequirementProgress>(
    `/api/v1/licensing/me/enrollments/${encodeURIComponent(enrollmentId)}/requirements/${encodeURIComponent(requirementId)}/credential`,
    { method: "DELETE" },
    {
      fallback: "The credential link could not be removed.",
      wrap: (progress) => ({ progress }),
    },
  );
}

function forbidden() {
  return NextResponse.json(
    { message: "Request origin is not allowed." },
    { status: 403 },
  );
}
