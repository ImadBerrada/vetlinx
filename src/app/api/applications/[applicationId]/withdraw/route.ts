import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiJobApplication } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function POST(_request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const result = await callAuthenticatedApi(`/api/v1/applications/me/${applicationId}/withdraw`, { method: "POST" });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Application could not be withdrawn.") }, { status: result.response.status });
  const application = await readJson<ApiJobApplication>(result.response);
  const response = NextResponse.json({ application });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
