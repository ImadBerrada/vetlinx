import "server-only";
import { NextResponse } from "next/server";
import { isSameOriginMutation } from "./route-security";
import { callApi, apiErrorMessage, readJson } from "./vetlinx-api";
import { clearSessionCookies } from "./session";

export async function proxySecurityAction(request: Request, path: string, clearSession = false) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  try {
    const result = await callApi(path, { method: "POST", headers: { "content-type": "application/json" }, body: await request.text() });
    const response = result.ok
      ? NextResponse.json(await readJson<unknown>(result), { status: result.status, headers: { "cache-control": "no-store" } })
      : NextResponse.json({ message: await apiErrorMessage(result, "Your request could not be completed.") }, { status: result.status, headers: { "cache-control": "no-store" } });
    if (clearSession && result.ok) clearSessionCookies(response);
    return response;
  } catch {
    return NextResponse.json({ message: "VetLinX could not be reached. Try again." }, { status: 503 });
  }
}
