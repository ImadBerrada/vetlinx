import { proxyApi } from "@/lib/server/proxy-api";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyApi(`/api/v1/platform/delivery/event/${encodeURIComponent(id)}/retry`, "result", request);
}
