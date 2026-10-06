import { proxyApi } from "@/lib/server/proxy-api";
export async function GET(request: Request, { params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params;
  const query = new URLSearchParams(); const cursor = new URL(request.url).searchParams.get("cursor"); if (cursor) query.set("cursor", cursor);
  return proxyApi(`/api/v1/scheduling/appointments/${encodeURIComponent(appointmentId)}/alternatives?${query}`, "schedule");
}
