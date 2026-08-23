import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiInterview } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET() {
  const result = await callAuthenticatedApi('/api/v1/interviews/me');
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Interviews could not be loaded.") }, { status: result.response.status });
  const interviews = (await readJson<ApiInterview[]>(result.response)) ?? [];
  const response = NextResponse.json({ interviews });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
