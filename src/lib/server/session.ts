import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  callApi,
  readJson,
  type ApiAuthenticationResult,
} from "./vetlinx-api";

const ACCESS_COOKIE = "vetlinx_access";
const REFRESH_COOKIE = "vetlinx_refresh";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export function setSessionCookies(
  response: NextResponse,
  session: ApiAuthenticationResult,
): void {
  response.cookies.set(ACCESS_COOKIE, session.accessToken, {
    ...cookieBase,
    maxAge: session.expiresIn,
  });
  response.cookies.set(REFRESH_COOKIE, session.refreshToken, {
    ...cookieBase,
    maxAge: THIRTY_DAYS,
  });
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_COOKIE, "", { ...cookieBase, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...cookieBase, maxAge: 0 });
}

export async function refreshSession(): Promise<ApiAuthenticationResult | null> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;

  const response = await callApi("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) return null;
  return readJson<ApiAuthenticationResult>(response);
}

export interface AuthenticatedApiResult {
  response: Response;
  rotatedSession: ApiAuthenticationResult | null;
}

export async function callAuthenticatedApi(
  path: string,
  init?: RequestInit,
): Promise<AuthenticatedApiResult> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;

  let response = await callApi(path, {
    ...init,
    headers: {
      ...init?.headers,
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  if (response.status !== 401) return { response, rotatedSession: null };

  const rotatedSession = await refreshSession();
  if (!rotatedSession) return { response, rotatedSession: null };

  response = await callApi(path, {
    ...init,
    headers: {
      ...init?.headers,
      authorization: `Bearer ${rotatedSession.accessToken}`,
    },
  });
  return { response, rotatedSession };
}

export async function currentRefreshToken(): Promise<string | null> {
  return (await cookies()).get(REFRESH_COOKIE)?.value ?? null;
}

