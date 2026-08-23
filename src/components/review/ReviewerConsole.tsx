"use client";

import {
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  History,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import type {
  ApiReviewQueueItem,
  ApiSystemRole,
  ApiVerificationReview,
} from "@/lib/server/vetlinx-api";
import styles from "./ReviewerConsole.module.css";

interface MeResponse {
  account?: { accountId: string; email: string; roles: ApiSystemRole[] };
}

type DecisionAction = "NEEDS_INFORMATION" | "VERIFIED" | "REJECTED";

export function ReviewerConsole() {
  const router = useRouter();
  const [account, setAccount] = useState<NonNullable<MeResponse["account"]> | null>(null);
  const [queue, setQueue] = useState<ApiReviewQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [review, setReview] = useState<ApiVerificationReview | null>(null);
  const [filter, setFilter] = useState<"SUBMITTED" | "UNDER_REVIEW">("SUBMITTED");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [decision, setDecision] = useState<DecisionAction | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/session/me", { cache: "no-store" }),
      fetch("/api/reviews", { cache: "no-store" }),
    ])
      .then(async ([meResponse, queueResponse]) => {
        const me = (await meResponse.json().catch(() => ({}))) as MeResponse;
        const queueBody = (await queueResponse.json().catch(() => ({}))) as {
          reviews?: ApiReviewQueueItem[];
          message?: string;
        };
        if (!active) return;
        if (!meResponse.ok || !me.account) {
          router.replace("/login");
          return;
        }
        if (!hasReviewerAccess(me.account.roles)) {
          router.replace("/");
          return;
        }
        setAccount(me.account);
        if (!queueResponse.ok) {
          setMessage(queueBody.message ?? "The review queue could not be loaded.");
          return;
        }
        const nextQueue = queueBody.reviews ?? [];
        setQueue(nextQueue);
        const first = nextQueue.find((item) => item.status === "SUBMITTED") ?? nextQueue[0];
        if (first) {
          setDetailLoading(true);
          setSelectedId(first.id);
          setFilter(first.status);
        }
      })
      .catch(() => active && setMessage("VetLinX could not load reviewer operations."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    let active = true;
    fetch(`/api/reviews/${selectedId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          review?: ApiVerificationReview;
          message?: string;
        };
        if (!active) return;
        if (!response.ok || !body.review) {
          setMessage(body.message ?? "The selected review could not be loaded.");
          setReview(null);
          return;
        }
        setReview(body.review);
      })
      .catch(() => active && setMessage("The selected review could not be loaded."))
      .finally(() => active && setDetailLoading(false));
    return () => {
      active = false;
    };
  }, [selectedId]);

  const visibleQueue = queue.filter((item) => item.status === filter);
  const submittedCount = queue.filter((item) => item.status === "SUBMITTED").length;
  const activeCount = queue.filter((item) => item.status === "UNDER_REVIEW").length;

  async function refreshQueue(removeId?: string) {
    const response = await fetch("/api/reviews", { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as { reviews?: ApiReviewQueueItem[] };
    if (!response.ok) return;
    const nextQueue = body.reviews ?? [];
    setQueue(nextQueue);
    if (removeId && selectedId === removeId) {
      const next = nextQueue[0];
      setReview(null);
      if (next) setDetailLoading(true);
      setSelectedId(next?.id ?? null);
      if (next) setFilter(next.status);
    }
  }

  async function startReview() {
    if (!review) return;
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/reviews/${review.id}/start`, { method: "POST" }).catch(() => null);
    const body = response
      ? ((await response.json().catch(() => ({}))) as { review?: ApiVerificationReview; message?: string })
      : {};
    if (!response?.ok || !body.review) {
      setMessage(body.message ?? "The review could not be started.");
    } else {
      setReview(body.review);
      setFilter("UNDER_REVIEW");
      await refreshQueue();
    }
    setPending(false);
  }

  async function submitDecision() {
    if (!review || !decision) return;
    if (decision !== "VERIFIED" && reason.trim().length < 10) {
      setMessage("Explain the decision in at least 10 characters.");
      return;
    }
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/reviews/${review.id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: decision, reason: reason.trim() || undefined }),
    }).catch(() => null);
    const body = response
      ? ((await response.json().catch(() => ({}))) as { review?: ApiVerificationReview; message?: string })
      : {};
    if (!response?.ok || !body.review) {
      setMessage(body.message ?? "The decision could not be recorded.");
    } else {
      const completedId = review.id;
      setReview(body.review);
      setDecision(null);
      setReason("");
      await refreshQueue(completedId);
    }
    setPending(false);
  }

  function selectReview(requestId: string) {
    if (requestId === selectedId) return;
    setReview(null);
    setDetailLoading(true);
    setSelectedId(requestId);
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        <LoaderCircle />
        <p>Opening governed reviewer operations…</p>
      </main>
    );
  }
  if (!account) return null;

  return (
    <AppShell scope="review" title="Credential review" description="Inspect submitted evidence and record governed, auditable decisions." actions={<div className={styles.reviewerBadge}><ShieldCheck /><div><small>Reviewer</small><strong>{account.email}</strong></div></div>}>

        {message ? <div className={styles.notice} role="status"><span>{message}</span><button onClick={() => setMessage("")} aria-label="Dismiss message"><X /></button></div> : null}

        <div className={styles.reviewLayout}>
          <section className={styles.queuePanel} aria-labelledby="review-queue-title">
            <div className={styles.panelHeading}><div><span>Worklist</span><h2 id="review-queue-title">Review queue</h2></div><Inbox /></div>
            <div className={styles.tabs} role="tablist" aria-label="Review status">
              <button className={filter === "SUBMITTED" ? styles.activeTab : ""} onClick={() => setFilter("SUBMITTED")} role="tab" aria-selected={filter === "SUBMITTED"}>Submitted <span>{submittedCount}</span></button>
              <button className={filter === "UNDER_REVIEW" ? styles.activeTab : ""} onClick={() => setFilter("UNDER_REVIEW")} role="tab" aria-selected={filter === "UNDER_REVIEW"}>Under review <span>{activeCount}</span></button>
            </div>
            <div className={styles.queueList}>
              {visibleQueue.length ? visibleQueue.map((item) => (
                <button key={item.id} className={selectedId === item.id ? styles.selectedQueueItem : ""} onClick={() => selectReview(item.id)}>
                  <div><strong>{item.professional?.displayName ?? "Professional record"}</strong><small>{item.credential?.title ?? "Credential"}</small></div>
                  <span className={item.status === "UNDER_REVIEW" ? styles.reviewing : styles.submitted}><i />{labelStatus(item.status)}</span>
                  <time>{relativeDate(item.updatedAt)}</time>
                </button>
              )) : (
                <div className={styles.emptyQueue}><CheckCircle2 /><h3>No {filter === "SUBMITTED" ? "submitted" : "active"} reviews</h3><p>New real requests will appear here automatically.</p></div>
              )}
            </div>
          </section>

          <section className={styles.workspace} aria-label="Selected verification request">
            {detailLoading ? <div className={styles.detailLoading}><LoaderCircle /><span>Loading request…</span></div> : review ? (
              <>
                <div className={styles.requestBar}>
                  <div><small>Request ID</small><strong>{shortId(review.id)}</strong></div>
                  <div><small>Submitted</small><strong>{formatDateTime(review.submittedAt)}</strong></div>
                  <StatusBadge status={review.status} />
                </div>

                <section className={styles.factsSection}>
                  <div className={styles.sectionTitle}><h2>Professional</h2><UserRound /></div>
                  <div className={styles.professionalFacts}>
                    <span className={styles.avatar}>{initials(review.professional?.displayName ?? "Professional")}</span>
                    <div><strong>{review.professional?.displayName ?? "Unavailable"}</strong><small>Veterinary professional</small></div>
                    <Fact label="Email" value={review.professional?.account.email ?? "Unavailable"} />
                    <Fact label="Country" value={countryName(review.professional?.countryCode)} />
                  </div>
                </section>

                <section className={styles.factsSection}>
                  <div className={styles.sectionTitle}><h2>Credential</h2><BadgeCheck /></div>
                  <div className={styles.credentialFacts}>
                    <div className={styles.credentialIdentity}><span><FileCheck2 /></span><div><strong>{review.credential?.title ?? "Unavailable"}</strong><small>{review.credential?.issuingOrganization ?? "Issuer unavailable"}</small></div></div>
                    <Fact label="Type" value={humanize(review.credential?.typeCode)} />
                    <Fact label="Country" value={countryName(review.credential?.countryCode)} />
                    <Fact label="Issue date" value={formatDate(review.credential?.issueDate)} />
                    <Fact label="Expiry date" value={formatDate(review.credential?.expiryDate)} />
                  </div>
                </section>

                <section className={styles.evidenceSection}>
                  <div className={styles.sectionTitle}><div><h2>Evidence</h2><p>Files remain private and every access is role-protected.</p></div><LockKeyhole /></div>
                  {review.evidence.length ? review.evidence.map((item) => item.file ? (
                    <article className={styles.evidenceCard} key={item.id}>
                      <div className={styles.evidenceHeader}><div><FileText /><span><strong>{item.file.originalName}</strong><small>{formatBytes(item.file.byteSize)} · {item.file.mediaType}</small></span></div><a href={`/api/reviews/${review.id}/evidence/${item.id}`} target="_blank" rel="noreferrer">Open original<ExternalLink /></a></div>
                      {item.file.mediaType === "application/pdf" ? (
                        <iframe title={`Evidence ${item.file.originalName}`} src={`/api/reviews/${review.id}/evidence/${item.id}#toolbar=1&navpanes=0`} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt={`Evidence file ${item.file.originalName}`} src={`/api/reviews/${review.id}/evidence/${item.id}`} />
                      )}
                    </article>
                  ) : null) : <div className={styles.noEvidence}><FileText /><p>No validated evidence is attached.</p></div>}
                </section>
              </>
            ) : (
              <div className={styles.noSelection}><ClipboardCheck /><h2>Select a review</h2><p>Choose a real submitted request from the queue to inspect its evidence.</p></div>
            )}
          </section>

          <aside className={styles.decisionPanel} aria-label="Decision and history">
            <section>
              <div className={styles.panelHeading}><div><span>Governance</span><h2>Decision</h2></div><ShieldCheck /></div>
              {!review ? <p className={styles.decisionHint}>Select a request to begin.</p> : isTerminal(review.status) ? (
                <div className={styles.terminalDecision}><StatusBadge status={review.status} /><p>This decision is final and preserved in the audit trail.</p></div>
              ) : review.status === "SUBMITTED" ? (
                <><p className={styles.decisionHint}>Claim this request before accessing decision controls.</p><button className={styles.startButton} disabled={pending} onClick={startReview}>{pending ? <LoaderCircle className={styles.spinner} /> : <ClipboardCheck />}Start review</button></>
              ) : review.assignedReviewerId !== account.accountId ? (
                <p className={styles.assignedNotice}><LockKeyhole />This request is assigned to another authorized reviewer.</p>
              ) : (
                <div className={styles.decisionActions}>
                  <button onClick={() => setDecision("NEEDS_INFORMATION")}><Clock3 />Request information</button>
                  <button className={styles.approveButton} onClick={() => setDecision("VERIFIED")}><BadgeCheck />Approve credential</button>
                  <button className={styles.rejectButton} onClick={() => setDecision("REJECTED")}><XCircle />Reject</button>
                </div>
              )}
              {decision ? (
                <div className={styles.decisionForm}>
                  <div><strong>{decisionTitle(decision)}</strong><button onClick={() => { setDecision(null); setReason(""); }} aria-label="Cancel decision"><X /></button></div>
                  <label htmlFor="decision-reason">{decision === "VERIFIED" ? "Review note (optional)" : "Reason"}</label>
                  <textarea id="decision-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} placeholder={decisionPlaceholder(decision)} />
                  <button className={decision === "REJECTED" ? styles.confirmReject : styles.confirmDecision} disabled={pending} onClick={submitDecision}>{pending ? <LoaderCircle className={styles.spinner} /> : <CheckCircle2 />}Record decision</button>
                </div>
              ) : null}
              <div className={styles.governanceNote}><LockKeyhole /><p><strong>Decisions are final and tracked.</strong> Verify evidence carefully before proceeding.</p></div>
            </section>

            <section className={styles.historySection}>
              <div className={styles.panelHeading}><div><span>Traceability</span><h2>Status history</h2></div><History /></div>
              {review?.auditTrail.length ? <ol>{review.auditTrail.map((entry) => <li key={entry.id}><i /><div><strong>{auditLabel(entry.action)}</strong><time>{formatDateTime(entry.occurredAt)}</time>{entry.reason ? <p>{entry.reason}</p> : null}</div></li>)}</ol> : <p className={styles.decisionHint}>No history is available for the selected request.</p>}
            </section>
          </aside>
        </div>
    </AppShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className={styles.fact}><small>{label}</small><strong>{value}</strong></div>;
}

