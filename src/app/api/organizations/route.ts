import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiOrganizationMembershipSummary, type ApiOrganizationWorkspace } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET() {
  const result = await callAuthenticatedApi("/api/v1/organizations/me");
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Organizations could not be loaded.") }, { status: result.response.status });
  const organizations = (await readJson<ApiOrganizationMembershipSummary[]>(result.response)) ?? [];
  const response = NextResponse.json({ organizations });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}

export async function POST(request: Request) {
  const body = await request.text();
  const result = await callAuthenticatedApi("/api/v1/organizations/me", { method: "POST", headers: { "content-type": "application/json" }, body });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Organization could not be created.") }, { status: result.response.status });
  const workspace = await readJson<ApiOrganizationWorkspace>(result.response);
  const response = NextResponse.json({ workspace }, { status: 201 });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
