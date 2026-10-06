import { proxyApi } from "@/lib/server/proxy-api";
export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; itemId: string }> }) {
  const { organizationId, itemId } = await params;
  return proxyApi(`/api/v1/scheduling/organizations/${encodeURIComponent(organizationId)}/slots/${encodeURIComponent(itemId)}`, "result", request);
}