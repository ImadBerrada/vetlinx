import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiJobApplication } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET() {
  const result = await callAuthenticatedApi('/api/v1/applications/me');
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Applications could not be loaded.") }, { status: result.response.status });
  const applications = (await readJson<ApiJobApplication[]>(result.response)) ?? [];
  const response = NextResponse.json({ applications });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
