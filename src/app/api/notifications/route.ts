import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiNotification } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET() {
  const result = await callAuthenticatedApi("/api/v1/notifications/me");
  if (!result.response.ok) {
    return NextResponse.json(
      { message: await apiErrorMessage(result.response, "Notifications could not be loaded.") },
      { status: result.response.status },
    );
  }
  const notifications = (await readJson<ApiNotification[]>(result.response)) ?? [];
  const response = NextResponse.json({ notifications });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
