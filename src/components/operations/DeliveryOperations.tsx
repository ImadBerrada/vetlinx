"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { apiFetch, ApiRequestError } from "@/lib/client-api";
import { authEntryHref } from "@/lib/auth-navigation";
import styles from "./Operations.module.css";

interface QueueState { state: string; _count: { _all: number } }
interface Failure { id: string; attempts: number; createdAt: string; expiresAt?: string | null; eventId?: string; retryable?: boolean }
interface DeliveryStatus {
  healthy: boolean;
  heartbeat: { lastSeenAt: string; lastSucceededAt: string | null; lastError: string | null } | null;
  emailStates: QueueState[];
  eventStates: QueueState[];
  failedEmail: Failure[];
  failedEvents: Failure[];
  oldestPendingEmailAt?: string | null;
  oldestPendingEventAt?: string | null;
  unsupportedEventCount?: number;
}
const readStatus = () => apiFetch<{ status: DeliveryStatus }>("/api/operations/delivery");
const formatTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Not available";
const isExpired = (failure: Failure) => Boolean(failure.expiresAt && new Date(failure.expiresAt).getTime() <= Date.now());

export function DeliveryOperations() {
  const router = useRouter();
  const [status, setStatus] = useState<DeliveryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [pending, setPending] = useState("");
  const [confirmation, setConfirmation] = useState<{ kind: "email" | "event"; id: string } | null>(null);
  const [retryConflict, setRetryConflict] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const session = await apiFetch<{ account: { roles: string[] } }>("/api/session/me");
        if (!session.account.roles.some((role) => ["OPERATIONS_ADMIN", "PLATFORM_ADMIN"].includes(role))) { if (active) setForbidden(true); return; }
        const response = await readStatus();
        if (active) setStatus(response.status);
      } catch (failure) {
        if (!active) return;
        if (failure instanceof ApiRequestError && failure.status === 401) router.replace(authEntryHref("login", { returnTo: "/operations/delivery" }));
        else if (failure instanceof ApiRequestError && failure.status === 403) setForbidden(true);
        else setError(failure instanceof Error ? failure.message : "Delivery operations could not be loaded.");
      } finally { if (active) setLoading(false); }
    }
    void initialLoad();
    return () => { active = false; };
  }, [router]);

  function report(failure: unknown) {
    if (failure instanceof ApiRequestError && failure.status === 401) router.replace(authEntryHref("login", { returnTo: "/operations/delivery" }));
    else if (failure instanceof ApiRequestError && failure.status === 403) { setForbidden(true); setStatus(null); }
    else setError(failure instanceof Error ? failure.message : "The latest delivery status could not be loaded.");
  }

  async function refresh() {
    if (pending) return;
    setLoading(true); setError(""); setMessage(""); setConfirmation(null);
    try { setStatus((await readStatus()).status); setRetryConflict(false); }
    catch (failure) { report(failure); }
    finally { setLoading(false); }
  }

  async function retry(kind: "email" | "event", failure: Failure) {
    if (pending || loading || retryConflict || failure.retryable === false || (kind === "email" && isExpired(failure))) return;
    setPending(`${kind}:${failure.id}`); setError(""); setMessage("");
    try {
      const response = await apiFetch<{ result: { queued: boolean } }>(`/api/operations/delivery/${kind}/${encodeURIComponent(failure.id)}/retry`, { method: "POST" });
      if (!response.result.queued) throw new Error("The delivery was not queued. Refresh its status before trying again.");
      setConfirmation(null);
      // Remove the failed row immediately so a refresh failure cannot expose a second retry.
      setStatus((current) => current ? { ...current, failedEmail: kind === "email" ? current.failedEmail.filter((item) => item.id !== failure.id) : current.failedEmail, failedEvents: kind === "event" ? current.failedEvents.filter((item) => item.id !== failure.id) : current.failedEvents } : current);
      setMessage("Delivery queued for retry. This action is recorded in the audit log.");
      try { setStatus((await readStatus()).status); }
      catch (refreshFailure) { report(refreshFailure); }
    } catch (retryFailure) {
      if (retryFailure instanceof ApiRequestError && retryFailure.status === 409) { setConfirmation(null); setRetryConflict(true); setError("The delivery state changed, its content is no longer retained, or it expired. Refresh the status before retrying."); }
      else report(retryFailure);
    } finally { setPending(""); }
  }

  function queue(title: string, kind: "email" | "event", failures: Failure[], states: QueueState[], oldestPending: string | null | undefined) {
    const count = (value: string) => states.find((item) => item.state === value)?._count._all ?? 0;
    return <section className="vl-panel" aria-label={title}><h2>{title}</h2><dl className={styles.counts}>{["PENDING", "PROCESSING", "FAILED", "DELIVERED", "CANCELLED"].map((value) => <div key={value}><dt>{value.toLowerCase()}</dt><dd>{count(value)}</dd></div>)}</dl><p className="vl-help">Oldest pending: {oldestPending === undefined ? "Not reported" : oldestPending === null ? "No pending deliveries" : formatTime(oldestPending)}</p>
      <h3>Failed deliveries</h3><p className="vl-help">Up to 50 failed deliveries, oldest first. Only failed deliveries can be retried.</p>
      {!failures.length ? <p className={styles.empty}>No failed deliveries in this queue.</p> : <ul className={styles.failures}>{failures.map((failure) => {
        const expired = kind === "email" && isExpired(failure);
        const canRetry = !expired && failure.retryable !== false;
        const confirming = confirmation?.id === failure.id && confirmation.kind === kind;
        const inProgress = pending === `${kind}:${failure.id}`;
        return <li className={styles.failure} key={failure.id}><div><h4>Delivery <code>{failure.id}</code></h4>{failure.eventId ? <p>Event reference: <code>{failure.eventId}</code></p> : null}<p>Attempts: {failure.attempts} · Created: {formatTime(failure.createdAt)}</p>{kind === "email" && failure.expiresAt ? <p>Expires: {formatTime(failure.expiresAt)}</p> : null}{!canRetry ? <p className={styles.expired}>{expired ? "Expired — cannot retry." : "Content is no longer available for retry."}</p> : null}</div>
          {confirming ? <div className={styles.confirmation}><p>Queue this failed delivery for another attempt? The retry is recorded in the audit log.</p><div className={styles.actions}><button className="vl-button vl-button-primary" disabled={Boolean(pending) || loading || !canRetry || retryConflict} onClick={() => void retry(kind, failure)}>{inProgress ? "Queueing…" : "Confirm retry"}</button><button className="vl-button" disabled={Boolean(pending)} onClick={() => setConfirmation(null)}>Keep unchanged</button></div></div> : <button className="vl-button" disabled={Boolean(pending) || loading || !canRetry || retryConflict} onClick={() => { setConfirmation({ kind, id: failure.id }); setMessage(""); }}>Retry delivery</button>}
        </li>;
      })}</ul>}
    </section>;
  }

  return <AppShell scope="review" title="Delivery operations" description="Worker health and delivery queues for authorized platform operations."><div className={styles.content}>
    {forbidden ? <section className="vl-panel"><h2>Access restricted</h2><p>Delivery operations require an authorized platform operations role. Privileged actions also require multi-factor authentication in production.</p><Link className="vl-button" href="/settings/security/mfa">Review multi-factor authentication</Link></section> : <>
      <div className={styles.actions}><button className="vl-button" disabled={loading || Boolean(pending)} onClick={() => void refresh()}>{loading ? "Refreshing…" : "Refresh status"}</button><span className="vl-help">Queue data excludes recipients, message contents, and private event payloads.</span></div>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}{message ? <p role="status" className={styles.notice}>{message}</p> : null}
      {loading && !status ? <p className={styles.loading} role="status">Loading delivery operations…</p> : null}
      {status ? <><section className="vl-panel" aria-label="Delivery worker"><h2>Delivery worker</h2><span className={`${styles.health} ${status.healthy ? styles.healthy : styles.unhealthy}`}>{status.healthy ? "Worker healthy" : "Worker needs attention"}</span><dl className={styles.worker}><div><dt>Last seen</dt><dd>{formatTime(status.heartbeat?.lastSeenAt)}</dd></div><div><dt>Last successful run</dt><dd>{formatTime(status.heartbeat?.lastSucceededAt)}</dd></div></dl>{status.heartbeat?.lastError ? <p className="vl-help">The last worker run reported an error. Check the authorized server logs.</p> : null}{!status.heartbeat ? <p className="vl-help">No worker heartbeat has been recorded yet.</p> : null}</section>{queue("Email delivery queue", "email", status.failedEmail, status.emailStates, status.oldestPendingEmailAt)}{queue("Event delivery queue", "event", status.failedEvents, status.eventStates, status.oldestPendingEventAt)}{status.unsupportedEventCount ? <section className="vl-panel"><h2>Events awaiting a handler</h2><p className="vl-help">{status.unsupportedEventCount} pending events have no supported delivery handler. They are retained separately from retryable delivery failures; engineering must review their event contracts.</p></section> : null}</> : null}
    </>}
  </div></AppShell>;
}
