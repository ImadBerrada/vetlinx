"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useSyncExternalStore } from "react";
import styles from "./Auth.module.css";
import { authEntryHref, withReturnTo, type AuthNavigationContext } from "@/lib/auth-navigation";
import { writeWorkspacePreference } from "@/lib/workspace-preference";

interface ErrorPayload {
  message?: string;
  errors?: Record<string, string[]>;
}

const subscribeToHydration = () => () => undefined;

export function AuthForm({ mode, navigation }: { mode: "register" | "login"; navigation: AuthNavigationContext }) {
  const router = useRouter();
  const registering = mode === "register";
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setMessage("");

    const data = new FormData(event.currentTarget);
    const response = await fetch(challenge ? "/api/session/mfa" : `/api/session/${mode === "register" ? "register" : "login"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(challenge ? { challengeToken: challenge, code: data.get("code") } : { email: data.get("email"), password: data.get("password") }),
    }).catch(() => null);

    if (!response) {
      setMessage("VetLinX could not be reached. Check your connection and try again.");
      setPending(false);
      return;
    }
    const body = (await response.json().catch(() => ({}))) as ErrorPayload & { next?: string; mfaRequired?: boolean; challengeToken?: string };
    if (!response.ok) {
      setErrors(body.errors ?? {});
      setMessage(body.message ?? (registering ? "Account creation failed." : "Email or password is incorrect."));
      setPending(false);
      return;
    }
    if (body.mfaRequired && body.challengeToken) { setChallenge(body.challengeToken); setPending(false); return; }

    const { intent, returnTo } = navigation;
    if (intent) writeWorkspacePreference(intent === "owner" ? "owner" : "personal");
    const next = registering
      ? withReturnTo(intent === "owner" ? "/owner/onboarding" : intent === "professional" ? "/onboarding" : "/get-started", returnTo)
      : returnTo ?? (intent === "owner" ? "/owner" : intent === "professional" ? "/professional" : body.next === "/" ? "/professional" : body.next ?? "/get-started");
    router.push(next);
  }

  return (
    <form className={styles.authForm} onSubmit={submit} noValidate>
      <h2>{challenge ? "Confirm your sign-in" : registering ? "Create your account" : "Sign in to VetLinX"}</h2>
      {challenge ? <><p className={styles.fieldHelp}>Enter the current six-digit code from your authenticator, or one unused recovery code. This sign-in challenge expires after five minutes.</p><div className={styles.field}><label htmlFor="mfa-code">Authenticator or recovery code</label><input id="mfa-code" name="code" type="text" autoComplete="one-time-code" maxLength={80} autoFocus /></div></> : <>
      <div className={styles.field}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} />
        {errors.email ? <p className={styles.fieldError} id="email-error">{errors.email[0]}</p> : null}
      </div>
      <div className={styles.field}>
        <label htmlFor="password">Password</label>
        <div className={styles.passwordField}>
          <input id="password" name="password" type={passwordVisible ? "text" : "password"} autoComplete={registering ? "new-password" : "current-password"} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : "password-help"} />
          <button type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? "Hide password" : "Show password"}>
            {passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        </div>
        {errors.password ? <p className={styles.fieldError} id="password-error">{errors.password[0]}</p> : registering ? <p className={styles.fieldHelp} id="password-help">Use at least 12 characters</p> : null}
      </div>
      {!registering ? <Link className="vl-help" href="/forgot-password">Forgot your password?</Link> : null}
      </>}
      {message ? <div className={styles.formError} role="alert">{message}</div> : null}
      <button className={styles.primaryButton} type="submit" disabled={!hydrated || pending}>
        {pending ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : null}
        {pending ? (registering ? "Creating account…" : "Signing in…") : challenge ? "Verify and sign in" : (registering ? "Create account" : "Sign in")}
      </button>
      {challenge ? <button className={styles.primaryButton} type="button" disabled={pending} onClick={() => { setChallenge(null); setMessage(""); }}>Start sign-in again</button> : null}
      <p className={styles.switchMode}>
        {registering ? "Already have an account?" : "New to VetLinX?"}{" "}
        <Link href={authEntryHref(registering ? "login" : "register", navigation)}>{registering ? "Sign in" : "Create an account"}</Link>
      </p>
    </form>
  );
}
