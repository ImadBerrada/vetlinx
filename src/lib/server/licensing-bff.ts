import "server-only";

import { NextResponse } from "next/server";
import { apiErrorMessage, readJson } from "./vetlinx-api";
import {
  callAuthenticatedApi,
  clearSessionCookies,
  setSessionCookies,
} from "./session";

interface ForwardJsonOptions<T> {
  fallback: string;
  successStatus?: number;
  wrap?: (value: T | null) => unknown;
}

export async function forwardLicensingJson<T>(
  path: string,
  init: RequestInit | undefined,
  options: ForwardJsonOptions<T>,
) {
  const result = await callAuthenticatedApi(path, init);
  if (!result.response.ok) {
    const response = NextResponse.json(
      {
        message: await apiErrorMessage(result.response, options.fallback),
      },
      { status: result.response.status },
    );
    if (result.response.status === 401) clearSessionCookies(response);
    if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
    return response;
  }

  const value = await readJson<T>(result.response);
  const response = NextResponse.json(
    options.wrap ? options.wrap(value) : value,
    { status: options.successStatus ?? result.response.status },
  );
  if (result.rotatedSession) setSessionCookies(response, result.rotatedSession);
  return response;
}

export function idempotencyHeaders(request: Request): HeadersInit {
  return {
    "idempotency-key":
      request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  };
}
