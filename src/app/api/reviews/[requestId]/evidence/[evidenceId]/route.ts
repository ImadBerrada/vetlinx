import { NextResponse } from "next/server";
import { apiErrorMessage } from "@/lib/server/vetlinx-api";
import { callAuthenticatedApi, setSessionCookies } from "@/lib/server/session";

export async function GET(_request: Request, context: RouteContext<"/api/reviews/[requestId]/evidence/[evidenceId]">) {
  const { requestId, evidenceId } = await context.params;
  const result = await callAuthenticatedApi(
    `/api/v1/verification-reviews/${encodeURIComponent(requestId)}/evidence/${encodeURIComponent(evidenceId)}`,
  );
  if (!result.response.ok || !result.response.body) {
    return NextResponse.json(
      { message: await apiErrorMessage(result.response, "Evidence is not available.") },
      { status: result.response.status },
    );
  }
  const headers = new Headers({
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "content-type": result.response.headers.get("content-type") ?? "application/octet-stream",
  });
  const disposition = result.response.headers.get("content-disposition");
  if (disposition) headers.set("content-disposition", disposition);
  const response = new NextResponse(result.response.body, { status: 200, headers });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
