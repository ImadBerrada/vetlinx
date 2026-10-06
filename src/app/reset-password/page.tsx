import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthSecurityPage } from "@/components/security/AuthSecurityPage";
export const metadata: Metadata = { title: "Choose a new password | VetLinX", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function ResetPasswordPage() { return <Suspense fallback={<p>Loading account recovery…</p>}><AuthSecurityPage mode="reset" /></Suspense>; }
