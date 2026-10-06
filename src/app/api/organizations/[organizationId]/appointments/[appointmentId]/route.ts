import { proxyApi } from "@/lib/server/proxy-api";
export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; appointmentId: string }> }) {
  const { organizationId, appointmentId } = await params;
  return proxyApi(`/api/v1/appointments/organizations/${encodeURIComponent(organizationId)}/${encodeURIComponent(appointmentId)}`, "appointment", request);
}
