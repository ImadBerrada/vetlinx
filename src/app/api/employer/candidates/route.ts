import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiCandidate } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET(request: Request) {
  const source = new URL(request.url);
  const organizationId = source.searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ message: "Organization is required." }, { status: 400 });
  source.searchParams.delete("organizationId");
  const suffix = source.searchParams.toString();
  const result = await callAuthenticatedApi(`/api/v1/organizations/${organizationId}/candidates${suffix ? `?${suffix}` : ""}`);
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Candidates could not be loaded.") }, { status: result.response.status });
  const candidates = (await readJson<ApiCandidate[]>(result.response)) ?? [];
  const response = NextResponse.json({ candidates });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
