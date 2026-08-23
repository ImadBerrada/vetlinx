import { NextRequest, NextResponse } from "next/server";
import { flattenErrors, professionalProfileSchema } from "@/lib/validation/auth";
import { apiErrorMessage, readJson, type ApiProfessionalProfile } from "@/lib/server/vetlinx-api";
import { isSameOriginMutation } from "@/lib/server/route-security";
import { callAuthenticatedApi, clearSessionCookies, setSessionCookies } from "@/lib/server/session";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  }
  const parsed = professionalProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenErrors(parsed.error) }, { status: 400 });
  }

  const result = await callAuthenticatedApi("/api/v1/professionals/me", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
  if (!result.response.ok) {
    const response = NextResponse.json(
      { message: await apiErrorMessage(result.response, "Profile creation failed.") },
      { status: result.response.status },
    );
    if (result.response.status === 401) clearSessionCookies(response);
    if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
    return response;
  }

  const profile = await readJson<ApiProfessionalProfile>(result.response);
  const response = NextResponse.json({ profile }, { status: 201 });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  const result = await callAuthenticatedApi("/api/v1/professionals/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: await request.text() });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Profile could not be updated.") }, { status: result.response.status });
  const profile = await readJson<ApiProfessionalProfile>(result.response);
  const response = NextResponse.json({ profile });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
