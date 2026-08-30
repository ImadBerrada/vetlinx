import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LicensingHub } from "@/components/licensing/LicensingHub";
import { isLocale } from "@/lib/i18n/locales";

export const metadata: Metadata = {
  title: "Licensing pathways | VetLinX",
  description: "Discover governed licensing pathways and track reusable verified evidence.",
};

export default async function LicensingPage() {
  const storedLocale = (await cookies()).get("vetlinx_locale")?.value;
  const locale = isLocale(storedLocale) ? storedLocale : "en";
  return <LicensingHub locale={locale} />;
}
