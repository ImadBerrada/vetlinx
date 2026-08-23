import { NextRequest, NextResponse } from "next/server";
import { callApi } from "@/lib/server/vetlinx-api";
import { isSameOriginMutation } from "@/lib/server/route-security";
import { clearSessionCookies, currentRefreshToken } from "@/lib/server/session";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  }
  const refreshToken = await currentRefreshToken();
  if (refreshToken) {
    await callApi("/api/v1/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  }
  const response = new NextResponse(null, { status: 204 });
  clearSessionCookies(response);
  return response;
}

