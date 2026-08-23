import { NextRequest, NextResponse } from "next/server";
import { apiErrorMessage, readJson, type ApiVerificationRequest } from "@/lib/server/vetlinx-api";
import { isSameOriginMutation } from "@/lib/server/route-security";
import { callAuthenticatedApi, clearSessionCookies, setSessionCookies } from "@/lib/server/session";

const MAX_BYTES = 10 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);

export async function POST(request: NextRequest, context: RouteContext<"/api/verification-requests/[requestId]/evidence">) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  const inbound = await request.formData().catch(() => null);
  const file = inbound?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Select an evidence file." }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ message: "Use a PDF, PNG, or JPEG evidence file." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ message: "Evidence files must be between 1 byte and 10 MB." }, { status: 400 });
  const body = new FormData();
  body.set("file", file, file.name);
  const { requestId } = await context.params;
  const result = await callAuthenticatedApi(`/api/v1/verification-requests/me/${encodeURIComponent(requestId)}/evidence`, { method: "POST", body });
  if (!result.response.ok) {
    const response = NextResponse.json({ message: await apiErrorMessage(result.response, "Evidence could not be uploaded.") }, { status: result.response.status });
    if (result.response.status === 401) clearSessionCookies(response);
    if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
    return response;
  }
  const verificationRequest = await readJson<ApiVerificationRequest>(result.response);
  const response = NextResponse.json({ verificationRequest }, { status: 201 });
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}
