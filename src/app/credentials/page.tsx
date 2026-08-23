import type { Metadata } from "next";
import { CredentialsWallet } from "@/components/credentials/CredentialsWallet";

export const metadata: Metadata = { title: "Credentials wallet | VetLinX" };

export default function CredentialsPage() {
  return <CredentialsWallet />;
}
