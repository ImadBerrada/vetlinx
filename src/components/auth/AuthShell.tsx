import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { EvidenceRail } from "./EvidenceRail";
import styles from "./Auth.module.css";

interface AuthShellProps {
  mode: "register" | "login";
  children: ReactNode;
}

export function AuthShell({ mode, children }: AuthShellProps) {
  const registering = mode === "register";
  return (
    <main className={styles.authPage}>
      <section className={styles.authColumn}>
        <header><BrandMark /></header>
        <div className={styles.authContent}>
          <div className={styles.intro}>
            <h1>{registering ? "Your career. Your pets. One trusted account." : "Welcome back to VetLinX."}</h1>
            <p>
              {registering
                ? "Build your professional identity, care for your pets, or do both. Choose your workspace after signing up."
                : "Sign in to your professional, pet-owner, or organization workspace."}
            </p>
          </div>
          <EvidenceRail compact />
          {children}
        </div>
        <footer className={styles.authFooter}>
          <Link href="/privacy">Privacy</Link><span aria-hidden="true" /> <Link href="/terms">Terms</Link>
        </footer>
      </section>
      <aside className={styles.visualColumn} aria-label="How your professional record grows">
        <EvidenceRail />
      </aside>
    </main>
  );
}

