import { NextResponse } from "next/server";
import { callAuthenticatedApi, clearSessionCookies, setSessionCookies } from "@/lib/server/session";
import { callApi, readJson, type ApiProfessionalProfile, type ApiSystemRole } from "@/lib/server/vetlinx-api";

export async function GET() {
  const accountResult = await callAuthenticatedApi("/api/v1/auth/me");
  if (!accountResult.response.ok) {
    const response = NextResponse.json({ message: "Sign in required." }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }

  const account = await readJson<{ accountId: string; email: string; roles: ApiSystemRole[] }>(accountResult.response);
  const profileResult = accountResult.rotatedSession
    ? {
        response: await callApi("/api/v1/professionals/me", {
          headers: {
            authorization: `Bearer ${accountResult.rotatedSession.accessToken}`,
          },
        }),
        rotatedSession: null,
      }
    : await callAuthenticatedApi("/api/v1/professionals/me");
  const profile = profileResult.response.ok
    ? await readJson<ApiProfessionalProfile>(profileResult.response)
    : null;
  const response = NextResponse.json({ account, profile });
  const rotated = profileResult.rotatedSession ?? accountResult.rotatedSession;
  if (rotated) setSessionCookies(response, rotated);
  return response;
}
