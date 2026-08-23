import { NextRequest, NextResponse } from "next/server";
import { registerSchema, flattenErrors } from "@/lib/validation/auth";
import {
  apiErrorMessage,
  callApi,
  readJson,
  type ApiAuthenticationResult,
} from "@/lib/server/vetlinx-api";
import { isSameOriginMutation } from "@/lib/server/route-security";
import { setSessionCookies } from "@/lib/server/session";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  }

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenErrors(parsed.error) }, { status: 400 });
  }

  const apiResponse = await callApi("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
  if (!apiResponse.ok) {
    return NextResponse.json(
      { message: await apiErrorMessage(apiResponse, "Account creation failed.") },
      { status: apiResponse.status },
    );
  }

  const session = await readJson<ApiAuthenticationResult>(apiResponse);
  if (!session) {
    return NextResponse.json({ message: "Account creation failed." }, { status: 502 });
  }

  const response = NextResponse.json({ account: session.account }, { status: 201 });
  setSessionCookies(response, session);
  return response;
}

