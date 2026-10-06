import { proxyApi } from "@/lib/server/proxy-api";
import { clearSessionCookies } from "@/lib/server/session";
export async function POST(request: Request) { const response = await proxyApi("/api/v1/auth/mfa/disable", "result", request); response.headers.set("cache-control", "no-store"); if (response.ok) clearSessionCookies(response); return response; }
