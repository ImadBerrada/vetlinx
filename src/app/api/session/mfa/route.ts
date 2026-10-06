import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOriginMutation } from "@/lib/server/route-security";
import { apiErrorMessage, callApi, readJson, type ApiAuthenticationResult } from "@/lib/server/vetlinx-api";
import { finishSignIn } from "@/lib/server/finish-sign-in";
const schema = z.object({ challengeToken: z.string().regex(/^[a-f0-9]{96}$/), code: z.string().min(6).max(80) }).strict();
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Enter an authenticator code or an unused recovery code." }, { status: 400 });
  try {
    const response = await callApi("/api/v1/auth/mfa/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
    if (!response.ok) return NextResponse.json({ message: await apiErrorMessage(response, "Two-step sign-in failed. Try the next code or sign in again.") }, { status: response.status });
    const result = await readJson<ApiAuthenticationResult>(response);
    if (!result) return NextResponse.json({ message: "Sign in failed." }, { status: 502 });
    return finishSignIn(request, result);
  } catch {
    return NextResponse.json({ message: "VetLinX could not be reached. Try again." }, { status: 503 });
  }
}
