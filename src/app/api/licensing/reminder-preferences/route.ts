import { type NextRequest, NextResponse } from "next/server";
import { forwardLicensingJson } from "@/lib/server/licensing-bff";
import { isSameOriginMutation } from "@/lib/server/route-security";
import type { ApiLicensingReminderPreference } from "@/lib/server/vetlinx-api";
import { flattenErrors } from "@/lib/validation/auth";
import { licensingReminderPreferenceSchema } from "@/lib/validation/licensing";

export async function GET() {
  return forwardLicensingJson<ApiLicensingReminderPreference>(
    "/api/v1/licensing/me/reminder-preferences",
    undefined,
    {
      fallback: "Licensing reminder preferences could not be loaded.",
      wrap: (preference) => ({ preference }),
    },
  );
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  }
  const parsed = licensingReminderPreferenceSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenErrors(parsed.error) }, { status: 400 });
  }
  return forwardLicensingJson<ApiLicensingReminderPreference>(
    "/api/v1/licensing/me/reminder-preferences",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    },
    {
      fallback: "Licensing reminder preferences could not be saved.",
      wrap: (preference) => ({ preference }),
    },
  );
}
