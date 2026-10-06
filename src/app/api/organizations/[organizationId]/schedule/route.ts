import { proxyApi } from "@/lib/server/proxy-api";
export async function GET(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const query = new URLSearchParams();
  for (const key of ["cursor", "serviceId"]) { const value = new URL(request.url).searchParams.get(key); if (value) query.set(key, value); }
  return proxyApi(`/api/v1/scheduling/organizations/${encodeURIComponent(organizationId)}?${query}`, "schedule");
}
export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return proxyApi(`/api/v1/scheduling/organizations/${encodeURIComponent(organizationId)}`, "settings", request);
}
