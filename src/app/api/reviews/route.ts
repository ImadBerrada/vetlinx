import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiReviewQueueItem } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET() {
  const result = await callAuthenticatedApi("/api/v1/verification-reviews");
  if (!result.response.ok) {
    return NextResponse.json(
      { message: await apiErrorMessage(result.response, "Review queue could not be loaded.") },
      { status: result.response.status },
    );
  }
  const reviews = (await readJson<ApiReviewQueueItem[]>(result.response)) ?? [];
  const response = NextResponse.json({ reviews });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
