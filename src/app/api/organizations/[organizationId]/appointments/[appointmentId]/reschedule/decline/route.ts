import { proxyApi } from "@/lib/server/proxy-api";
export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string; appointmentId: string }> }) {
  const { organizationId, appointmentId } = await params;
  return proxyApi(`/api/v1/appointments/organizations/${encodeURIComponent(organizationId)}/${encodeURIComponent(appointmentId)}/reschedule/decline`, "appointment", request);
}
