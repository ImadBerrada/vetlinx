import { cookies } from "next/headers";
import type { Metadata } from "next";
import { NotificationPreferences } from "@/components/settings/NotificationPreferences";
export const metadata: Metadata = { title: "Notification preferences | VetLinX" };
export default async function NotificationsPage() {
  const preference = (await cookies()).get("vetlinx_workspace")?.value;
  const scope = preference === "owner" ? "owner" : preference === "trust" ? "review" : preference?.startsWith("organization:") ? "employer" : "professional";
  return <NotificationPreferences scope={scope} />;
}
