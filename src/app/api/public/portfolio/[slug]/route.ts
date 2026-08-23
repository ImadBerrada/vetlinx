import { NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiPortfolio } from "@/lib/server/vetlinx-api";
import { callApi } from "@/lib/server/vetlinx-api";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const response = await callApi(`/api/v1/portfolio/public/${encodeURIComponent(slug)}`);
  if (!response.ok) return NextResponse.json({ message: await apiErrorMessage(response, "Portfolio not found.") }, { status: response.status });
  return NextResponse.json({ portfolio: await readJson<ApiPortfolio>(response) });
}
