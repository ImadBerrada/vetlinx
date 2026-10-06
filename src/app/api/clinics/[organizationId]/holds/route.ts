import { proxyApi } from "@/lib/server/proxy-api";
export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return proxyApi(`/api/v1/scheduling/clinics/${encodeURIComponent(organizationId)}/holds`, "hold", request);
}
