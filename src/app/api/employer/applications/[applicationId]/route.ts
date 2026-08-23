import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiJobApplication } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function PATCH(request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  const { applicationId } = await params;
  if (!organizationId) return NextResponse.json({ message: "Organization is required." }, { status: 400 });
  const result = await callAuthenticatedApi(`/api/v1/organizations/${organizationId}/applications/${applicationId}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: await request.text() });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Application could not be updated.") }, { status: result.response.status });
  const application = await readJson<ApiJobApplication>(result.response);
  const response = NextResponse.json({ application });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
