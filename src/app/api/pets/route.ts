import { proxyApi } from "@/lib/server/proxy-api";
export function GET() { return proxyApi("/api/v1/owners/me/pets", "pets"); }
export function POST(request: Request) { return proxyApi("/api/v1/owners/me/pets", "pet", request); }
