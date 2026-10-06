import { proxyApi } from "@/lib/server/proxy-api";
export async function GET() { const response = await proxyApi("/api/v1/auth/mfa", "mfa"); response.headers.set("cache-control", "no-store"); return response; }
