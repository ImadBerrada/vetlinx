import { proxyApi } from "@/lib/server/proxy-api";
export async function POST(request: Request) { return proxyApi("/api/v1/auth/email-verification/request", "result", request); }
