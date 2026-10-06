import { NextResponse } from "next/server";
import { callApi, readJson, apiErrorMessage } from "@/lib/server/vetlinx-api";
export async function GET(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const input = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ["serviceId", "cursor"]) { const value = input.get(key); if (value) query.set(key, value); }
  try {
    const result = await callApi(`/api/v1/scheduling/clinics/${encodeURIComponent(organizationId)}?${query}`);
    if (!result.ok) return NextResponse.json({ message: await apiErrorMessage(result, "Available times could not be loaded.") }, { status: result.status });
    return NextResponse.json({ schedule: await readJson<unknown>(result) });
  } catch { return NextResponse.json({ message: "Available times could not be loaded. Try again." }, { status: 503 }); }
}
