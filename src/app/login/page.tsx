import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { authNavigationFromParams } from "@/lib/auth-navigation";

export const metadata: Metadata = { title: "Sign in to VetLinX" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const navigation = authNavigationFromParams(await searchParams);
  return <AuthShell mode="login"><AuthForm mode="login" navigation={navigation} /></AuthShell>;
}

