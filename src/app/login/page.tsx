import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Sign in to VetLinX" };

export default function LoginPage() {
  return <AuthShell mode="login"><AuthForm mode="login" /></AuthShell>;
}

