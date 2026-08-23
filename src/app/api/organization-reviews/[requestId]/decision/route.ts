import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiOrganizationReview } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

const endpoints = { NEEDS_INFORMATION: "request-information", VERIFIED: "approve", REJECTED: "reject" } as const;

export async function POST(request: Request, context: RouteContext<"/api/organization-reviews/[requestId]/decision">) {
  const { requestId } = await context.params;
  const body = (await request.json().catch(() => null)) as { action?: keyof typeof endpoints; reason?: string } | null;
  if (!body?.action || !(body.action in endpoints)) return NextResponse.json({ message: "A valid decision is required." }, { status: 400 });
  const result = await callAuthenticatedApi(`/api/v1/organization-reviews/${encodeURIComponent(requestId)}/${endpoints[body.action]}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: body.reason }) });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Organization decision could not be recorded.") }, { status: result.response.status });
  const review = await readJson<ApiOrganizationReview>(result.response);
  const response = NextResponse.json({ review });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
