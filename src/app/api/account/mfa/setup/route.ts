import { proxyApi } from "@/lib/server/proxy-api";
export async function POST(request: Request) { const response = await proxyApi("/api/v1/auth/mfa/setup", "result", request); response.headers.set("cache-control", "no-store"); return response; }
