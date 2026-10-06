import { proxyApi } from "@/lib/server/proxy-api";
export async function POST(request: Request, { params }: { params: Promise<{ petId: string }> }) { return proxyApi(`/api/v1/owners/me/pets/${encodeURIComponent((await params).petId)}/archive`, "result", request); }
