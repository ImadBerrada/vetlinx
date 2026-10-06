import { proxyApi } from "@/lib/server/proxy-api";
export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string }> }) { return proxyApi(`/api/v1/appointments/organizations/${encodeURIComponent((await params).organizationId)}`, "appointments"); }
