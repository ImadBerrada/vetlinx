import { proxyApi } from "@/lib/server/proxy-api";
export async function GET() {
  return proxyApi("/api/v1/verification-reviews/lifecycle", "records");
}
