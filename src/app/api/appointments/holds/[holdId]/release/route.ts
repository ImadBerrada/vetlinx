import { proxyApi } from "@/lib/server/proxy-api";
export async function POST(request: Request, { params }: { params: Promise<{ holdId: string }> }) {
  const { holdId } = await params;
  return proxyApi(`/api/v1/scheduling/holds/${encodeURIComponent(holdId)}/release`, "result", request);
}
