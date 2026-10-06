import { proxyApi } from "@/lib/server/proxy-api";
export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string }> }) { return proxyApi(`/api/v1/clinics/${encodeURIComponent((await params).organizationId)}/booking`, "availability", request); }