function StatusBadge({ status }: { status: ApiVerificationReview["status"] }) {
  return <span className={`${styles.statusBadge} ${styles[`status${status}`] ?? ""}`}><i />{labelStatus(status)}</span>;
}

function hasReviewerAccess(roles: ApiSystemRole[]) {
  return roles.some((role) => role === "REVIEWER" || role === "OPERATIONS_ADMIN" || role === "PLATFORM_ADMIN");
}

function isTerminal(status: ApiVerificationReview["status"]) {
  return status === "VERIFIED" || status === "REJECTED" || status === "CANCELLED" || status === "NEEDS_INFORMATION";
}

function labelStatus(status: string) {
  return humanize(status).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanize(value?: string | null) {
  return value ? value.toLowerCase().replaceAll("_", " ") : "Unavailable";
}

function initials(value: string) {
  return value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VL";
}

function shortId(value: string) {
  return `REQ-${value.slice(0, 8).toUpperCase()}`;
}

function formatDate(value?: string | null) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function relativeDate(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function countryName(code?: string | null) {
  if (!code) return "Unavailable";
  return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function decisionTitle(action: DecisionAction) {
  if (action === "VERIFIED") return "Approve credential";
  if (action === "REJECTED") return "Reject credential";
  return "Request more information";
}

function decisionPlaceholder(action: DecisionAction) {
  if (action === "VERIFIED") return "Add a concise verification note…";
  if (action === "REJECTED") return "Explain exactly why this credential cannot be verified…";
  return "Specify the missing, unclear, or inconsistent evidence…";
}

function auditLabel(action: string) {
  const labels: Record<string, string> = {
    "verification.request.created": "Request created",
    "verification.evidence.added": "Evidence added",
    "verification.request.submitted": "Request submitted",
    "verification.review.started": "Review started",
    "verification.review.needs_information": "Information requested",
    "verification.review.verified": "Credential approved",
    "verification.review.rejected": "Credential rejected",
  };
  return labels[action] ?? labelStatus(action.replaceAll(".", "_"));
}
