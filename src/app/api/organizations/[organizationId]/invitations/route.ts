import { NextResponse } from "next/server";
import { apiErrorMessage, readJson } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

interface InvitationResponse { id: string; email: string; role: string; status: string; expiresAt: string; createdAt: string; invitationToken: string }

export async function POST(request: Request, context: RouteContext<"/api/organizations/[organizationId]/invitations">) {
  const { organizationId } = await context.params;
  const result = await callAuthenticatedApi(`/api/v1/organizations/me/${encodeURIComponent(organizationId)}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: await request.text() });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Invitation could not be created.") }, { status: result.response.status });
  const invitation = await readJson<InvitationResponse>(result.response);
  const response = NextResponse.json({ invitation }, { status: 201 });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
