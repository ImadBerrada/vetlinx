import "server-only";
import { NextResponse } from "next/server";
import { callAuthenticatedApi, clearSessionCookies, setSessionCookies } from "./session";
import { apiErrorMessage, readJson } from "./vetlinx-api";
import { isSameOriginMutation } from "./route-security";

export async function proxyApi(path: string, key: string, request?: Request, method?: string) {
  if (request && !isSameOriginMutation(request)) return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  try {
    const result = await callAuthenticatedApi(path, request ? { method: method ?? request.method, headers: { "content-type": "application/json" }, body: await request.text() || undefined } : undefined);
    const response = result.response.ok
      ? NextResponse.json({ [key]: await readJson<unknown>(result.response) }, { status: result.response.status })
      : NextResponse.json({ message: await apiErrorMessage(result.response, "Your request could not be completed.") }, { status: result.response.status });
    if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
    else if (result.response.status === 401) clearSessionCookies(response);
    return response;
  } catch {
    return NextResponse.json({ message: "VetLinX could not be reached. Try again." }, { status: 503 });
  }
}
