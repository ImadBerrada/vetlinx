import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiJobApplication } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const result = await callAuthenticatedApi(`/api/v1/jobs/${jobId}/applications`, { method: "POST", headers: { "content-type": "application/json" }, body: await request.text() });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Application could not be submitted.") }, { status: result.response.status });
  const application = await readJson<ApiJobApplication>(result.response);
  const response = NextResponse.json({ application }, { status: 201 });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
