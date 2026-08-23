import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiJob } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ message: "Organization is required." }, { status: 400 });
  const result = await callAuthenticatedApi(`/api/v1/organizations/${organizationId}/jobs`);
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Jobs could not be loaded.") }, { status: result.response.status });
  const jobs = (await readJson<ApiJob[]>(result.response)) ?? [];
  const response = NextResponse.json({ jobs });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}

export async function POST(request: Request) {
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ message: "Organization is required." }, { status: 400 });
  const result = await callAuthenticatedApi(`/api/v1/organizations/${organizationId}/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: await request.text() });
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Job could not be created.") }, { status: result.response.status });
  const job = await readJson<ApiJob>(result.response);
  const response = NextResponse.json({ job }, { status: 201 });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
