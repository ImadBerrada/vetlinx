import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Create your VetLinX account" };

export default function RegisterPage() {
  return <AuthShell mode="register"><AuthForm mode="register" /></AuthShell>;
}

