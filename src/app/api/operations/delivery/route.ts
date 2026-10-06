import { proxyApi } from "@/lib/server/proxy-api";
export function GET() { return proxyApi("/api/v1/platform/delivery", "status"); }
