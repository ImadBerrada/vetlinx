import { proxyApi } from "@/lib/server/proxy-api";
export async function POST(request: Request, { params }: { params: Promise<{ appointmentId: string }> }) {
  return proxyApi(`/api/v1/appointments/${encodeURIComponent((await params).appointmentId)}/proposal/accept`, "appointment", request);
}
