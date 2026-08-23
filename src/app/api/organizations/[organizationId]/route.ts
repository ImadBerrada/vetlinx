import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiOrganization, type ApiOrganizationWorkspace } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET(_request: Request, context: RouteContext<"/api/organizations/[organizationId]">) {
  const { organizationId } = await context.params;
  const result = await callAuthenticatedApi(`/api/v1/organizations/me/${encodeURIComponent(organizationId)}`);
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Organization workspace could not be loaded.") }, { status: result.response.status });
  const workspace = await readJson<ApiOrganizationWorkspace>(result.response);
  const response = NextResponse.json({ workspace });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}

export async function PATCH(request: Request, context: RouteContext<"/api/organizations/[organizationId]">) {
  const { organizationId } = await context.params;
  const result = await callAuthenticatedApi(`/api/v1/organizations/me/${encodeURIComponent(organizationId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: await request.text() });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Organization could not be updated.") }, { status: result.response.status });
  const organization = await readJson<ApiOrganization>(result.response);
  const response = NextResponse.json({ organization });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
