import type { Metadata } from "next";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";

export const metadata: Metadata = { title: "Professional profile — VetLinX" };

export default function OnboardingPage() {
  return <OnboardingScreen />;
}
