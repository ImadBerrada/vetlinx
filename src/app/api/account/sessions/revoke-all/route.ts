import { proxyApi } from "@/lib/server/proxy-api";
import { clearSessionCookies } from "@/lib/server/session";
export async function POST(request: Request) {
  const response = await proxyApi("/api/v1/auth/sessions/revoke-all", "result", request);
  if (response.ok) clearSessionCookies(response);
  return response;
}
