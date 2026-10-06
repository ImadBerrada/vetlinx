import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthSecurityPage } from "@/components/security/AuthSecurityPage";
export const metadata: Metadata = { title: "Verify your email | VetLinX", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function VerifyEmailPage() { return <Suspense fallback={<p>Loading email verification…</p>}><AuthSecurityPage mode="verify" /></Suspense>; }
