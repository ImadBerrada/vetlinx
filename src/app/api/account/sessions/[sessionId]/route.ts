import { proxyApi } from "@/lib/server/proxy-api";
import { clearSessionCookies } from "@/lib/server/session";
export async function DELETE(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const response = await proxyApi(`/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`, "result", request);
  if (response.ok) {
    const body = await response.clone().json() as { result?: { signedOutCurrent?: boolean } };
    if (body.result?.signedOutCurrent) clearSessionCookies(response);
  }
  return response;
}
