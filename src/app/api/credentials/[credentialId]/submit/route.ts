import { NextRequest, NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiCredential } from "@/lib/server/vetlinx-api";
import { isSameOriginMutation } from "@/lib/server/route-security";
import { callAuthenticatedApi, clearSessionCookies, setSessionCookies } from "@/lib/server/session";

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/credentials/[credentialId]/submit">,
) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  }
  const { credentialId } = await context.params;
  const result = await callAuthenticatedApi(
    `/api/v1/credentials/me/${encodeURIComponent(credentialId)}/submit`,
    { method: "POST" },
  );
  if (!result.response.ok) {
    const response = NextResponse.json(
      { message: await apiErrorMessage(result.response, "Credential could not be submitted.") },
      { status: result.response.status },
    );
    if (result.response.status === 401) clearSessionCookies(response);
    if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
    return response;
  }
  const credential = await readJson<ApiCredential>(result.response);
  const response = NextResponse.json({ credential });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
