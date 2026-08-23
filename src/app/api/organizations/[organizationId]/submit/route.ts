import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiOrganizationVerification } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function POST(_request: Request, context: RouteContext<"/api/organizations/[organizationId]/submit">) {
  const { organizationId } = await context.params;
  const result = await callAuthenticatedApi(`/api/v1/organizations/me/${encodeURIComponent(organizationId)}/verification/submit`, { method: "POST" });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Organization verification could not be submitted.") }, { status: result.response.status });
  const verification = await readJson<ApiOrganizationVerification>(result.response);
  const response = NextResponse.json({ verification });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
