import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { authNavigationFromParams } from "@/lib/auth-navigation";

export const metadata: Metadata = { title: "Create your VetLinX account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const navigation = authNavigationFromParams(await searchParams);
  return <AuthShell mode="register"><AuthForm mode="register" navigation={navigation} /></AuthShell>;
}

