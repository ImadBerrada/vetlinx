import { proxyApi } from "@/lib/server/proxy-api";
export function GET() { return proxyApi("/api/v1/owners/me", "owner"); }
export function PUT(request: Request) { return proxyApi("/api/v1/owners/me", "owner", request); }
