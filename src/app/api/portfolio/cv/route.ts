import { NextResponse } from "next/server";
import { apiErrorMessage } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET() {
  const result = await callAuthenticatedApi('/api/v1/portfolio/me/cv.txt');
  if (!result.response.ok) return NextResponse.json({ message: await apiErrorMessage(result.response, "CV could not be generated.") }, { status: result.response.status });
  const response = new NextResponse(result.response.body, { headers: { "content-type": result.response.headers.get("content-type") ?? "text/plain; charset=utf-8", "content-disposition": result.response.headers.get("content-disposition") ?? 'attachment; filename="vetlinx-cv.txt"' } });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
