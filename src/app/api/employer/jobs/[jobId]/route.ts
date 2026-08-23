import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiJob } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function PATCH(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  const { jobId } = await params;
  if (!organizationId) return NextResponse.json({ message: "Organization is required." }, { status: 400 });
  const result = await callAuthenticatedApi(`/api/v1/organizations/${organizationId}/jobs/${jobId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: await request.text() });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Job could not be updated.") }, { status: result.response.status });
  const job = await readJson<ApiJob>(result.response);
  const response = NextResponse.json({ job });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
