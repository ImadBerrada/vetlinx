import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiOrganizationReview } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET() {
  const result = await callAuthenticatedApi("/api/v1/organization-reviews");
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Organization review queue could not be loaded.") }, { status: result.response.status });
  const reviews = (await readJson<ApiOrganizationReview[]>(result.response)) ?? [];
  const response = NextResponse.json({ reviews });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
