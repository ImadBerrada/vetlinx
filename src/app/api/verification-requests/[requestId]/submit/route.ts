import { NextRequest, NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiVerificationRequest } from "@/lib/server/vetlinx-api";
import { isSameOriginMutation } from "@/lib/server/route-security";
import { callAuthenticatedApi, clearSessionCookies, setSessionCookies } from "@/lib/server/session";

export async function POST(request: NextRequest, context: RouteContext<"/api/verification-requests/[requestId]/submit">) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  const { requestId } = await context.params;
  const result = await callAuthenticatedApi(`/api/v1/verification-requests/me/${encodeURIComponent(requestId)}/submit`, { method: "POST" });
  if (!result.response.ok) {
    const response = NextResponse.json({ message: await apiErrorMessage(result.response, "Evidence could not be submitted for review.") }, { status: result.response.status });
    if (result.response.status === 401) clearSessionCookies(response);
    if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
    return response;
  }
  const verificationRequest = await readJson<ApiVerificationRequest>(result.response);
  const response = NextResponse.json({ verificationRequest });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
