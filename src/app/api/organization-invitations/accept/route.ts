import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiOrganizationWorkspace } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function POST(request: Request) {
  const result = await callAuthenticatedApi("/api/v1/organizations/invitations/accept", { method: "POST", headers: { "content-type": "application/json" }, body: await request.text() });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Invitation could not be accepted.") }, { status: result.response.status });
  const workspace = await readJson<ApiOrganizationWorkspace>(result.response);
  const response = NextResponse.json({ workspace });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
