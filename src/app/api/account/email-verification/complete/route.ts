import { proxySecurityAction } from "@/lib/server/proxy-security-action";
export async function POST(request: Request) { return proxySecurityAction(request, "/api/v1/auth/email-verification/complete"); }
