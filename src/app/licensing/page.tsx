import type { Metadata } from "next";
import { LicensingHub } from "@/components/licensing/LicensingHub";

export const metadata: Metadata = {
  title: "Licensing pathways | VetLinX",
  description: "Discover governed licensing pathways and track reusable verified evidence.",
};

export default function LicensingPage() {
  return <LicensingHub />;
}
