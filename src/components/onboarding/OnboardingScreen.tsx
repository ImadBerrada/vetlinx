"use client";

import { BadgeCheck, Check, LoaderCircle, LockKeyhole, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { AppShell } from "@/components/shell/AppShell";
import styles from "./Onboarding.module.css";

const countries = [
  { code: "AE", name: "United Arab Emirates" },
  { code: "EG", name: "Egypt" },
  { code: "SA", name: "Saudi Arabia" },
];

interface MeResponse {
  account?: { accountId: string; email: string };
  profile?: { id: string; displayName: string; countryCode: string } | null;
}

interface ErrorPayload {
  message?: string;
  errors?: Record<string, string[]>;
}

export function OnboardingScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("Loading account…");
  const [displayName, setDisplayName] = useState("");
  const [countryCode, setCountryCode] = useState("AE");
  const [mode, setMode] = useState<"loading" | "create" | "edit">("loading");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/session/me", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, body: (await response.json()) as MeResponse }))
      .then(({ ok, body }) => {
        if (!active) return;
        if (!ok || !body.account) {
          router.replace("/login");
          return;
        }
        setEmail(body.account.email);
        if (body.profile) {
          setDisplayName(body.profile.displayName);
          setCountryCode(body.profile.countryCode);
          setMode("edit");
        } else {
          setMode("create");
        }
      })
      .catch(() => {
        if (active) {
          setMessage("VetLinX could not load your account. Try again.");
          setMode("create");
        }
      });
    return () => { active = false; };
  }, [router]);

  const country = countries.find((item) => item.code === countryCode) ?? countries[0];
  const initials = displayName
    .replace(/^dr\.?\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "VL";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setMessage("");
    setSaved(false);
    const response = await fetch("/api/professional-profile", {
      method: mode === "edit" ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, countryCode }),
    }).catch(() => null);
    if (!response) {
      setMessage("VetLinX could not be reached. Check your connection and try again.");
      setPending(false);
      return;
    }
    const body = (await response.json().catch(() => ({}))) as ErrorPayload;
    if (!response.ok) {
      setErrors(body.errors ?? {});
      setMessage(body.message ?? (mode === "edit" ? "Profile update failed." : "Profile creation failed."));
      setPending(false);
      if (response.status === 401) router.replace("/login");
      return;
    }
    if (mode === "edit") {
      setPending(false);
      setSaved(true);
      setMessage("Professional profile updated.");
      window.dispatchEvent(new Event("vetlinx:session-changed"));
      router.refresh();
    } else {
      router.push("/credentials");
    }
  }

  if (mode === "loading") {
    return <main className={styles.loading}><LoaderCircle /><p>Loading your professional profile…</p></main>;
  }

  if (mode === "edit") {
    return (
      <AppShell title="Professional profile" description="Keep the identity colleagues and employers see accurate and current.">
        <div className={styles.editLayout}>
          <section className={styles.editPanel}>
            <header><div><small>Identity record</small><h2>Core professional details</h2><p>These details appear across your credentials, portfolio, and applications.</p></div><UserRound /></header>
            <form onSubmit={submit} noValidate>
              <div className={styles.field}>
                <label htmlFor="displayName">Professional name<span aria-hidden="true">*</span></label>
                <input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your professional name" autoComplete="name" aria-invalid={Boolean(errors.displayName)} />
                {errors.displayName ? <p className={styles.fieldError}>{errors.displayName[0]}</p> : null}
              </div>
              <div className={styles.field}>
                <label htmlFor="countryCode">Country of practice<span aria-hidden="true">*</span></label>
                <select id="countryCode" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
                  {countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                </select>
              </div>
              {message ? <div className={saved ? styles.formSuccess : styles.formError} role="status">{message}</div> : null}
              <footer><Link href="/portfolio">Open full portfolio</Link><button className={styles.primary} type="submit" disabled={pending}>{pending ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Check />}{pending ? "Saving changes…" : "Save profile"}</button></footer>
            </form>
          </section>
          <aside className={styles.editPreview}>
            <small>Live preview</small>
            <div className={styles.initials}>{initials}</div>
            <h2>{displayName.trim() || "Your professional name"}</h2>
            <p><MapPin />{country.name}</p>
            <div><BadgeCheck />Connected to your evidence-backed VetLinX record</div>
          </aside>
        </div>
      </AppShell>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.formColumn}>
        <header className={styles.header}>
          <BrandMark />
          <p>Signed in as<strong>{email}</strong></p>
        </header>
        <div className={styles.formWrap}>
          <div className={styles.complete}><Check aria-hidden="true" />Account created</div>
          <h1>Start your professional identity</h1>
          <p className={styles.lead}>Add the details colleagues and employers should recognize first. You can complete credentials and experience next.</p>
          <form onSubmit={submit} noValidate>
            <div className={styles.field}>
              <label htmlFor="displayName">Professional name<span aria-hidden="true">*</span></label>
                <input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your professional name" autoComplete="name" aria-invalid={Boolean(errors.displayName)} />
              {errors.displayName ? <p className={styles.fieldError}>{errors.displayName[0]}</p> : null}
            </div>
            <div className={styles.field}>
              <label htmlFor="countryCode">Country of practice<span aria-hidden="true">*</span></label>
              <select id="countryCode" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
                {countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
            </div>
            {message ? <div className={styles.formError} role="alert">{message}</div> : null}
            <button className={styles.primary} type="submit" disabled={pending}>
              {pending ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : null}
              {pending ? "Creating profile…" : "Create professional profile"}
            </button>
            <Link className={styles.later} href="/">Finish later</Link>
            <p className={styles.hint}>You can always update these details in your profile settings.</p>
          </form>
        </div>
      </section>

      <aside className={styles.recordColumn}>
        <div className={styles.recordInner}>
          <h2>Your career record in VetLinX</h2>
          <p className={styles.recordLead}>We build a verified record, step by step. You’re building a profile that grows with your career.</p>
          <ol className={styles.steps}>
            <li className={styles.done}><span><Check aria-hidden="true" /></span><div><strong>Account</strong><small>Verified account</small></div></li>
            <li className={styles.active}><span /><div><strong>Professional profile</strong><small>Add your professional identity</small></div></li>
            <li><span /><div><strong>Credentials</strong><small>Add licenses, certifications, and experience</small></div></li>
          </ol>
          <div className={styles.previewSection}>
            <h2>Live identity preview</h2>
            <p>This is how you’ll appear to colleagues and employers.</p>
            <article className={styles.previewCard}>
              <div className={styles.initials}>{initials}</div>
              <div className={styles.previewText}>
                <h3>{displayName.trim() || "Your professional name"}</h3>
                <p><MapPin aria-hidden="true" />{country.name}</p>
                <div><BadgeCheck aria-hidden="true" />Building your verified professional record</div>
              </div>
            </article>
          </div>
          <p className={styles.security}><LockKeyhole aria-hidden="true" />Your information is secure and used only to build your professional record in VetLinX.</p>
        </div>
      </aside>
    </main>
  );
}
