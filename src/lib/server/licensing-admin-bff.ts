import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { flattenErrors } from "@/lib/validation/auth";
import { forwardLicensingJson, idempotencyHeaders } from "./licensing-bff";
import { isSameOriginMutation } from "./route-security";

interface AdminMutationOptions<T> {
  path: string;
  method: "POST" | "PATCH";
  schema: z.ZodType<T>;
  fallback: string;
  idempotent?: boolean;
}

export async function licensingAdminMutation<T>(
  request: NextRequest,
  options: AdminMutationOptions<T>,
) {
  if (!isSameOriginMutation(request)) return forbidden();
  const parsed = options.schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { errors: flattenErrors(parsed.error) },
      { status: 400 },
    );
  }
  return forwardLicensingJson<unknown>(
    options.path,
    {
      method: options.method,
      headers: {
        "content-type": "application/json",
        ...(options.idempotent ? idempotencyHeaders(request) : {}),
      },
      body: JSON.stringify(parsed.data),
    },
    { fallback: options.fallback },
  );
}

export async function licensingAdminTransition(
  request: NextRequest,
  path: string,
  fallback: string,
) {
  if (!isSameOriginMutation(request)) return forbidden();
  return forwardLicensingJson<unknown>(
    path,
    { method: "POST", headers: idempotencyHeaders(request) },
    { fallback },
  );
}

function forbidden() {
  return NextResponse.json(
    { message: "Request origin is not allowed." },
    { status: 403 },
  );
}
