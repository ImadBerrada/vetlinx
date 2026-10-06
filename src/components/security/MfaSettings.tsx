"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { apiFetch, ApiRequestError } from "@/lib/client-api";
import styles from "./Security.module.css";

interface Status { enabledAt: string | null; recoveryCodesRemaining: number; recentUntil: string | null; lockedUntil: string | null; requiredForPrivilegedActions: boolean }
interface Setup { secret: string; qrDataUrl: string; expiresAt: string }
type Action = "setup" | "confirm" | "step-up" | "recovery-codes" | "disable";
export function MfaSettings({ scope }: { scope: "professional" | "employer" | "review" | "owner" }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const codesHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (codes.length) codesHeading.current?.focus(); }, [codes]);
  const [manage, setManage] = useState<"recovery-codes" | "disable" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const report = useCallback((failure: unknown) => {
    if (failure instanceof ApiRequestError && failure.status === 401) router.replace("/login?returnTo=%2Fsettings%2Fsecurity%2Fmfa");
    else setError(failure instanceof Error ? failure.message : "This security change could not be completed.");
  }, [router]);
  const load = useCallback(async () => { setLoading(true); setRefreshFailed(false); try { const result = await apiFetch<{ mfa: Status }>("/api/account/mfa"); setStatus(result.mfa); } catch (failure) { setRefreshFailed(true); throw failure; } finally { setLoading(false); } }, []);
  useEffect(() => { let active = true; apiFetch<{ mfa: Status }>("/api/account/mfa").then((result) => { if (active) setStatus(result.mfa); }).catch((failure: unknown) => { if (active) report(failure); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [report]);
  async function submit(event: FormEvent<HTMLFormElement>, action: Action) {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form);
    setPending(true); setError(""); setMessage("");
    try {
      const body = action === "setup" ? { password: fields.get("password") } : action === "disable" || action === "recovery-codes" ? { password: fields.get("password"), code: fields.get("code") } : { code: fields.get("code") };
      const response = await apiFetch<{ result: Setup & { recoveryCodes?: string[]; message?: string } }>(`/api/account/mfa/${action}`, { method: "POST", body: JSON.stringify(body) });
      form.reset();
      if (action === "disable") { router.replace("/login"); router.refresh(); return; }
      if (action === "setup") { setSetup(response.result); setCodes([]); }
      else { setMessage(response.result.message ?? "Security settings updated."); if (response.result.recoveryCodes) { setCodes(response.result.recoveryCodes); setSetup(null); setStatus((previous) => previous ? { ...previous, enabledAt: previous.enabledAt ?? new Date().toISOString(), recoveryCodesRemaining: response.result.recoveryCodes!.length } : previous); } setManage(null); await load(); }
    } catch (failure) { report(failure); } finally { setPending(false); }
  }
  const proof = <label>Authenticator or recovery code<input name="code" required minLength={6} maxLength={80} autoComplete="one-time-code" spellCheck={false} /></label>;
  const password = <label>Current password<input name="password" type="password" required maxLength={128} autoComplete="current-password" /></label>;
  return <AppShell scope={scope} title="Two-step verification" description="Keep your account safe across every workspace."><div className={styles.content}>
    <Link href="/settings/security">Back to Settings & security</Link>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}{message ? <p className={styles.notice} role="status">{message}</p> : null}
    {status && refreshFailed ? <button className={styles.secondary} disabled={loading || pending} onClick={() => { setError(""); load().catch(report); }}>{loading ? "Refreshing…" : "Refresh security status"}</button> : null}
    {!status ? loading ? <p className={styles.loading}>Loading two-step verification…</p> : <button className={styles.secondary} onClick={() => { setError(""); load().catch(report); }}>Retry loading security settings</button> : <>
      {status.requiredForPrivilegedActions ? <p className={styles.notice}>Trust operations require two-step verification and an identity confirmation within the last 15 minutes.</p> : null}
      {status.lockedUntil ? <p className={styles.error}>Too many incorrect codes. Try again after {new Date(status.lockedUntil).toLocaleTimeString()}.</p> : null}
      {codes.length ? <section className={styles.panel}><h2 ref={codesHeading} tabIndex={-1}>Save your recovery codes now</h2><p>Each code works once. Store these privately outside this device. They will not be shown again.</p><pre className={styles.recoveryCodes}>{codes.join("\n")}</pre><div className={styles.actions}><button className={styles.secondary} onClick={async () => { try { await navigator.clipboard.writeText(codes.join("\n")); setMessage("Recovery codes copied. Store them privately."); } catch { setError("Copy the codes manually and store them privately."); } }}>Copy recovery codes</button><button className={styles.button} onClick={() => { setCodes([]); setMessage("Your recovery codes are now hidden."); }}>I have saved my codes</button></div></section> : null}
      {!status.enabledAt ? <section className={styles.panel}><h2>Set up an authenticator app</h2><p>Use your current password to start. Enabling two-step verification signs out your other devices.</p>{!setup ? <form className={styles.form} onSubmit={(event) => submit(event, "setup")}>{password}<button className={styles.button} disabled={pending}>{pending ? "Preparing…" : "Start setup"}</button></form> : <><p>Scan this private QR code in your authenticator app. Setup expires at {new Date(setup.expiresAt).toLocaleTimeString()}.</p><Image src={setup.qrDataUrl} alt="Private authenticator setup QR code" width={240} height={240} unoptimized /><p>Or enter this setup key manually:</p><pre className={styles.recoveryCodes}>{setup.secret}</pre><form className={styles.form} onSubmit={(event) => submit(event, "confirm")}><label>Six-digit authenticator code<input name="code" required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" /></label><button className={styles.button} disabled={pending}>{pending ? "Confirming…" : "Enable two-step verification"}</button></form><button className={styles.secondary} disabled={pending} onClick={() => setSetup(null)}>Restart setup</button></>}</section> : <>
        <section className={styles.panel}><h2>Confirm your identity</h2><span className={styles.badge}>Two-step verification enabled</span><p>{status.recentUntil ? `Last confirmation expires at ${new Date(status.recentUntil).toLocaleString()}.` : "Confirm your identity to continue with trust operations."}</p><p className={styles.muted}>Authenticator codes change every 30 seconds and each code can be used once. Wait for the next code if you have just used one.</p><form className={styles.form} onSubmit={(event) => submit(event, "step-up")}>{proof}<button className={styles.button} disabled={pending}>{pending ? "Confirming…" : "Confirm identity for 15 minutes"}</button></form></section>
        <section className={styles.panel}><h2>Recovery and account security</h2><p>{status.recoveryCodesRemaining} unused recovery codes remain.</p>{!manage ? <div className={styles.actions}><button className={styles.secondary} disabled={pending} onClick={() => setManage("recovery-codes")}>Generate new recovery codes</button><button className={styles.danger} disabled={pending} onClick={() => setManage("disable")}>Disable two-step verification</button></div> : <><p>{manage === "disable" ? "This signs out every device. Trust operations will require setup again." : "All your previous recovery codes will stop working. Save the new codes before leaving."}</p><form className={styles.form} onSubmit={(event) => submit(event, manage)}>{password}{proof}<button className={manage === "disable" ? styles.danger : styles.button} disabled={pending}>{pending ? "Updating…" : manage === "disable" ? "Confirm disable and sign out" : "Replace recovery codes"}</button></form><button className={styles.secondary} disabled={pending} onClick={() => setManage(null)}>Keep current settings</button></>}</section>
      </>}
    </>}
  </div></AppShell>;
}



