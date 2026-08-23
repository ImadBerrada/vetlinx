import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiOrganizationReview } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function POST(_request: Request, context: RouteContext<"/api/organization-reviews/[requestId]/start">) {
  const { requestId } = await context.params;
  const result = await callAuthenticatedApi(`/api/v1/organization-reviews/${encodeURIComponent(requestId)}/start`, { method: "POST" });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Organization review could not be started.") }, { status: result.response.status });
  const review = await readJson<ApiOrganizationReview>(result.response);
  const response = NextResponse.json({ review });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
