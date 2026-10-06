import { proxyApi } from "@/lib/server/proxy-api";
export async function POST(request: Request, { params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params;
  return proxyApi(`/api/v1/appointments/${encodeURIComponent(appointmentId)}/reschedule`, "appointment", request);
}
