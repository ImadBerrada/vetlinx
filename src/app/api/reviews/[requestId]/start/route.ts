import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiVerificationReview } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function POST(_request: Request, context: RouteContext<"/api/reviews/[requestId]/start">) {
  const { requestId } = await context.params;
  const result = await callAuthenticatedApi(`/api/v1/verification-reviews/${encodeURIComponent(requestId)}/start`, { method: "POST" });
  if (!result.response.ok) {
    return NextResponse.json(
      { message: await apiErrorMessage(result.response, "The review could not be started.") },
      { status: result.response.status },
    );
  }
  const review = await readJson<ApiVerificationReview>(result.response);
  const response = NextResponse.json({ review });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
