"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PawPrint } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { apiFetch } from "@/lib/client-api";
import { writeWorkspacePreference } from "@/lib/workspace-preference";
import { useSession } from "./use-session";
import styles from "./Consumer.module.css";
import { CountrySelect } from "@/components/forms/CountrySelect";
import { authNavigationContext } from "@/lib/auth-navigation";

export function OwnerOnboarding() {
  const { session, error } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true); setMessage("");
    try {
      await apiFetch("/api/owner-profile", { method: "PUT", body: JSON.stringify({ displayName: data.get("displayName"), countryCode: data.get("countryCode"), phone: data.get("phone") }) });
      writeWorkspacePreference("owner");
      window.dispatchEvent(new Event("vetlinx:session-changed"));
      router.replace(authNavigationContext(window.location.search).returnTo ?? "/owner");
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : "Profile could not be saved."); }
    finally { setPending(false); }
  }
  return <main className={styles.page}><header className={styles.publicHeader}><BrandMark /><Link href={session?.owner ? "/owner" : "/get-started"}>Back to my workspace</Link></header><div className={styles.intro}><span className={styles.eyebrow}>Pet-owner profile</span><h1>{session?.owner ? "Your contact details" : "Start caring for your pets"}</h1><p>Your owner profile is private. Your name and phone number are shared with a clinic when you submit an appointment request. Your Professional workspace stays available.</p></div>{error ? <p className={styles.error} role="alert">{error}</p> : !session ? <p className={styles.loading}>Loading your account…</p> : <section className={`${styles.panel} ${styles.formPanel}`}><PawPrint /><h2>{session.owner ? "Update your profile" : "Create your pet-owner profile"}</h2>{message ? <p className={styles.error} role="alert">{message}</p> : null}<form className={styles.form} onSubmit={save}><label>Your name<input name="displayName" required minLength={2} maxLength={200} autoComplete="name" defaultValue={session.owner?.displayName ?? ""} /></label><div className={styles.row}><label>Country<CountrySelect name="countryCode" required defaultValue={session.owner?.countryCode ?? "AE"} /></label><label>Contact phone<input name="phone" type="tel" required maxLength={40} autoComplete="tel" placeholder="+971 50 123 4567" defaultValue={session.owner?.phone ?? ""} /></label></div><p className={styles.muted}>Use a number a clinic can reach you on. Updating it applies to new requests; existing requests keep the contact details you originally shared.</p><button className={styles.primary} disabled={pending}>{pending ? "Saving…" : session.owner ? "Save owner profile" : "Create pet-owner profile"}</button></form></section>}</main>;
}
