import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiJobOffer } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET() {
  const result = await callAuthenticatedApi('/api/v1/offers/me');
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Offers could not be loaded.") }, { status: result.response.status });
  const offers = (await readJson<ApiJobOffer[]>(result.response)) ?? [];
  const response = NextResponse.json({ offers });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
