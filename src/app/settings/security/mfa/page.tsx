import { cookies } from "next/headers";
import type { Metadata } from "next";
import { MfaSettings } from "@/components/security/MfaSettings";
export const metadata: Metadata = { title: "Two-step verification | VetLinX", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function MfaPage() {
  const preference = (await cookies()).get("vetlinx_workspace")?.value;
  const scope = preference === "owner" ? "owner" : preference === "trust" ? "review" : preference?.startsWith("organization:") ? "employer" : "professional";
  return <MfaSettings scope={scope} />;
}
