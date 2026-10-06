import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthSecurityPage } from "@/components/security/AuthSecurityPage";
export const metadata: Metadata = { title: "Reset your password | VetLinX", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function ForgotPasswordPage() { return <Suspense fallback={<p>Loading account recovery…</p>}><AuthSecurityPage mode="request" /></Suspense>; }
