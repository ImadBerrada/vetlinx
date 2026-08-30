import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LicensingPathwayEditor } from "@/components/review/licensing/LicensingPathwayEditor";
import { isLocale } from "@/lib/i18n/locales";

export const metadata: Metadata = { title: "Review licensing pathway | VetLinX" };

export default async function LicensingReviewPathwayPage({ params }: { params: Promise<{ pathwayId: string }> }) {
  const { pathwayId } = await params;
  const storedLocale = (await cookies()).get("vetlinx_locale")?.value;
  return <LicensingPathwayEditor pathwayId={pathwayId} locale={isLocale(storedLocale) ? storedLocale : "en"} />;
}
