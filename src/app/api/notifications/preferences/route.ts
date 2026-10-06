import { proxyApi } from "@/lib/server/proxy-api";
export function GET() { return proxyApi("/api/v1/notifications/preferences", "preferences"); }
export function PATCH(request: Request) { return proxyApi("/api/v1/notifications/preferences", "preferences", request); }
