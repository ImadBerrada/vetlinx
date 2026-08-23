import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiPortfolio } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET() {
  const result = await callAuthenticatedApi('/api/v1/portfolio/me');
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Portfolio could not be loaded.") }, { status: result.response.status });
  const portfolio = await readJson<ApiPortfolio>(result.response);
  const response = NextResponse.json({ portfolio });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
