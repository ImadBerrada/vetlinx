import { proxyApi } from "@/lib/server/proxy-api";
export function GET() { return proxyApi("/api/v1/appointments/me", "appointments"); }
export function POST(request: Request) { return proxyApi("/api/v1/appointments", "appointment", request); }
