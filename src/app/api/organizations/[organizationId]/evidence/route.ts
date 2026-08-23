import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiOrganizationVerification } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function POST(request: Request, context: RouteContext<"/api/organizations/[organizationId]/evidence">) {
  const { organizationId } = await context.params;
  const formData = await request.formData();
  const result = await callAuthenticatedApi(`/api/v1/organizations/me/${encodeURIComponent(organizationId)}/verification/evidence`, { method: "POST", body: formData });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Organization evidence could not be uploaded.") }, { status: result.response.status });
  const verification = await readJson<ApiOrganizationVerification>(result.response);
  const response = NextResponse.json({ verification }, { status: 201 });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
