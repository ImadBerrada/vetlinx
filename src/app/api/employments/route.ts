import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiEmployment } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET() {
  const result = await callAuthenticatedApi('/api/v1/employments/me');
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "Employment record could not be loaded.") }, { status: result.response.status });
  const employments = (await readJson<ApiEmployment[]>(result.response)) ?? [];
  const response = NextResponse.json({ employments });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
