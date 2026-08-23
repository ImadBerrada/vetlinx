import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiJobOffer } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function POST(request: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  const { offerId } = await params;
  if (!organizationId) return NextResponse.json({ message: "Organization is required." }, { status: 400 });
  const result = await callAuthenticatedApi(`/api/v1/organizations/${organizationId}/offers/${offerId}/send`, { method: "POST" });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Offer could not be sent.") }, { status: result.response.status });
  const offer = await readJson<ApiJobOffer>(result.response);
  const response = NextResponse.json({ offer });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
