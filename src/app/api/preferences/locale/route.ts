import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOriginMutation } from "@/lib/server/route-security";

const schema = z.object({ locale: z.enum(["en", "ar"]) });

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ message: "Request origin is not allowed." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "A supported locale is required." }, { status: 400 });
  }
  const response = NextResponse.json({ locale: parsed.data.locale });
  response.cookies.set("vetlinx_locale", parsed.data.locale, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
