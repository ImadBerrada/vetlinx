"use client";

import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  ExternalLink,
  FileCheck2,
  FileClock,
  Landmark,
  Link2,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Route,
  ShieldCheck,
  TriangleAlert,
  Unlink,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import type {
  ApiCredential,
  ApiLicencePathwayDetail,
  ApiLicensingEligibility,
  ApiPathwayEnrollment,
  ApiRequirementProgress,
} from "@/lib/server/vetlinx-api";
import styles from "./PathwayWorkspace.module.css";

interface WorkspaceBody {
  message?: string;
  errors?: Record<string, string[]>;
  pathway?: ApiLicencePathwayDetail;
  eligibility?: ApiLicensingEligibility;
  enrollments?: ApiPathwayEnrollment[];
  enrollment?: ApiPathwayEnrollment;
  credentials?: ApiCredential[];
  progress?: ApiRequirementProgress;
}

export function PathwayWorkspace({ pathwayId }: { pathwayId: string }) {
  const router = useRouter();
  const [pathway, setPathway] = useState<ApiLicencePathwayDetail | null>(null);
  const [eligibility, setEligibility] = useState<ApiLicensingEligibility | null>(null);
  const [enrollment, setEnrollment] = useState<ApiPathwayEnrollment | null>(null);
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/session/me", { cache: "no-store" }),
      fetch(`/api/licensing/pathways/${encodeURIComponent(pathwayId)}`, { cache: "no-store" }),
      fetch(`/api/licensing/pathways/${encodeURIComponent(pathwayId)}/eligibility`, { cache: "no-store" }),
      fetch("/api/licensing/enrollments", { cache: "no-store" }),
      fetch("/api/credentials", { cache: "no-store" }),
    ])
      .then(async ([sessionResponse, pathwayResponse, eligibilityResponse, enrollmentResponse, credentialResponse]) => {
        const [sessionBody, pathwayBody, eligibilityBody, enrollmentBody, credentialBody] = await Promise.all(
          [sessionResponse, pathwayResponse, eligibilityResponse, enrollmentResponse, credentialResponse].map(readBody),
        ) as [WorkspaceBody & { account?: unknown; profile?: unknown }, WorkspaceBody, WorkspaceBody, WorkspaceBody, WorkspaceBody];
        if (!active) return;
        if (!sessionResponse.ok || !sessionBody.account) {
          router.replace("/login");
          return;
        }
        if (!sessionBody.profile) {
          router.replace("/onboarding");
          return;
        }
        if (pathwayResponse.status === 404) {
          setNotFound(true);
          return;
        }
        const failed = [pathwayResponse, eligibilityResponse, enrollmentResponse, credentialResponse].find((response) => !response.ok);
        if (failed) {
          const body = failed === pathwayResponse ? pathwayBody : failed === eligibilityResponse ? eligibilityBody : failed === enrollmentResponse ? enrollmentBody : credentialBody;
          setMessage(body.message ?? "This licensing pathway could not be loaded.");
          return;
        }
        setPathway(pathwayBody.pathway ?? null);
        setEligibility(eligibilityBody.eligibility ?? null);
        setCredentials(credentialBody.credentials ?? []);
        setEnrollment(
          (enrollmentBody.enrollments ?? []).find(
            (item) => item.pathwayVersion.pathway.id === pathwayId,
          ) ?? null,
        );
      })
      .catch(() => active && setMessage("VetLinX could not reach the licensing service. Try again."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [pathwayId, router]);

  const verifiedCredentials = useMemo(
    () => credentials.filter((credential) => credential.status === "VERIFIED"),
    [credentials],
  );

  async function startPathway() {
    setPendingAction("enroll");
    setMessage("");
    const response = await fetch(`/api/licensing/pathways/${encodeURIComponent(pathwayId)}/enroll`, {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
    }).catch(() => null);
    const body = response ? await readBody(response) : {};
    if (!response?.ok || !body.enrollment) {
      setMessage(body.message ?? "The pathway could not be started.");
      setPendingAction("");
      return;
    }
    setEnrollment(body.enrollment);
    setMessage("Pathway started. Your progress is saved to this published version.");
    setPendingAction("");
  }

  async function linkCredential(requirementId: string, credential: ApiCredential) {
    if (!enrollment) return;
    setPendingAction(requirementId);
    setMessage("");
    const response = await fetch(
      `/api/licensing/enrollments/${enrollment.id}/requirements/${requirementId}/credential`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credentialId: credential.id }),
      },
    ).catch(() => null);
    const body = response ? await readBody(response) : {};
    if (!response?.ok || !body.progress) {
      setMessage(body.message ?? "The credential could not be linked.");
      setPendingAction("");
      return;
    }
    await refreshEnrollment(enrollment.id);
    setMessage("Verified evidence linked. Your pathway progress has been saved.");
    setPendingAction("");
  }

  async function unlinkCredential(requirementId: string) {
    if (!enrollment) return;
    setPendingAction(requirementId);
    const response = await fetch(
      `/api/licensing/enrollments/${enrollment.id}/requirements/${requirementId}/credential`,
      { method: "DELETE" },
    ).catch(() => null);
    if (!response?.ok) {
      const body = response ? await readBody(response) : {};
      setMessage(body.message ?? "The evidence link could not be removed.");
    } else {
      await refreshEnrollment(enrollment.id);
      setMessage("Evidence link removed.");
    }
    setPendingAction("");
  }

  async function saveExternalApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    setPendingAction("external");
    setMessage("");
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/licensing/enrollments/${enrollment.id}/external-application`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({
        authorityReference: data.get("authorityReference"),
        submittedAt: data.get("submittedAt"),
        status: "SUBMITTED",
      }),
    }).catch(() => null);
    const body = response ? await readBody(response) : {};
    if (!response?.ok) setMessage(body.message ?? "The external application could not be recorded.");
    else {
      await refreshEnrollment(enrollment.id);
      setMessage("External application recorded as user reported.");
    }
    setPendingAction("");
  }

  async function withdrawEnrollment() {
    if (!enrollment) return;
    setPendingAction("withdraw");
    const response = await fetch(`/api/licensing/enrollments/${enrollment.id}/withdraw`, {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
    }).catch(() => null);
    const body = response ? await readBody(response) : {};
    if (!response?.ok || !body.enrollment) setMessage(body.message ?? "The pathway could not be withdrawn.");
    else {
      setEnrollment(body.enrollment);
      setMessage("Pathway withdrawn. Its history remains in your record.");
    }
    setConfirmWithdraw(false);
    setPendingAction("");
  }

  async function refreshEnrollment(enrollmentId: string) {
    const response = await fetch(`/api/licensing/enrollments/${enrollmentId}`, { cache: "no-store" });
    const body = await readBody(response);
    if (response.ok && body.enrollment) setEnrollment(body.enrollment);
  }

  if (loading) return <AppShell title="Licensing pathway"><Loading /></AppShell>;
  if (notFound) return <AppShell title="Pathway not found"><NotFound /></AppShell>;
  if (!pathway || !eligibility) return <AppShell title="Licensing pathway"><ErrorState message={message} /></AppShell>;

  const version = pathway.versions[0];
  const pinnedVersion = enrollment?.pathwayVersion;
  const isTerminal = enrollment ? ["APPROVED", "REJECTED", "WITHDRAWN"].includes(enrollment.status) : false;
  const superseded = Boolean(enrollment && version && pinnedVersion && version.id !== pinnedVersion.id);

  return (
    <AppShell title={pathway.licenceType.nameEn} description={`${pathway.jurisdiction.nameEn} · ${pathway.authority.nameEn}`}>
      <div className={styles.workspace}>
        <Link className={styles.back} href="/licensing"><ArrowLeft />All licensing pathways</Link>
        <section className={styles.dossier}>
          <div className={styles.dossierMark}><Landmark /></div>
          <div className={styles.dossierCopy}>
            <span>Governed pathway</span>
            <h2>{pathway.licenceType.nameEn}</h2>
            <p>{pathway.authority.nameEn} · {pathway.jurisdiction.nameEn}</p>
          </div>
          <div className={styles.sourceBlock}>
            <span><ShieldCheck />Published source</span>
            {version ? <><a href={version.sourceUrl} target="_blank" rel="noreferrer">{version.sourceTitle}<ExternalLink /></a><small>Effective {formatDate(version.effectiveFrom)}{version.reviewedAt ? ` · reviewed ${formatDate(version.reviewedAt)}` : ""}</small></> : null}
          </div>
        </section>

        {superseded ? <div className={styles.warning}><TriangleAlert /><p><strong>A newer pathway version is published.</strong> Your saved enrollment remains pinned to version {pinnedVersion?.version} so its requirements and history do not change silently.</p></div> : null}
        {message ? <div className={styles.notice} role="status">{message}</div> : null}

        {!enrollment ? (
          <BeforeEnrollment pathway={pathway} eligibility={eligibility} pending={pendingAction === "enroll"} onStart={startPathway} />
        ) : (
          <div className={styles.enrolledLayout}>
            <main className={styles.progressPanel}>
              <header className={styles.progressHeader}>
                <div><span><Route />Saved pathway</span><h2>Pathway version {enrollment.pathwayVersion.version}</h2><p>Started {formatDate(enrollment.startedAt)} · {statusLabel(enrollment.status)}</p></div>
                <div className={styles.progressCount}><strong>{enrollment.readiness.satisfied}/{enrollment.readiness.required}</strong><span>required items</span></div>
              </header>
              <div className={styles.requirementList}>
                {enrollment.requirements.map((requirement) => {
                  const linked = credentials.find((item) => item.id === requirement.credentialId);
                  const suggested = verifiedCredentials.find((item) => item.id === eligibility.requirements.find((entry) => entry.id === requirement.id)?.credentialId) ?? verifiedCredentials[0];
                  return <article key={requirement.id} className={requirement.state === "SATISFIED" ? styles.satisfied : ""}>
                    <span className={styles.requirementState}>{requirement.state === "SATISFIED" ? <Check /> : <CircleDashed />}</span>
                    <div className={styles.requirementCopy}><small>Requirement {requirement.position}{requirement.required ? " · required" : " · optional"}</small><h3>{requirement.titleEn}</h3><p>{requirement.descriptionEn}</p>{requirement.note ? <blockquote>{requirement.note}</blockquote> : null}</div>
                    <div className={styles.requirementAction}>
                      {linked ? <><span className={styles.satisfiedLabel}><CheckCircle2 />Requirement satisfied</span><strong><FileCheck2 />{linked.title}</strong><small>{linked.issuingOrganization} · VetLinX verified</small><button type="button" disabled={pendingAction === requirement.id || isTerminal} onClick={() => unlinkCredential(requirement.id)}><Unlink />Remove link</button></>
                        : suggested ? <><span className={styles.privateLabel}><LockKeyhole />Private evidence</span><strong>{suggested.title}</strong><small>{suggested.issuingOrganization} · {suggested.countryCode}</small><button type="button" disabled={pendingAction === requirement.id || isTerminal} onClick={() => linkCredential(requirement.id, suggested)}>{pendingAction === requirement.id ? <LoaderCircle className={styles.spinner} /> : <Link2 />}Use {suggested.title.toLowerCase()}</button></>
                        : <><span className={styles.missingLabel}><FileClock />Evidence needed</span><p>Add and verify a matching credential before linking it here.</p><Link href="/credentials">Open credentials <ChevronRight /></Link></>}
                    </div>
                  </article>;
                })}
              </div>
            </main>

            <aside className={styles.sidePanel}>
              <section className={styles.readinessCard}>
                <span>{enrollment.readiness.ready ? <CheckCircle2 /> : <CircleDashed />}</span>
                <h2>{enrollment.readiness.ready ? "Ready to record submission" : `${enrollment.readiness.remaining} required item${enrollment.readiness.remaining === 1 ? "" : "s"} remaining`}</h2>
                <p>VetLinX evaluates linked evidence. The licensing authority makes the application decision.</p>
              </section>
              <section className={styles.externalCard}>
                <span><Landmark />External application</span>
                {enrollment.externalApplication ? <div className={styles.reported}><strong>{enrollment.externalApplication.status.replaceAll("_", " ")}</strong><p>Reference <b>{enrollment.externalApplication.authorityReference}</b></p><small><ShieldCheck />User reported · not authority verified</small></div>
                  : enrollment.readiness.ready && !isTerminal ? <form onSubmit={saveExternalApplication}><label>Authority reference<input name="authorityReference" minLength={2} required /></label><label>Submission date<input name="submittedAt" type="date" required /></label><p><LockKeyhole />This records what you report; it does not submit to the authority.</p><button disabled={pendingAction === "external"}>{pendingAction === "external" ? <LoaderCircle className={styles.spinner} /> : <Check />}Record external submission</button></form>
                  : <p>Complete required evidence before recording an external submission.</p>}
              </section>
              <section className={styles.historyCard}><span><FileClock />Activity</span><ol><li><b>Pathway started</b><small>{formatDate(enrollment.startedAt)}</small></li>{enrollment.submittedExternallyAt ? <li><b>External submission recorded</b><small>{formatDate(enrollment.submittedExternallyAt)}</small></li> : null}</ol></section>
              {!isTerminal ? <section className={styles.withdrawCard}>{confirmWithdraw ? <><strong>Withdraw this pathway?</strong><p>Your saved history remains, but this active workflow closes.</p><div><button type="button" onClick={() => setConfirmWithdraw(false)}>Keep pathway</button><button type="button" disabled={pendingAction === "withdraw"} onClick={withdrawEnrollment}>Confirm withdrawal</button></div></> : <button type="button" onClick={() => setConfirmWithdraw(true)}>Withdraw pathway</button>}</section> : null}
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function BeforeEnrollment({ pathway, eligibility, pending, onStart }: { pathway: ApiLicencePathwayDetail; eligibility: ApiLicensingEligibility; pending: boolean; onStart: () => void }) {
  return <div className={styles.beforeLayout}><main className={styles.requirementsPreview}><header><div><span>Readiness preview</span><h2>Published requirements</h2></div><div><strong>{eligibility.summary.satisfied}/{eligibility.summary.required}</strong><small>already satisfied</small></div></header><div>{eligibility.requirements.map((requirement) => <article key={requirement.id}><span>{requirement.state === "SATISFIED" ? <Check /> : requirement.position}</span><div><small>{requirement.required ? "Required" : "Optional"}</small><h3>{requirement.titleEn}</h3><p>{requirement.descriptionEn}</p><blockquote>{requirement.explanation}</blockquote></div><b className={requirement.state === "SATISFIED" ? styles.ready : styles.needsWork}>{requirement.state.replaceAll("_", " ")}</b></article>)}</div></main><aside className={styles.startCard}><span><ShieldCheck />Before you start</span><h2>Save this pathway to your record</h2><p>Your enrollment will stay pinned to published version {eligibility.version}. Future source changes cannot silently rewrite your checklist.</p><ul><li><Check />Reuse private verified credentials</li><li><Check />Save and resume your progress</li><li><Check />Track an external application honestly</li></ul><button type="button" disabled={pending} onClick={onStart}>{pending ? <LoaderCircle className={styles.spinner} /> : <Route />}{pending ? "Starting…" : "Start pathway"}</button><small>{pathway.authority.nameEn} remains the decision-making authority.</small></aside></div>;
}

function Loading() { return <div className={styles.loading}><LoaderCircle /><div><strong>Loading pathway</strong><span>Checking the published source and your evidence…</span></div></div>; }
function NotFound() { return <div className={styles.state}><Route /><h2>Pathway not found</h2><p>This pathway is unavailable or no longer published.</p><Link href="/licensing">Return to licensing pathways</Link></div>; }
function ErrorState({ message }: { message: string }) { return <div className={styles.state}><RefreshCw /><h2>Pathway unavailable</h2><p>{message || "This pathway could not be loaded."}</p><Link href="/licensing">Return to licensing pathways</Link></div>; }
async function readBody(response: Response): Promise<WorkspaceBody> { return (await response.json().catch(() => ({}))) as WorkspaceBody; }
function formatDate(value: string | null | undefined) { if (!value) return "Not specified"; return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)); }
function statusLabel(status: ApiPathwayEnrollment["status"]) { return status.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
