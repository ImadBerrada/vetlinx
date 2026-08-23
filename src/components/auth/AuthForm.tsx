"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useSyncExternalStore } from "react";
import styles from "./Auth.module.css";

interface ErrorPayload {
  message?: string;
  errors?: Record<string, string[]>;
}

const subscribeToHydration = () => () => undefined;

export function AuthForm({ mode }: { mode: "register" | "login" }) {
  const router = useRouter();
  const registering = mode === "register";
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setMessage("");

    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/session/${mode === "register" ? "register" : "login"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
    }).catch(() => null);

    if (!response) {
      setMessage("VetLinX could not be reached. Check your connection and try again.");
      setPending(false);
      return;
    }
    const body = (await response.json().catch(() => ({}))) as ErrorPayload & { next?: string };
    if (!response.ok) {
      setErrors(body.errors ?? {});
      setMessage(body.message ?? (registering ? "Account creation failed." : "Email or password is incorrect."));
      setPending(false);
      return;
    }

    router.push(registering ? "/onboarding" : (body.next ?? "/"));
  }

  return (
    <form className={styles.authForm} onSubmit={submit} noValidate>
      <h2>{registering ? "Create your account" : "Sign in to VetLinX"}</h2>
      <div className={styles.field}>
        <label htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" placeholder="you@clinic.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} />
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
      {message ? <div className={styles.formError} role="alert">{message}</div> : null}
      <button className={styles.primaryButton} type="submit" disabled={!hydrated || pending}>
        {pending ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : null}
        {pending ? (registering ? "Creating account…" : "Signing in…") : (registering ? "Create account" : "Sign in")}
      </button>
      <p className={styles.switchMode}>
        {registering ? "Already have an account?" : "New to VetLinX?"}{" "}
        <Link href={registering ? "/login" : "/register"}>{registering ? "Sign in" : "Create an account"}</Link>
      </p>
    </form>
  );
}
