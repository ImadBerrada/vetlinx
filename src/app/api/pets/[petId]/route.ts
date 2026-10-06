import { proxyApi } from "@/lib/server/proxy-api";
export async function PATCH(request: Request, { params }: { params: Promise<{ petId: string }> }) { return proxyApi(`/api/v1/owners/me/pets/${encodeURIComponent((await params).petId)}`, "pet", request); }
