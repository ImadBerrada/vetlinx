import { NextResponse } from "next/server";
import { callApi, readJson, apiErrorMessage } from "@/lib/server/vetlinx-api";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const allowed = new URLSearchParams();
  for (const key of ["q", "countryCode", "city"]) { const value = query.get(key); if (value) allowed.set(key, value); }
  try {
    const result = await callApi(`/api/v1/clinics?${allowed}`);
    if (!result.ok) return NextResponse.json({ message: await apiErrorMessage(result, "Clinic directory could not be loaded.") }, { status: result.status });
    return NextResponse.json({ clinics: await readJson<unknown>(result) });
  } catch { return NextResponse.json({ message: "Clinic directory is temporarily unavailable." }, { status: 503 }); }
}
