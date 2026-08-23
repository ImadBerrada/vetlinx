import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiOrganizationReview } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET(_request: Request, context: RouteContext<"/api/organization-reviews/[requestId]">) {
  const { requestId } = await context.params;
  const result = await callAuthenticatedApi(`/api/v1/organization-reviews/${encodeURIComponent(requestId)}`);
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Organization review could not be loaded.") }, { status: result.response.status });
  const review = await readJson<ApiOrganizationReview>(result.response);
  const response = NextResponse.json({ review });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
