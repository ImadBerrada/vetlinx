import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiVerificationRequest } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, clearSessionCookies, setSessionCookies } from "@/lib/server/session";

export async function GET() {
  const result = await callAuthenticatedApi("/api/v1/verification-requests/me");
  if (!result.response.ok) {
    const response = NextResponse.json(
      { message: await apiErrorMessage(result.response, "Verification requests could not be loaded.") },
      { status: result.response.status },
    );
    if (result.response.status === 401) clearSessionCookies(response);
    if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
    return response;
  }
  const verificationRequests = (await readJson<ApiVerificationRequest[]>(result.response)) ?? [];
  const response = NextResponse.json({ verificationRequests });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
