import type { Metadata } from "next";
import { PathwayWorkspace } from "@/components/licensing/PathwayWorkspace";

export const metadata: Metadata = {
  title: "Licensing pathway | VetLinX",
};

export default async function LicensingPathwayPage({
  params,
}: {
  params: Promise<{ pathwayId: string }>;
}) {
  const { pathwayId } = await params;
  return <PathwayWorkspace pathwayId={pathwayId} />;
}
