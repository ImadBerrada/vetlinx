"use client";

import { BadgeCheck, Building2, CheckCircle2, ClipboardCheck, ExternalLink, FileText, History, LoaderCircle, LockKeyhole, ShieldCheck, X, XCircle } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import type { ApiOrganizationReview, ApiSystemRole } from "@/lib/server/vetlinx-api";
import styles from "./OrganizationReviewConsole.module.css";

type Action = "NEEDS_INFORMATION" | "VERIFIED" | "REJECTED";
interface Me { account?: { accountId: string; email: string; roles: ApiSystemRole[] } }

export function OrganizationReviewConsole() {
  const router = useRouter();
  const [account, setAccount] = useState<NonNullable<Me["account"]> | null>(null);
  const [queue, setQueue] = useState<ApiOrganizationReview[]>([]);
  const [review, setReview] = useState<ApiOrganizationReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/session/me", { cache: "no-store" }), fetch("/api/organization-reviews", { cache: "no-store" })]).then(async ([meResponse, queueResponse]) => {
      const me = (await meResponse.json().catch(() => ({}))) as Me;
      const body = (await queueResponse.json().catch(() => ({}))) as { reviews?: ApiOrganizationReview[]; message?: string };
      if (!active) return;
      if (!meResponse.ok || !me.account) { router.replace("/login"); return; }
      if (!me.account.roles.some((role) => ["REVIEWER", "OPERATIONS_ADMIN", "PLATFORM_ADMIN"].includes(role))) { router.replace("/"); return; }
      setAccount(me.account);
      if (!queueResponse.ok) { setMessage(body.message ?? "Organization review queue could not be loaded."); return; }
      const items = body.reviews ?? []; setQueue(items);
      if (items[0]) { setDetailLoading(true); loadReview(items[0].id, active); }
    }).catch(() => active && setMessage("VetLinX could not load organization reviews.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [router]);

  async function loadReview(id: string, active = true) {
    const response = await fetch(`/api/organization-reviews/${id}`, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as { review?: ApiOrganizationReview; message?: string };
    if (!active) return;
    if (!response.ok || !body.review) { setMessage(body.message ?? "Organization review could not be loaded."); setReview(null); }
    else setReview(body.review);
    setDetailLoading(false);
  }

  async function selectReview(id: string) { setReview(null); setDetailLoading(true); await loadReview(id); }
  async function refreshQueue(completedId?: string) {
    const response = await fetch("/api/organization-reviews", { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as { reviews?: ApiOrganizationReview[] };
    if (!response.ok) return;
    const items = body.reviews ?? []; setQueue(items);
    if (completedId) { const next = items[0]; setReview(null); if (next) { setDetailLoading(true); await loadReview(next.id); } }
  }
  async function start() {
    if (!review) return; setPending(true); setMessage("");
    const response = await fetch(`/api/organization-reviews/${review.id}/start`, { method: "POST" }).catch(() => null);
    const body = response ? (await response.json().catch(() => ({}))) as { review?: ApiOrganizationReview; message?: string } : {};
    if (!response?.ok || !body.review) setMessage(body.message ?? "Review could not be started."); else { setReview(body.review); await refreshQueue(); }
    setPending(false);
  }
  async function decide() {
    if (!review || !action) return;
    if (action !== "VERIFIED" && reason.trim().length < 10) { setMessage("Explain the decision in at least 10 characters."); return; }
    setPending(true); setMessage("");
    const response = await fetch(`/api/organization-reviews/${review.id}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, reason: reason.trim() || undefined }) }).catch(() => null);
    const body = response ? (await response.json().catch(() => ({}))) as { review?: ApiOrganizationReview; message?: string } : {};
    if (!response?.ok || !body.review) setMessage(body.message ?? "Decision could not be recorded."); else { const id = review.id; setAction(null); setReason(""); await refreshQueue(id); }
    setPending(false);
  }
  if (loading) return <main className={styles.loading}><LoaderCircle /><p>Opening organization reviews…</p></main>;
  if (!account) return null;

  return <AppShell scope="review" title="Organization review" description="Validate organization identity and business evidence through an auditable work queue." actions={<span className={styles.reviewer}><ShieldCheck />Reviewer</span>}>
      {message ? <div className={styles.notice}>{message}<button onClick={() => setMessage("")}><X /></button></div> : null}
      <div className={styles.layout}>
        <section className={styles.queue}><header><div><small>Worklist</small><h2>Organization queue</h2></div><Building2 /></header>{queue.length ? queue.map((item) => <button key={item.id} className={review?.id === item.id ? styles.selected : ""} onClick={() => selectReview(item.id)}><strong>{item.organization.publicName ?? item.organization.legalName}</strong><small>{item.organization.legalName}</small><span>{humanize(item.status)}</span><time>{date(item.submittedAt)}</time></button>) : <div className={styles.empty}><CheckCircle2 /><h3>Queue is clear</h3><p>Real organization submissions will appear here.</p></div>}</section>
        <section className={styles.workspace}>{detailLoading ? <div className={styles.loading}><LoaderCircle /><p>Loading review…</p></div> : review ? <><div className={styles.request}><div><small>Organization</small><strong>{review.organization.publicName ?? review.organization.legalName}</strong></div><span>{humanize(review.status)}</span></div><section><header><h2>Organization profile</h2><Building2 /></header><dl><Fact label="Legal name" value={review.organization.legalName} /><Fact label="Type" value={humanize(review.organization.type)} /><Fact label="Country" value={review.organization.countryCode} /><Fact label="Email" value={review.organization.email} /><Fact label="Website" value={review.organization.website} /><Fact label="Address" value={[review.organization.addressLine1, review.organization.city, review.organization.region].filter(Boolean).join(", ")} /></dl></section><section><header><div><h2>Evidence</h2><p>Access is authorized and auditable.</p></div><LockKeyhole /></header>{review.evidence.map((item) => item.file ? <article className={styles.evidence} key={item.id}><div><FileText /><strong>{item.file.originalName}</strong><a href={`/api/organization-reviews/${review.id}/evidence/${item.id}`} target="_blank">Open<ExternalLink /></a></div>{item.file.mediaType === "application/pdf" ? <iframe title={item.file.originalName} src={`/api/organization-reviews/${review.id}/evidence/${item.id}#toolbar=1`} /> : <Image unoptimized width={1200} height={800} alt={item.file.originalName} src={`/api/organization-reviews/${review.id}/evidence/${item.id}`} />}</article> : null)}</section></> : <div className={styles.empty}><ClipboardCheck /><h3>Select an organization</h3><p>Choose a submission to inspect its evidence.</p></div>}</section>
        <aside className={styles.decisions}><section><header><h2>Decision</h2><ShieldCheck /></header>{!review ? <p>Select a review.</p> : review.status === "SUBMITTED" ? <button className={styles.start} disabled={pending} onClick={start}>Start review</button> : review.assignedReviewerId !== account.accountId ? <p><LockKeyhole />Assigned to another reviewer.</p> : <div className={styles.actions}><button onClick={() => setAction("NEEDS_INFORMATION")}>Request information</button><button className={styles.approve} onClick={() => setAction("VERIFIED")}><BadgeCheck />Approve organization</button><button className={styles.reject} onClick={() => setAction("REJECTED")}><XCircle />Reject</button></div>}{action ? <div className={styles.form}><strong>{humanize(action)}</strong><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={action === "VERIFIED" ? "Optional review note" : "Required reason"} /><button disabled={pending} onClick={decide}>Record decision</button></div> : null}</section><section><header><h2>Audit history</h2><History /></header>{review?.auditTrail.length ? <ol>{review.auditTrail.map((entry) => <li key={entry.id}><i /><div><strong>{humanize(entry.action.replaceAll(".", "_"))}</strong><time>{date(entry.occurredAt)}</time>{entry.reason ? <p>{entry.reason}</p> : null}</div></li>)}</ol> : <p>No history available.</p>}</section></aside>
      </div>
  </AppShell>;
}

function Fact({ label, value }: { label: string; value?: string | null }) { return <div><dt>{label}</dt><dd>{value || "Not provided"}</dd></div>; }
function humanize(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function date(value?: string | null) { return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not submitted"; }
