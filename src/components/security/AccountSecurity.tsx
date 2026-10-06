"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { apiFetch, ApiRequestError } from "@/lib/client-api";
import styles from "./Security.module.css";

interface SecurityStatus { email: string; emailVerifiedAt: string | null }
interface Session { id: string; device: string; lastActiveAt: string; expiresAt: string; current: boolean }

export function AccountSecurity({ scope }: { scope: "professional" | "employer" | "review" | "owner" }) {
  const router = useRouter();
  const [security, setSecurity] = useState<SecurityStatus | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const load = useCallback(async () => {
    const [status, devices] = await Promise.all([
      apiFetch<{ security: SecurityStatus }>("/api/account/security"),
      apiFetch<{ sessions: Session[] }>("/api/account/sessions"),
    ]);
    return { security: status.security, sessions: devices.sessions };
  }, []);
  const report = useCallback((failure: unknown) => {
    if (failure instanceof ApiRequestError && failure.status === 401) router.replace("/login?returnTo=%2Fsettings%2Fsecurity");
    else setError(failure instanceof Error ? failure.message : "Your security settings could not be loaded.");
  }, [router]);
  useEffect(() => {
    let active = true;
    load().then((result) => { if (active) { setSecurity(result.security); setSessions(result.sessions); } }).catch((failure: unknown) => { if (active) report(failure); });
    return () => { active = false; };
  }, [load, report]);
  async function action(kind: "verify" | "revoke" | "all", session?: Session) {
    setPending(session?.id ?? kind); setError(""); setMessage("");
    try {
      const path = kind === "verify" ? "/api/account/email-verification/request" : kind === "all" ? "/api/account/sessions/revoke-all" : `/api/account/sessions/${session?.id}`;
      const result = await apiFetch<{ result: { message: string } }>(path, { method: kind === "revoke" ? "DELETE" : "POST" });
      if (kind === "all" || session?.current) { router.replace("/login"); router.refresh(); return; }
      setMessage(result.result.message);
      if (kind === "revoke") { const refreshed = await load(); setSessions(refreshed.sessions); setSecurity(refreshed.security); }
    } catch (failure) { report(failure); }
    finally { setPending(""); }
  }
  return <AppShell scope={scope} title="Settings & security" description="These settings apply to your account across every workspace."><div className={styles.content}>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}{message ? <p className={styles.notice} role="status">{message}</p> : null}
    {!security ? <p className={styles.loading}>Loading account security…</p> : <>
      <section className={styles.panel}><h2>Email verification</h2><p>{security.email}</p><p className={styles.muted}>{security.emailVerifiedAt ? "Your email address is verified." : "Verify your email so we know you control this address. This is separate from professional credential or clinic verification."}</p>{!security.emailVerifiedAt ? <button className={styles.button} disabled={Boolean(pending)} onClick={() => action("verify")}>{pending === "verify" ? "Sending…" : "Send verification email"}</button> : <span className={styles.badge}>Email verified</span>}</section>
      <section className={styles.panel}><h2>Password</h2><p className={styles.muted}>Use the secure email recovery link to choose a new password. Resetting it signs out all devices.</p><Link className={styles.secondary} href="/forgot-password">Reset my password</Link></section>
      <section className={styles.panel}><h2>Two-step verification</h2><p className={styles.muted}>Protect sign-ins with an authenticator app and private recovery codes. Trust operations require a recent identity confirmation in production.</p><Link className={styles.secondary} href="/settings/security/mfa">Manage two-step verification</Link></section>
      <section className={styles.panel}><h2>Signed-in devices</h2><p className={styles.muted}>Review active sign-ins and sign out devices you do not recognize. Device descriptions come from your browser; the latest activity shows the last sign-in or session refresh.</p>{sessions.length ? <ul className={styles.sessionList}>{sessions.map((session) => <li key={session.id} className={styles.session}><div>{session.current ? <span className={styles.badge}>This session</span> : null}<div className={styles.device}>{session.device}</div><p>Latest activity: {new Date(session.lastActiveAt).toLocaleString()}</p><p>Session expires: {new Date(session.expiresAt).toLocaleString()}</p></div><button className={styles.danger} disabled={Boolean(pending)} onClick={() => action("revoke", session)}>{pending === session.id ? "Signing out…" : session.current ? "Sign out this session" : "Sign out device"}</button></li>)}</ul> : <p>No active devices were found.</p>}
      <div className={styles.actions}>{confirmAll ? <><p>Sign out every device, including this one?</p><button className={styles.danger} disabled={Boolean(pending)} onClick={() => action("all")}>{pending === "all" ? "Signing out…" : "Yes, sign out all devices"}</button><button className={styles.secondary} disabled={Boolean(pending)} onClick={() => setConfirmAll(false)}>Keep devices signed in</button></> : <button className={styles.danger} disabled={Boolean(pending)} onClick={() => setConfirmAll(true)}>Sign out all devices</button>}</div></section>
    </>}
  </div></AppShell>;
}
