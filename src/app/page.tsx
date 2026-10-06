import { PublicLanding } from "@/components/consumer/PublicLanding";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await cookies();
  if (!session.get("vetlinx_access")?.value && !session.get("vetlinx_refresh")?.value) return <PublicLanding />;
  if (session.get("vetlinx_workspace")?.value === "owner") redirect("/owner");
  if (session.get("vetlinx_workspace")?.value === "trust") redirect("/review");
  if (session.get("vetlinx_workspace")?.value?.startsWith("organization:")) redirect("/employer");
  redirect("/professional");
}
