import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { callApi, readJson, type ApiAuthenticationResult, type ApiOrganizationMembershipSummary } from "./vetlinx-api";
import { setSessionCookies } from "./session";
import { organizationIdFromWorkspace, WORKSPACE_PREFERENCE_COOKIE } from "@/lib/workspace-preference";

export async function finishSignIn(request: NextRequest, session: ApiAuthenticationResult) {
  const authorization = { authorization: `Bearer ${session.accessToken}` };
  const [profileResponse, organizationsResponse, ownerResponse] = await Promise.all([
    callApi("/api/v1/professionals/me", { headers: authorization }),
    callApi("/api/v1/organizations/me", { headers: authorization }),
    callApi("/api/v1/owners/me", { headers: authorization }),
  ]);
  const organizations = organizationsResponse.ok ? (await readJson<ApiOrganizationMembershipSummary[]>(organizationsResponse)) ?? [] : [];
  const hasProfile = profileResponse.ok;
  const hasOwner = ownerResponse.ok;
  const canReview = session.account.roles.some((role) => ["REVIEWER", "OPERATIONS_ADMIN", "PLATFORM_ADMIN"].includes(role));
  const preference = request.cookies.get(WORKSPACE_PREFERENCE_COOKIE)?.value;
  const preferredOrganizationId = organizationIdFromWorkspace(preference);
  const preferredOrganization = organizations.some((item) => item.organization.id === preferredOrganizationId);
  const next = preference === "owner" && hasOwner ? "/owner" : preference === "personal" && hasProfile ? "/" : preference === "trust" && canReview ? "/review" : preferredOrganization ? "/employer" : hasProfile ? "/" : canReview ? "/review" : organizations.length ? "/employer" : hasOwner ? "/owner" : "/get-started";
  const response = NextResponse.json({ account: session.account, next }, { headers: { "cache-control": "no-store" } });
  const selectedWorkspace = next === "/owner" ? "owner" : next === "/" ? "personal" : next === "/review" ? "trust" : next === "/employer" ? `organization:${preferredOrganization ? preferredOrganizationId : organizations[0]?.organization.id}` : null;
  if (selectedWorkspace) response.cookies.set(WORKSPACE_PREFERENCE_COOKIE, selectedWorkspace, { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  setSessionCookies(response, session);
  return response;
}
