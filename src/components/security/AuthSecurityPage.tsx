"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { apiFetch } from "@/lib/client-api";
import styles from "./Security.module.css";

export function AuthSecurityPage({ mode }: { mode: "request" | "reset" | "verify" }) {
  const [link, setLink] = useState({ token: "", ready: mode === "request" });
  const token = link.token;
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const validToken = /^[a-f0-9]{96}$/i.test(token);
  useEffect(() => {
    if (mode === "request") return;
    const url = new URL(window.location.href);
    const token = new URLSearchParams(url.hash.slice(1)).get("token") ?? url.searchParams.get("token") ?? "";
    let active = true;
    // Capture browser-only fragment state after hydration, then scrub both fragment and legacy query links.
    Promise.resolve().then(() => {
      if (!active) return;
      setLink({ token, ready: true });
      window.history.replaceState(window.history.state, "", window.location.pathname);
    });
    return () => { active = false; };
  }, [mode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (mode === "reset" && data.get("password") !== data.get("confirmPassword")) {
      setError("Your passwords do not match."); return;
    }
    setPending(true); setError(""); setMessage("");
    try {
      const path = mode === "request" ? "/api/account/password-reset/request" : mode === "reset" ? "/api/account/password-reset/complete" : "/api/account/email-verification/complete";
      const body = mode === "request" ? { email: data.get("email") } : mode === "reset" ? { token, password: data.get("password") } : { token };
      const result = await apiFetch<{ message: string }>(path, { method: "POST", body: JSON.stringify(body) });
      setMessage(result.message); setDone(true);
      if (mode === "verify") window.dispatchEvent(new Event("vetlinx:session-changed"));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Your request could not be completed."); }
    finally { setPending(false); }
  }
  const title = mode === "request" ? "Reset your password" : mode === "reset" ? "Choose a new password" : "Verify your email";
  const description = mode === "request" ? "Enter your account email. We will send a secure link if it belongs to an active account." : mode === "reset" ? "Use a password with at least 12 characters. Updating it signs out every device." : "Confirm that this email address belongs to you. Open the button below to finish verification.";
  return <main className={styles.page}><header className={styles.publicHeader}><BrandMark /><Link href="/login">Sign in</Link></header><div className={styles.intro}><h1>{title}</h1><p>{description}</p></div><section className={`${styles.panel} ${styles.formPanel}`}>
    {message ? <p className={styles.notice} role="status">{message}</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {!link.ready ? <p className={styles.loading}>Loading secure link…</p> : null}
    {link.ready && mode !== "request" && !validToken ? <p className={styles.error} role="alert">This link is invalid or incomplete. {mode === "reset" ? "Request a new password reset link." : "Sign in and request a new verification email from Settings & security."}</p> : null}
    {!done && link.ready && (mode === "request" || validToken) ? <form className={styles.form} onSubmit={submit}>
      {mode === "request" ? <label>Email<input name="email" type="email" required maxLength={320} autoComplete="email" /></label> : null}
      {mode === "reset" ? <><label>New password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label><label>Confirm new password<input name="confirmPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label></> : null}
      <button className={styles.button} disabled={pending}>{pending ? "Please wait…" : mode === "request" ? "Send reset link" : mode === "reset" ? "Update password" : "Verify my email"}</button>
    </form> : null}
    <div className={styles.actions}>{mode === "verify" && done ? <Link className={styles.button} href="/">Go to my workspace</Link> : <Link className={styles.secondary} href="/login">Back to sign in</Link>}{mode === "request" && done ? <button className={styles.secondary} onClick={() => { setDone(false); setMessage(""); }}>Use a different email</button> : null}{mode === "reset" && !done ? <Link href="/forgot-password">Request a new link</Link> : mode === "verify" && !done ? <Link href="/settings/security">Account security</Link> : null}</div>
  </section><footer className={styles.footer}>Need another account? <Link href="/register">Create an account</Link></footer></main>;
}
