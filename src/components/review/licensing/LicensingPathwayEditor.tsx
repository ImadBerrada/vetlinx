"use client";

import { ArrowLeft, Check, ExternalLink, FileClock, Landmark, LoaderCircle, RefreshCw, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { licensingCopy } from "@/lib/i18n/licensing";
import type { Locale } from "@/lib/i18n/locales";
import type { ApiAdminLicencePathway, ApiSystemRole } from "@/lib/server/vetlinx-api";
import styles from "./LicensingReview.module.css";

interface EditorBody { account?: { roles: ApiSystemRole[] }; pathway?: ApiAdminLicencePathway; message?: string; status?: string; version?: number }

export function LicensingPathwayEditor({ pathwayId, locale }: { pathwayId: string; locale: Locale }) {
  const copy = licensingCopy[locale].review;
  const router = useRouter();
  const [roles, setRoles] = useState<ApiSystemRole[]>([]);
  const [pathway, setPathway] = useState<ApiAdminLicencePathway | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState("");
  const [publishedMessage, setPublishedMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/session/me", { cache: "no-store" }), fetch(`/api/review/licensing/pathways/${encodeURIComponent(pathwayId)}`, { cache: "no-store" })])
      .then(async ([sessionResponse, pathwayResponse]) => {
        const [sessionBody, pathwayBody] = await Promise.all([readEditorBody(sessionResponse), readEditorBody(pathwayResponse)]);
        if (!active) return;
        if (!sessionResponse.ok || !sessionBody.account) { router.replace("/login"); return; }
        const accountRoles = sessionBody.account.roles ?? [];
        setRoles(accountRoles);
        if (!accountRoles.some((role) => ["LICENSING_CURATOR", "LICENSING_REVIEWER", "PLATFORM_ADMIN"].includes(role))) { setForbidden(true); return; }
        if (!pathwayResponse.ok || !pathwayBody.pathway) { setMessage(pathwayBody.message ?? "The pathway could not be loaded."); return; }
        setPathway(pathwayBody.pathway);
      })
      .catch(() => active && setMessage("VetLinX could not reach the licensing trust service."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [pathwayId, router]);

  const version = pathway?.versions[0];
  const canPublish = roles.some((role) => ["LICENSING_REVIEWER", "PLATFORM_ADMIN"].includes(role));
  const canEdit = Boolean(version && ["DRAFT", "IN_REVIEW"].includes(version.status));

  async function updateVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!version) return;
    setPending("save"); setMessage("");
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/review/licensing/versions/${version.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceTitle: data.get("sourceTitle"), sourceUrl: data.get("sourceUrl"), effectiveFrom: data.get("effectiveFrom") || undefined, effectiveTo: data.get("effectiveTo") || undefined, requirements: version.requirements }) });
    const body = await readEditorBody(response);
    if (!response.ok) setMessage(body.message ?? "Changes could not be saved.");
    else { setMessage("Pathway changes saved."); await reloadPathway(); }
    setPending("");
  }

  async function transition(action: "submit" | "publish" | "supersede") {
    if (!version) return;
    setPending(action); setMessage(""); setPublishedMessage("");
    const response = await fetch(`/api/review/licensing/versions/${version.id}/${action}`, { method: "POST", headers: { "idempotency-key": crypto.randomUUID() } });
    const body = await readEditorBody(response);
    if (!response.ok) setMessage(body.message ?? `The pathway could not be ${action === "submit" ? "submitted" : `${action}d`}.`);
    else {
      const nextStatus = action === "submit" ? "IN_REVIEW" : action === "publish" ? "PUBLISHED" : "SUPERSEDED";
      setPathway((current) => current ? { ...current, versions: current.versions.map((item, index) => index === 0 ? { ...item, status: nextStatus } : item) } : current);
      if (action === "publish") setPublishedMessage(`Published version ${body.version ?? version.version}`);
      else setMessage(action === "submit" ? "Submitted for licensing review." : "Published version superseded.");
    }
    setPending("");
  }

  async function reloadPathway() { const response = await fetch(`/api/review/licensing/pathways/${encodeURIComponent(pathwayId)}`, { cache: "no-store" }); const body = await readEditorBody(response); if (response.ok && body.pathway) setPathway(body.pathway); }

  if (loading) return <AppShell title={copy.pageTitle} scope="review" locale={locale}><State icon="loading" title={copy.loading} /></AppShell>;
  if (forbidden) return <AppShell title={copy.pageTitle} scope="review" locale={locale}><State title={copy.accessRequired} detail={copy.accessBody} /></AppShell>;
  if (!pathway || !version) return <AppShell title={copy.pageTitle} scope="review" locale={locale}><State title={copy.unavailable} detail={message} /></AppShell>;

  const licenceName = locale === "ar" ? pathway.licenceType.nameAr : pathway.licenceType.nameEn;
  const jurisdictionName = locale === "ar" ? pathway.jurisdiction.nameAr : pathway.jurisdiction.nameEn;
  const authorityName = locale === "ar" ? pathway.authority.nameAr : pathway.authority.nameEn;
  return <AppShell title={licenceName} description={`${jurisdictionName} · ${copy.governance}`} scope="review" locale={locale}>
    <div className={styles.editorWorkspace}>
      <Link className={styles.editorBack} href="/review/licensing"><ArrowLeft className={styles.directionalIcon} />{copy.pathwayQueue}</Link>
      <section className={styles.editorDossier}><span><Landmark /></span><div><small>{jurisdictionName} · {authorityName}</small><h2>{licenceName}</h2><p dir="ltr">{pathway.slug}</p></div><div className={styles.editorStatus}><b className={styles[statusClass(version.status)]}>{humanStatus(version.status, locale)}</b><strong>{copy.version} {version.version}</strong><small>{version.reviewedAt ? `${copy.reviewed} ${formatDate(version.reviewedAt, locale)}` : copy.awaitingReview}</small></div></section>
      {message ? <div className={styles.editorNotice} role="status">{message}</div> : null}{publishedMessage ? <div className={styles.publishNotice} role="status"><ShieldCheck />{publishedMessage}</div> : null}
      <div className={styles.editorLayout}><main className={styles.editorMain}>
        <form onSubmit={updateVersion}><header><div><span>{copy.sourceControl}</span><h2>{copy.sourceDates}</h2></div>{canEdit ? <button className={styles.primaryAction} disabled={pending === "save"}>{pending === "save" ? <LoaderCircle className={styles.spinner} /> : <Check />}{copy.saveChanges}</button> : null}</header><div className={styles.editorFields}><label>{copy.sourceTitle}<input name="sourceTitle" defaultValue={version.sourceTitle} disabled={!canEdit} /></label><label>{copy.sourceUrl}<input name="sourceUrl" dir="ltr" type="url" defaultValue={version.sourceUrl} disabled={!canEdit} /></label><label>{copy.effectiveFrom}<input name="effectiveFrom" type="date" defaultValue={dateInput(version.effectiveFrom)} disabled={!canEdit} /></label><label>{copy.effectiveTo}<input name="effectiveTo" type="date" defaultValue={dateInput(version.effectiveTo)} disabled={!canEdit} /></label></div></form>
        <section className={styles.rulesSection}><header><div><span>{copy.orderedRules}</span><h2>{copy.requirementPreview}</h2></div><small>{version.requirements.length} {copy.requirements}</small></header><div>{version.requirements.map((requirement) => <article key={requirement.id}><span>{requirement.position}</span><div><small dir="ltr">{requirement.code} · {requirement.required ? copy.required : copy.optional}</small><h3>{locale === "ar" ? requirement.titleAr : requirement.titleEn}</h3><p>{locale === "ar" ? requirement.descriptionAr : requirement.descriptionEn}</p><code dir="ltr">{requirement.rule?.kind} · {requirement.rule?.credentialTypeCode}{requirement.rule?.countryCode ? ` · ${requirement.rule.countryCode}` : ""}</code></div></article>)}</div></section>
        <section className={styles.versionHistory}><header><div><span>{copy.immutableRecord}</span><h2>{copy.versionHistory}</h2></div></header><ol>{pathway.versions.map((item) => <li key={item.id}><span><FileClock /></span><div><strong>{copy.version} {item.version}</strong><small>{item.sourceTitle}</small></div><b className={styles[statusClass(item.status)]}>{humanStatus(item.status, locale)}</b></li>)}</ol></section>
      </main><aside className={styles.governanceRail}><section><span><ShieldCheck />{copy.actions}</span>{version.status === "DRAFT" ? <><h2>{copy.readyReview}</h2><p>{copy.submitBody}</p><button disabled={pending === "submit"} onClick={() => transition("submit")}><Send />{copy.submit}</button></> : null}{version.status === "IN_REVIEW" ? <><h2>{copy.reviewBeforePublish}</h2><p>{copy.publishBody}</p>{canPublish ? <button className={styles.publishButton} disabled={pending === "publish"} onClick={() => transition("publish")}><ShieldCheck />{copy.publish}</button> : <div className={styles.roleNote}><TriangleAlert />{copy.reviewerOnly}</div>}</> : null}{version.status === "PUBLISHED" ? <><h2>{copy.publishedPathway}</h2><p>{copy.immutableBody}</p>{canPublish ? <button className={styles.supersedeButton} disabled={pending === "supersede"} onClick={() => transition("supersede")}>{copy.supersede}</button> : null}</> : null}</section><section className={styles.sourceSnapshot}><span>{copy.sourceSnapshot}</span><a href={version.sourceUrl} dir="ltr" target="_blank" rel="noreferrer">{version.sourceTitle}<ExternalLink /></a><dl><div><dt>{copy.effective}</dt><dd>{formatDate(version.effectiveFrom, locale)}</dd></div><div><dt>{copy.reviewState}</dt><dd>{humanStatus(version.status, locale)}</dd></div><div><dt>{copy.reviewer}</dt><dd>{version.reviewedByAccountId ? copy.recorded : copy.notAssigned}</dd></div></dl></section></aside></div>
    </div>
  </AppShell>;
}

