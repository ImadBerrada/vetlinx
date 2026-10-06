import { cookies } from "next/headers";
import type { Metadata } from "next";
import { AccountSecurity } from "@/components/security/AccountSecurity";
export const metadata: Metadata = { title: "Settings & security | VetLinX" };
export default async function SecurityPage() {
  const preference = (await cookies()).get("vetlinx_workspace")?.value;
  const scope = preference === "owner" ? "owner" : preference === "trust" ? "review" : preference?.startsWith("organization:") ? "employer" : "professional";
  return <AccountSecurity scope={scope} />;
}
