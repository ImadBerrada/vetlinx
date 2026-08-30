import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PathwayWorkspace } from "@/components/licensing/PathwayWorkspace";
import { isLocale } from "@/lib/i18n/locales";

export const metadata: Metadata = {
  title: "Licensing pathway | VetLinX",
};

export default async function LicensingPathwayPage({
  params,
}: {
  params: Promise<{ pathwayId: string }>;
}) {
  const { pathwayId } = await params;
  const storedLocale = (await cookies()).get("vetlinx_locale")?.value;
  return <PathwayWorkspace pathwayId={pathwayId} locale={isLocale(storedLocale) ? storedLocale : "en"} />;
}
