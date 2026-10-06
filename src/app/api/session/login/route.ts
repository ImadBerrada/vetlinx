import { NextRequest, NextResponse } from "next/server";
import { loginSchema, flattenErrors } from "@/lib/validation/auth";
import { apiErrorMessage, callApi, readJson, type ApiAuthenticationResult } from "@/lib/server/vetlinx-api";
import { isSameOriginMutation } from "@/lib/server/route-security";
import { clearSessionCookies } from "@/lib/server/session";
import { finishSignIn } from "@/lib/server/finish-sign-in";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ errors: flattenErrors(parsed.error) }, { status: 400 });
  try {
    const apiResponse = await callApi("/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
    if (!apiResponse.ok) return NextResponse.json({ message: await apiErrorMessage(apiResponse, "Email or password is incorrect.") }, { status: apiResponse.status });
    const result = await readJson<ApiAuthenticationResult | { mfaRequired: true; challengeToken: string; expiresIn: number }>(apiResponse);
    if (!result) return NextResponse.json({ message: "Sign in failed." }, { status: 502 });
    if ("mfaRequired" in result) {
      const response = NextResponse.json(result, { headers: { "cache-control": "no-store" } });
      clearSessionCookies(response);
      return response;
    }
    return finishSignIn(request, result);
  } catch {
    return NextResponse.json({ message: "VetLinX could not be reached. Try again." }, { status: 503 });
  }
}
