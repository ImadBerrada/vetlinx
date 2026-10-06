import { proxyApi } from "@/lib/server/proxy-api";
export async function GET() { return proxyApi("/api/v1/auth/security", "security"); }
