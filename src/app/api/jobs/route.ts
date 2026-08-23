import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiJob } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.toString();
  const result = await callAuthenticatedApi(`/api/v1/jobs${query ? `?${query}` : ""}`);
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Jobs could not be loaded.") }, { status: result.response.status });
  const jobs = (await readJson<ApiJob[]>(result.response)) ?? [];
  const response = NextResponse.json({ jobs });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
