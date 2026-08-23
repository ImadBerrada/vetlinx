import { NextRequest, NextResponse } from "next/server";
import { loginSchema, flattenErrors } from "@/lib/validation/auth";
import {
  apiErrorMessage,
  callApi,
  readJson,
  type ApiAuthenticationResult,
} from "@/lib/server/vetlinx-api";
import { isSameOriginMutation } from "@/lib/server/route-security";
import { setSessionCookies } from "@/lib/server/session";
import {
  organizationIdFromWorkspace,
  WORKSPACE_PREFERENCE_COOKIE,
} from "@/lib/workspace-preference";
import type { ApiOrganizationMembershipSummary } from "@/lib/server/vetlinx-api";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenErrors(parsed.error) }, { status: 400 });
  }

  const apiResponse = await callApi("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
  if (!apiResponse.ok) {
    return NextResponse.json(
      { message: await apiErrorMessage(apiResponse, "Email or password is incorrect.") },
      { status: apiResponse.status },
    );
  }

  const session = await readJson<ApiAuthenticationResult>(apiResponse);
  if (!session) {
    return NextResponse.json({ message: "Sign in failed." }, { status: 502 });
  }

  const authorization = { authorization: `Bearer ${session.accessToken}` };
  const [profileResponse, organizationsResponse] = await Promise.all([
    callApi("/api/v1/professionals/me", { headers: authorization }),
    callApi("/api/v1/organizations/me", { headers: authorization }),
  ]);
  const organizations = organizationsResponse.ok
    ? ((await readJson<ApiOrganizationMembershipSummary[]>(organizationsResponse)) ?? [])
    : [];
  const hasProfile = profileResponse.ok;
  const canReview = session.account.roles.some((role) =>
    ["REVIEWER", "OPERATIONS_ADMIN", "PLATFORM_ADMIN"].includes(role),
  );
  const preference = request.cookies.get(WORKSPACE_PREFERENCE_COOKIE)?.value;
  const preferredOrganizationId = organizationIdFromWorkspace(preference);
  const preferredOrganization = organizations.some(
    (item) => item.organization.id === preferredOrganizationId,
  );
  const next =
    preference === "personal" && hasProfile
      ? "/"
      : preference === "trust" && canReview
        ? "/review"
        : preferredOrganization
          ? "/employer"
          : hasProfile
            ? "/"
            : canReview
              ? "/review"
              : organizations.length
                ? "/employer"
                : "/onboarding";
  const response = NextResponse.json({ account: session.account, next });
  setSessionCookies(response, session);
  return response;
}
