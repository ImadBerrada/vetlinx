"use client";
import Link from "next/link";
import { BriefcaseBusiness, PawPrint } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { writeWorkspacePreference } from "@/lib/workspace-preference";
import { useSession } from "./use-session";
import styles from "./Consumer.module.css";
import { useSyncExternalStore } from "react";
import { authNavigationContext, withReturnTo } from "@/lib/auth-navigation";

const subscribeToHydration = () => () => undefined;

export function WorkspaceChooser() {
  const { session, error } = useSession();
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const returnTo = hydrated ? authNavigationContext(window.location.search).returnTo : null;
  return <main className={styles.page}><header className={styles.publicHeader}><BrandMark /><Link href="/clinics">Browse clinics</Link></header><div className={styles.intro}><span className={styles.eyebrow}>One account, both workspaces</span><h1>What brings you to VetLinX?</h1><p>Your Professional and Pet owner workspaces are always available. Setting up one does not replace the other.</p></div>{error ? <p className={styles.error} role="alert">{error}</p> : !session ? <p className={styles.loading}>Loading your account…</p> : <div className={styles.grid}><section className={styles.card}><BriefcaseBusiness /><h2>Professional</h2><p>Manage credentials, create a trusted portfolio, and connect with veterinary employers.</p><p>{session.profile ? "Your professional profile is ready." : "Set up your professional profile when you need it."}</p><Link className={styles.primary} href={session.profile ? "/professional" : withReturnTo("/onboarding", returnTo)} onClick={() => writeWorkspacePreference("personal")}>Continue as a professional</Link></section><section className={styles.card}><PawPrint /><h2>Pet owner</h2><p>Create pet profiles, find verified clinics, and keep track of appointment requests.</p><p>{session.owner ? "Your pet-owner profile is ready." : "Set up your pet-owner profile when you need it."}</p><Link className={styles.primary} href={session.owner ? returnTo ?? "/owner" : withReturnTo("/owner/onboarding", returnTo)} onClick={() => writeWorkspacePreference("owner")}>Continue as a pet owner</Link></section></div>}</main>;
}