function State({ title, detail, icon }: { title: string; detail?: string; icon?: "loading" }) { return <div className={styles.trustState}>{icon ? <LoaderCircle className={styles.spinner} /> : <RefreshCw />}<h2>{title}</h2>{detail ? <p>{detail}</p> : null}</div>; }
async function readEditorBody(response: Response): Promise<EditorBody> { return (await response.json().catch(() => ({}))) as EditorBody; }
function statusClass(status?: string) { return status === "PUBLISHED" ? "statusPublished" : status === "IN_REVIEW" ? "statusReview" : status === "DRAFT" ? "statusDraft" : "statusClosed"; }
function humanStatus(status: string | undefined, locale: Locale) { const labels: Record<string, [string, string]> = { DRAFT: ["Draft", "مسودة"], IN_REVIEW: ["In review", "قيد المراجعة"], PUBLISHED: ["Published", "منشور"], SUPERSEDED: ["Superseded", "مستبدل"], WITHDRAWN: ["Withdrawn", "مسحوب"] }; return status ? (labels[status]?.[locale === "ar" ? 1 : 0] ?? status) : "—"; }
function formatDate(value: string | null | undefined, locale: Locale) { if (!value) return locale === "ar" ? "غير محدد" : "Not specified"; return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)); }
function dateInput(value: string | null | undefined) { return value ? value.slice(0, 10) : ""; }
