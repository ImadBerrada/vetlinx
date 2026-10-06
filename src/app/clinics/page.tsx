import { cookies } from "next/headers";
import { ClinicDirectory } from "@/components/consumer/ClinicDirectory";
export default async function ClinicsPage() {
  const session = await cookies();
  return <ClinicDirectory signedIn={Boolean(session.get("vetlinx_access")?.value || session.get("vetlinx_refresh")?.value)} />;
}
