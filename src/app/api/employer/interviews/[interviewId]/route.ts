import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiInterview } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function PATCH(request: Request, { params }: { params: Promise<{ interviewId: string }> }) {
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  const { interviewId } = await params;
  if (!organizationId) return NextResponse.json({ message: "Organization is required." }, { status: 400 });
  const result = await callAuthenticatedApi(`/api/v1/organizations/${organizationId}/interviews/${interviewId}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: await request.text() });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Interview could not be updated.") }, { status: result.response.status });
  const interview = await readJson<ApiInterview>(result.response);
  const response = NextResponse.json({ interview });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
