"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { apiFetch, ApiRequestError } from "@/lib/client-api";
import { authEntryHref } from "@/lib/auth-navigation";
import styles from "./Settings.module.css";

interface Preferences {
  appointmentUpdatesEmail: boolean;
  appointmentRemindersEmail: boolean;
  credentialUpdatesEmail: boolean;
  version: number;
}
const choices = [
  { key: "appointmentUpdatesEmail", label: "Appointment updates", description: "Receive email when an appointment request or confirmed appointment changes." },
  { key: "appointmentRemindersEmail", label: "Appointment reminders", description: "Receive email reminders about confirmed appointments." },
  { key: "credentialUpdatesEmail", label: "Credential updates", description: "Receive email when a credential review or verification status changes." },
] as const;
const readPreferences = () => apiFetch<{ preferences: Preferences }>("/api/notifications/preferences");

export function NotificationPreferences({ scope }: { scope: "professional" | "owner" | "employer" | "review" }) {
  const router = useRouter();
  const [saved, setSaved] = useState<Preferences | null>(null);
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty = Boolean(saved && draft && choices.some(({ key }) => saved[key] !== draft[key]));

  useEffect(() => {
    let active = true;
    readPreferences().then(({ preferences }) => { if (active) { setSaved(preferences); setDraft(preferences); } }).catch((failure: unknown) => {
      if (!active) return;
      if (failure instanceof ApiRequestError && failure.status === 401) router.replace(authEntryHref("login", { returnTo: "/settings/notifications" }));
      else setError(failure instanceof Error ? failure.message : "Notification preferences could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  async function reload() {
    setLoading(true); setError(""); setMessage("");
    try { const { preferences } = await readPreferences(); setSaved(preferences); setDraft(preferences); setConflict(false); }
    catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 401) router.replace(authEntryHref("login", { returnTo: "/settings/notifications" }));
      else setError(failure instanceof Error ? failure.message : "The latest preferences could not be loaded.");
    } finally { setLoading(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !saved || pending || conflict) return;
    setPending(true); setError(""); setMessage("");
    try {
      const { preferences } = await apiFetch<{ preferences: Preferences }>("/api/notifications/preferences", { method: "PATCH", body: JSON.stringify({ appointmentUpdatesEmail: draft.appointmentUpdatesEmail, appointmentRemindersEmail: draft.appointmentRemindersEmail, credentialUpdatesEmail: draft.credentialUpdatesEmail, expectedVersion: saved.version }) });
      setSaved(preferences); setDraft(preferences); setMessage("Your email notification preferences have been saved.");
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 401) router.replace(authEntryHref("login", { returnTo: "/settings/notifications" }));
      else if (failure instanceof ApiRequestError && failure.status === 409) { setConflict(true); setError("Your preferences changed in another session. Reload the latest settings before saving again; your choices below have been kept for comparison."); }
      else setError(failure instanceof Error ? failure.message : "Your preferences could not be saved. Your choices have been kept.");
    } finally { setPending(false); }
  }

  return <AppShell scope={scope} title="Notification preferences" description="Choose optional emails for your account across both workspaces."><div className={styles.content}>
    <p className="vl-help">These preferences apply to your account, including both Professional and Pet owner workspaces. <Link href="/settings/security">Manage account security</Link></p>
    {error ? <div className={styles.error} role="alert"><p>{error}</p>{conflict ? <button className="vl-button" disabled={pending || loading} onClick={() => void reload()}>Reload latest settings</button> : null}</div> : null}
    {message ? <p className={styles.notice} role="status">{message}</p> : null}
    {loading ? <p role="status" className={styles.loading}>Loading your notification preferences…</p> : !draft ? <button className="vl-button" onClick={() => void reload()}>Try again</button> : <form onSubmit={save} className="vl-panel">
      <h2>Optional email notifications</h2>
      <fieldset className={styles.choices} disabled={pending || loading}><legend className={styles.visuallyHidden}>Optional email notifications</legend>{choices.map(({ key, label, description }) => <label className={styles.choice} key={key}><input type="checkbox" checked={draft[key]} onChange={(event) => { setDraft({ ...draft, [key]: event.target.checked }); setMessage(""); }} aria-describedby={`${key}-help`} /><span><strong>{label}</strong><small id={`${key}-help`}>{description}</small></span></label>)}</fieldset>
      <div className={styles.actions}><button className="vl-button vl-button-primary" disabled={pending || !dirty || conflict}>{pending ? "Saving…" : "Save preferences"}</button><span className="vl-help">{conflict ? "Reloading replaces these unsaved choices." : dirty ? "You have unsaved changes." : "Your current preferences are shown."}</span></div>
    </form>}
    <section className="vl-panel"><h2>Messages that stay on</h2><p className="vl-help">Security emails, including password recovery and account protection, remain enabled. In-app notifications also remain available regardless of these email choices.</p></section>
  </div></AppShell>;
}
