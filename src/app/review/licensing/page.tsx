import type { Metadata } from "next";
import { LicensingReviewQueue } from "@/components/review/licensing/LicensingReviewQueue";

export const metadata: Metadata = { title: "Licensing trust workspace | VetLinX" };

export default function LicensingReviewPage() {
  return <LicensingReviewQueue />;
}
