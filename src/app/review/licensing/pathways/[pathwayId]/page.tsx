import type { Metadata } from "next";
import { LicensingPathwayEditor } from "@/components/review/licensing/LicensingPathwayEditor";

export const metadata: Metadata = { title: "Review licensing pathway | VetLinX" };

export default async function LicensingReviewPathwayPage({ params }: { params: Promise<{ pathwayId: string }> }) {
  const { pathwayId } = await params;
  return <LicensingPathwayEditor pathwayId={pathwayId} />;
}
