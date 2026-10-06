import { proxyApi } from "@/lib/server/proxy-api";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  return proxyApi(
    `/api/v1/verification-reviews/${encodeURIComponent((await params).requestId)}/revoke`,
    "credential",
    request,
  );
}
