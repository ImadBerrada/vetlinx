import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiJobOffer } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function POST(request: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const result = await callAuthenticatedApi(`/api/v1/offers/me/${offerId}/respond`, { method: "POST", headers: { "content-type": "application/json" }, body: await request.text() });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Offer response could not be saved.") }, { status: result.response.status });
  const offer = await readJson<ApiJobOffer>(result.response);
  const response = NextResponse.json({ offer });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
