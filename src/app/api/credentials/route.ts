import { NextRequest, NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiCredential } from "@/lib/server/vetlinx-api";
import { isSameOriginMutation } from "@/lib/server/route-security";
import { callAuthenticatedApi, clearSessionCookies, setSessionCookies } from "@/lib/server/session";
import { flattenErrors } from "@/lib/validation/auth";
import { credentialSchema } from "@/lib/validation/credentials";

export async function GET() {
  const result = await callAuthenticatedApi("/api/v1/credentials/me");
  if (!result.response.ok) {
    const response = NextResponse.json(
      { message: await apiErrorMessage(result.response, "Credentials could not be loaded.") },
      { status: result.response.status },
    );
    if (result.response.status === 401) clearSessionCookies(response);
    if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
    return response;
  }
  const credentials = (await readJson<ApiCredential[]>(result.response)) ?? [];
  const response = NextResponse.json({ credentials });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  }
  const parsed = credentialSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenErrors(parsed.error) }, { status: 400 });
  }
  const result = await callAuthenticatedApi("/api/v1/credentials/me", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
  if (!result.response.ok) {
    const response = NextResponse.json(
      { message: await apiErrorMessage(result.response, "Credential could not be saved.") },
      { status: result.response.status },
    );
    if (result.response.status === 401) clearSessionCookies(response);
    if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
    return response;
  }
  const credential = await readJson<ApiCredential>(result.response);
  const response = NextResponse.json({ credential }, { status: 201 });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
