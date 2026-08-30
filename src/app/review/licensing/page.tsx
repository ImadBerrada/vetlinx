import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LicensingReviewQueue } from "@/components/review/licensing/LicensingReviewQueue";
import { isLocale } from "@/lib/i18n/locales";

export const metadata: Metadata = { title: "Licensing trust workspace | VetLinX" };

export default async function LicensingReviewPage() {
  const storedLocale = (await cookies()).get("vetlinx_locale")?.value;
  return <LicensingReviewQueue locale={isLocale(storedLocale) ? storedLocale : "en"} />;
}
