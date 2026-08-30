"use client";

import { ArrowLeft, Check, ExternalLink, FileClock, Landmark, LoaderCircle, RefreshCw, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import type { ApiAdminLicencePathway, ApiSystemRole } from "@/lib/server/vetlinx-api";
import styles from "./LicensingReview.module.css";

interface EditorBody { account?: { roles: ApiSystemRole[] }; pathway?: ApiAdminLicencePathway; message?: string; status?: string; version?: number }

export function LicensingPathwayEditor({ pathwayId }: { pathwayId: string }) {
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

  if (loading) return <AppShell title="Licensing review" scope="review"><State icon="loading" title="Loading governed pathway" /></AppShell>;
  if (forbidden) return <AppShell title="Licensing review" scope="review"><State title="Licensing access required" /></AppShell>;
  if (!pathway || !version) return <AppShell title="Licensing review" scope="review"><State title="Pathway unavailable" detail={message} /></AppShell>;

  return <AppShell title={pathway.licenceType.nameEn} description={`${pathway.jurisdiction.nameEn} · licensing governance`} scope="review">
    <div className={styles.editorWorkspace}>
      <Link className={styles.editorBack} href="/review/licensing"><ArrowLeft />Pathway queue</Link>
      <section className={styles.editorDossier}><span><Landmark /></span><div><small>{pathway.jurisdiction.nameEn} · {pathway.authority.nameEn}</small><h2>{pathway.licenceType.nameEn}</h2><p>{pathway.slug}</p></div><div className={styles.editorStatus}><b className={styles[statusClass(version.status)]}>{humanStatus(version.status)}</b><strong>Version {version.version}</strong><small>{version.reviewedAt ? `Reviewed ${formatDate(version.reviewedAt)}` : "Awaiting governed review"}</small></div></section>
      {message ? <div className={styles.editorNotice} role="status">{message}</div> : null}{publishedMessage ? <div className={styles.publishNotice} role="status"><ShieldCheck />{publishedMessage}</div> : null}
      <div className={styles.editorLayout}><main className={styles.editorMain}>
        <form onSubmit={updateVersion}><header><div><span>Source control</span><h2>Official source and effective dates</h2></div>{canEdit ? <button className={styles.primaryAction} disabled={pending === "save"}>{pending === "save" ? <LoaderCircle className={styles.spinner} /> : <Check />}Save changes</button> : null}</header><div className={styles.editorFields}><label>Official source title<input name="sourceTitle" defaultValue={version.sourceTitle} disabled={!canEdit} /></label><label>Official HTTPS source URL<input name="sourceUrl" type="url" defaultValue={version.sourceUrl} disabled={!canEdit} /></label><label>Effective from<input name="effectiveFrom" type="date" defaultValue={dateInput(version.effectiveFrom)} disabled={!canEdit} /></label><label>Effective to<input name="effectiveTo" type="date" defaultValue={dateInput(version.effectiveTo)} disabled={!canEdit} /></label></div></form>
        <section className={styles.rulesSection}><header><div><span>Ordered rules</span><h2>Published requirement preview</h2></div><small>{version.requirements.length} requirement{version.requirements.length === 1 ? "" : "s"}</small></header><div>{version.requirements.map((requirement) => <article key={requirement.id}><span>{requirement.position}</span><div><small>{requirement.code} · {requirement.required ? "Required" : "Optional"}</small><h3>{requirement.titleEn}</h3><p>{requirement.descriptionEn}</p><code>{requirement.rule?.kind} · {requirement.rule?.credentialTypeCode}{requirement.rule?.countryCode ? ` · ${requirement.rule.countryCode}` : ""}</code></div></article>)}</div></section>
        <section className={styles.versionHistory}><header><div><span>Immutable record</span><h2>Version history</h2></div></header><ol>{pathway.versions.map((item) => <li key={item.id}><span><FileClock /></span><div><strong>Version {item.version}</strong><small>{item.sourceTitle}</small></div><b className={styles[statusClass(item.status)]}>{humanStatus(item.status)}</b></li>)}</ol></section>
      </main><aside className={styles.governanceRail}><section><span><ShieldCheck />Consequential actions</span>{version.status === "DRAFT" ? <><h2>Ready for independent review?</h2><p>Submission locks the draft into the review workflow. A reviewer still must publish it.</p><button disabled={pending === "submit"} onClick={() => transition("submit")}><Send />Submit for review</button></> : null}{version.status === "IN_REVIEW" ? <><h2>Review the source before publication</h2><p>Publishing makes this exact version and requirement set visible to professionals.</p>{canPublish ? <button className={styles.publishButton} disabled={pending === "publish"} onClick={() => transition("publish")}><ShieldCheck />Publish pathway</button> : <div className={styles.roleNote}><TriangleAlert />Only a licensing reviewer can publish.</div>}</> : null}{version.status === "PUBLISHED" ? <><h2>Published pathway</h2><p>Published content is immutable. Supersede it only when a replacement version is ready.</p>{canPublish ? <button className={styles.supersedeButton} disabled={pending === "supersede"} onClick={() => transition("supersede")}>Supersede version</button> : null}</> : null}</section><section className={styles.sourceSnapshot}><span>Source snapshot</span><a href={version.sourceUrl} target="_blank" rel="noreferrer">{version.sourceTitle}<ExternalLink /></a><dl><div><dt>Effective</dt><dd>{formatDate(version.effectiveFrom)}</dd></div><div><dt>Review state</dt><dd>{humanStatus(version.status)}</dd></div><div><dt>Reviewer</dt><dd>{version.reviewedByAccountId ? "Recorded" : "Not assigned"}</dd></div></dl></section></aside></div>
    </div>
  </AppShell>;
}

function State({ title, detail, icon }: { title: string; detail?: string; icon?: "loading" }) { return <div className={styles.trustState}>{icon ? <LoaderCircle className={styles.spinner} /> : <RefreshCw />}<h2>{title}</h2>{detail ? <p>{detail}</p> : null}</div>; }
async function readEditorBody(response: Response): Promise<EditorBody> { return (await response.json().catch(() => ({}))) as EditorBody; }
function statusClass(status?: string) { return status === "PUBLISHED" ? "statusPublished" : status === "IN_REVIEW" ? "statusReview" : status === "DRAFT" ? "statusDraft" : "statusClosed"; }
function humanStatus(status?: string) { return status ? status.toLowerCase().replaceAll("_", " ") : "Unknown"; }
function formatDate(value: string | null | undefined) { if (!value) return "Not specified"; return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)); }
function dateInput(value: string | null | undefined) { return value ? value.slice(0, 10) : ""; }
