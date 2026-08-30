import { type NextRequest, NextResponse } from "next/server";
import {
  forwardLicensingJson,
  idempotencyHeaders,
} from "@/lib/server/licensing-bff";
import { isSameOriginMutation } from "@/lib/server/route-security";
import type { ApiExternalLicenceApplication } from "@/lib/server/vetlinx-api";
import { flattenErrors } from "@/lib/validation/auth";
import {
  createExternalApplicationSchema,
  updateExternalApplicationSchema,
} from "@/lib/validation/licensing";

type Context = RouteContext<"/api/licensing/enrollments/[enrollmentId]/external-application">;

export async function POST(request: NextRequest, context: Context) {
  if (!isSameOriginMutation(request)) return forbidden();
  const parsed = createExternalApplicationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return invalid(parsed.error);
  const { enrollmentId } = await context.params;
  return forwardLicensingJson<ApiExternalLicenceApplication>(
    `/api/v1/licensing/me/enrollments/${encodeURIComponent(enrollmentId)}/external-application`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...idempotencyHeaders(request),
      },
      body: JSON.stringify(parsed.data),
    },
    {
      fallback: "The external application could not be recorded.",
      successStatus: 201,
      wrap: (externalApplication) => ({ externalApplication }),
    },
  );
}

export async function PATCH(request: NextRequest, context: Context) {
  if (!isSameOriginMutation(request)) return forbidden();
  const parsed = updateExternalApplicationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return invalid(parsed.error);
  const { enrollmentId } = await context.params;
  return forwardLicensingJson<ApiExternalLicenceApplication>(
    `/api/v1/licensing/me/enrollments/${encodeURIComponent(enrollmentId)}/external-application`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    },
    {
      fallback: "The external application could not be updated.",
      wrap: (externalApplication) => ({ externalApplication }),
    },
  );
}

function forbidden() {
  return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
}

function invalid(error: Parameters<typeof flattenErrors>[0]) {
  return NextResponse.json({ errors: flattenErrors(error) }, { status: 400 });
}
