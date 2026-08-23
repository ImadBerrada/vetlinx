import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiNotification } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function POST(_request: Request, context: RouteContext<"/api/notifications/[notificationId]/read">) {
  const { notificationId } = await context.params;
  const result = await callAuthenticatedApi(
    `/api/v1/notifications/me/${encodeURIComponent(notificationId)}/read`,
    { method: "POST" },
  );
  if (!result.response.ok) {
    return NextResponse.json(
      { message: await apiErrorMessage(result.response, "Notification could not be updated.") },
      { status: result.response.status },
    );
  }
  const notification = await readJson<ApiNotification>(result.response);
  const response = NextResponse.json({ notification });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
