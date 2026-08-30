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
import { licensingCopy } from "@/lib/i18n/licensing";
import type { Locale } from "@/lib/i18n/locales";
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

export function PathwayWorkspace({ pathwayId, locale }: { pathwayId: string; locale: Locale }) {
  const copy = licensingCopy[locale].pathway;
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

  if (loading) return <AppShell title={copy.pageTitle} locale={locale}><Loading locale={locale} /></AppShell>;
  if (notFound) return <AppShell title={copy.pageTitle} locale={locale}><NotFound locale={locale} /></AppShell>;
  if (!pathway || !eligibility) return <AppShell title={copy.pageTitle} locale={locale}><ErrorState message={message} locale={locale} /></AppShell>;

  const version = pathway.versions[0];
  const pinnedVersion = enrollment?.pathwayVersion;
  const isTerminal = enrollment ? ["APPROVED", "REJECTED", "WITHDRAWN"].includes(enrollment.status) : false;
  const superseded = Boolean(enrollment && version && pinnedVersion && version.id !== pinnedVersion.id);

  return (
    <AppShell title={locale === "ar" ? pathway.licenceType.nameAr : pathway.licenceType.nameEn} description={`${locale === "ar" ? pathway.jurisdiction.nameAr : pathway.jurisdiction.nameEn} · ${locale === "ar" ? pathway.authority.nameAr : pathway.authority.nameEn}`} locale={locale}>
      <div className={styles.workspace}>
        <Link className={styles.back} href="/licensing"><ArrowLeft className={styles.directionalIcon} />{copy.allPathways}</Link>
        <section className={styles.dossier}>
          <div className={styles.dossierMark}><Landmark /></div>
          <div className={styles.dossierCopy}>
            <span>{copy.governed}</span>
            <h2>{locale === "ar" ? pathway.licenceType.nameAr : pathway.licenceType.nameEn}</h2>
            <p>{locale === "ar" ? pathway.authority.nameAr : pathway.authority.nameEn} · {locale === "ar" ? pathway.jurisdiction.nameAr : pathway.jurisdiction.nameEn}</p>
          </div>
          <div className={styles.sourceBlock}>
            <span><ShieldCheck />{copy.publishedSource}</span>
            {version ? <><a href={version.sourceUrl} target="_blank" rel="noreferrer">{version.sourceTitle}<ExternalLink /></a><small>Effective {formatDate(version.effectiveFrom)}{version.reviewedAt ? ` · reviewed ${formatDate(version.reviewedAt)}` : ""}</small></> : null}
          </div>
        </section>

        {superseded ? <div className={styles.warning}><TriangleAlert /><p><strong>A newer pathway version is published.</strong> Your saved enrollment remains pinned to version {pinnedVersion?.version} so its requirements and history do not change silently.</p></div> : null}
        {message ? <div className={styles.notice} role="status">{message}</div> : null}

        {!enrollment ? (
          <BeforeEnrollment pathway={pathway} eligibility={eligibility} pending={pendingAction === "enroll"} onStart={startPathway} copy={copy} locale={locale} />
        ) : (
          <div className={styles.enrolledLayout}>
            <main className={styles.progressPanel}>
              <header className={styles.progressHeader}>
                <div><span><Route />{copy.saved}</span><h2>{copy.version} {enrollment.pathwayVersion.version}</h2><p>{copy.started} {formatDate(enrollment.startedAt, locale)} · {statusLabel(enrollment.status, locale)}</p></div>
                <div className={styles.progressCount}><strong>{enrollment.readiness.satisfied}/{enrollment.readiness.required}</strong><span>{copy.requiredItems}</span></div>
              </header>
              <div className={styles.requirementList}>
                {enrollment.requirements.map((requirement) => {
                  const linked = credentials.find((item) => item.id === requirement.credentialId);
                  const suggested = verifiedCredentials.find((item) => item.id === eligibility.requirements.find((entry) => entry.id === requirement.id)?.credentialId) ?? verifiedCredentials[0];
                  return <article key={requirement.id} className={requirement.state === "SATISFIED" ? styles.satisfied : ""}>
                    <span className={styles.requirementState}>{requirement.state === "SATISFIED" ? <Check /> : <CircleDashed />}</span>
                    <div className={styles.requirementCopy}><small>{copy.requirement} {requirement.position}{requirement.required ? ` · ${copy.required}` : ` · ${copy.optional}`}</small><h3>{locale === "ar" ? requirement.titleAr : requirement.titleEn}</h3><p>{locale === "ar" ? requirement.descriptionAr : requirement.descriptionEn}</p>{requirement.note ? <blockquote>{requirement.note}</blockquote> : null}</div>
                    <div className={styles.requirementAction}>
                      {linked ? <><span className={styles.satisfiedLabel}><CheckCircle2 />{copy.satisfied}</span><strong><FileCheck2 />{linked.title}</strong><small>{linked.issuingOrganization} · VetLinX verified</small><button type="button" disabled={pendingAction === requirement.id || isTerminal} onClick={() => unlinkCredential(requirement.id)}><Unlink />{copy.removeLink}</button></>
                        : suggested ? <><span className={styles.privateLabel}><LockKeyhole />{copy.privateEvidence}</span><strong>{suggested.title}</strong><small>{suggested.issuingOrganization} · {suggested.countryCode}</small><button type="button" disabled={pendingAction === requirement.id || isTerminal} onClick={() => linkCredential(requirement.id, suggested)}>{pendingAction === requirement.id ? <LoaderCircle className={styles.spinner} /> : <Link2 />}{copy.useEvidence} {suggested.title.toLowerCase()}</button></>
                        : <><span className={styles.missingLabel}><FileClock />{copy.evidenceNeeded}</span><p>{locale === "ar" ? "أضف مؤهلاً مطابقاً ووثّقه قبل ربطه هنا." : "Add and verify a matching credential before linking it here."}</p><Link href="/credentials">{copy.openCredentials} <ChevronRight className={styles.directionalIcon} /></Link></>}
                    </div>
                  </article>;
                })}
              </div>
            </main>

            <aside className={styles.sidePanel}>
              <section className={styles.readinessCard}>
                <span>{enrollment.readiness.ready ? <CheckCircle2 /> : <CircleDashed />}</span>
                <h2>{enrollment.readiness.ready ? copy.readySubmission : `${enrollment.readiness.remaining} ${copy.remaining}`}</h2>
                <p>{copy.readinessTruth}</p>
              </section>
              <section className={styles.externalCard}>
                <span><Landmark />{copy.externalApplication}</span>
                {enrollment.externalApplication ? <div className={styles.reported}><strong>{enrollment.externalApplication.status.replaceAll("_", " ")}</strong><p>{copy.authorityReference} <b dir="ltr">{enrollment.externalApplication.authorityReference}</b></p><small><ShieldCheck />{copy.userReported}</small></div>
                  : enrollment.readiness.ready && !isTerminal ? <form onSubmit={saveExternalApplication}><label>{copy.authorityReference}<input name="authorityReference" dir="ltr" minLength={2} required /></label><label>{copy.submissionDate}<input name="submittedAt" type="date" required /></label><p><LockKeyhole />{copy.recordTruth}</p><button disabled={pendingAction === "external"}>{pendingAction === "external" ? <LoaderCircle className={styles.spinner} /> : <Check />}{copy.recordSubmission}</button></form>
                  : <p>{copy.completeFirst}</p>}
              </section>
              <section className={styles.historyCard}><span><FileClock />{copy.activity}</span><ol><li><b>{copy.started}</b><small>{formatDate(enrollment.startedAt, locale)}</small></li>{enrollment.submittedExternallyAt ? <li><b>{copy.externalRecorded}</b><small>{formatDate(enrollment.submittedExternallyAt, locale)}</small></li> : null}</ol></section>
              {!isTerminal ? <section className={styles.withdrawCard}>{confirmWithdraw ? <><strong>{copy.withdrawQuestion}</strong><p>{copy.withdrawBody}</p><div><button type="button" onClick={() => setConfirmWithdraw(false)}>{copy.keep}</button><button type="button" disabled={pendingAction === "withdraw"} onClick={withdrawEnrollment}>{copy.confirmWithdraw}</button></div></> : <button type="button" onClick={() => setConfirmWithdraw(true)}>{copy.withdraw}</button>}</section> : null}
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function BeforeEnrollment({ pathway, eligibility, pending, onStart, copy, locale }: { pathway: ApiLicencePathwayDetail; eligibility: ApiLicensingEligibility; pending: boolean; onStart: () => void; copy: (typeof licensingCopy)[Locale]["pathway"]; locale: Locale }) {
  return <div className={styles.beforeLayout}><main className={styles.requirementsPreview}><header><div><span>{copy.preview}</span><h2>{copy.publishedRequirements}</h2></div><div><strong>{eligibility.summary.satisfied}/{eligibility.summary.required}</strong><small>{copy.alreadySatisfied}</small></div></header><div>{eligibility.requirements.map((requirement) => <article key={requirement.id}><span>{requirement.state === "SATISFIED" ? <Check /> : requirement.position}</span><div><small>{requirement.required ? copy.required : copy.optional}</small><h3>{locale === "ar" ? requirement.titleAr : requirement.titleEn}</h3><p>{locale === "ar" ? requirement.descriptionAr : requirement.descriptionEn}</p><blockquote>{localizedExplanation(requirement.explanation, locale)}</blockquote></div><b className={requirement.state === "SATISFIED" ? styles.ready : styles.needsWork}>{requirementStateLabel(requirement.state, locale)}</b></article>)}</div></main><aside className={styles.startCard}><span><ShieldCheck />{copy.beforeStart}</span><h2>{copy.saveToRecord}</h2><p>{copy.pinnedExplanation}</p><ul><li><Check />{copy.reuseEvidence}</li><li><Check />{copy.saveResume}</li><li><Check />{copy.trackHonestly}</li></ul><button type="button" disabled={pending} onClick={onStart}>{pending ? <LoaderCircle className={styles.spinner} /> : <Route />}{pending ? (locale === "ar" ? "جارٍ البدء…" : "Starting…") : copy.start}</button><small>{locale === "ar" ? pathway.authority.nameAr : pathway.authority.nameEn} {copy.decisionAuthority}</small></aside></div>;
}

function Loading({ locale }: { locale: Locale }) { return <div className={styles.loading}><LoaderCircle /><div><strong>{locale === "ar" ? "جارٍ تحميل المسار" : "Loading pathway"}</strong><span>{locale === "ar" ? "جارٍ التحقق من المصدر المنشور وأدلتك…" : "Checking the published source and your evidence…"}</span></div></div>; }
function NotFound({ locale }: { locale: Locale }) { return <div className={styles.state}><Route /><h2>{locale === "ar" ? "المسار غير موجود" : "Pathway not found"}</h2><p>{locale === "ar" ? "هذا المسار غير متاح أو لم يعد منشوراً." : "This pathway is unavailable or no longer published."}</p><Link href="/licensing">{locale === "ar" ? "العودة إلى مسارات الترخيص" : "Return to licensing pathways"}</Link></div>; }
function ErrorState({ message, locale }: { message: string; locale: Locale }) { return <div className={styles.state}><RefreshCw /><h2>{locale === "ar" ? "المسار غير متاح" : "Pathway unavailable"}</h2><p>{message || (locale === "ar" ? "تعذر تحميل هذا المسار." : "This pathway could not be loaded.")}</p><Link href="/licensing">{locale === "ar" ? "العودة إلى مسارات الترخيص" : "Return to licensing pathways"}</Link></div>; }
async function readBody(response: Response): Promise<WorkspaceBody> { return (await response.json().catch(() => ({}))) as WorkspaceBody; }
function formatDate(value: string | null | undefined, locale: Locale = "en") { if (!value) return "Not specified"; return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)); }
function statusLabel(status: ApiPathwayEnrollment["status"], locale: Locale) { const labels: Record<string, string> = { ACTIVE: "نشط", COMPLETED: "مكتمل", WITHDRAWN: "مسحوب" }; return locale === "ar" ? (labels[status] ?? status) : status.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function requirementStateLabel(value: string, locale: Locale) { const labels: Record<string, string> = { SATISFIED: "مستوفى", NEEDS_EVIDENCE: "يحتاج إلى دليل", NOT_SATISFIED: "غير مستوفى" }; return locale === "ar" ? (labels[value] ?? value) : value.toLowerCase().replaceAll("_", " "); }
function localizedExplanation(value: string, locale: Locale) { if (locale !== "ar") return value; if (/satisfied|matches/i.test(value)) return "يطابق الدليل الموثق المرتبط هذا المتطلب."; if (/credential|evidence/i.test(value)) return "يلزم ربط مؤهل موثق يطابق هذا المتطلب."; return "تحقق من الدليل المطلوب وحالته قبل المتابعة."; }
