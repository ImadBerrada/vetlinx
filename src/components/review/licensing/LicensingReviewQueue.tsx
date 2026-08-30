"use client";

import {
  BookOpenCheck,
  Check,
  ChevronRight,
  Landmark,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { licensingCopy } from "@/lib/i18n/licensing";
import type { Locale } from "@/lib/i18n/locales";
import type { ApiAdminLicencePathway, ApiSystemRole } from "@/lib/server/vetlinx-api";
import styles from "./LicensingReview.module.css";

interface QueueBody {
  account?: { email: string; roles: ApiSystemRole[] };
  pathways?: ApiAdminLicencePathway[];
  message?: string;
  id?: string;
  versionId?: string;
}

const allowedRoles: ApiSystemRole[] = ["LICENSING_CURATOR", "LICENSING_REVIEWER", "PLATFORM_ADMIN"];

export function LicensingReviewQueue({ locale }: { locale: Locale }) {
  const copy = licensingCopy[locale].review;
  const router = useRouter();
  const [roles, setRoles] = useState<ApiSystemRole[]>([]);
  const [pathways, setPathways] = useState<ApiAdminLicencePathway[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [sourceAge, setSourceAge] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const dialogWasOpen = useRef(false);
  const [creating, setCreating] = useState(false);
  const [staleCutoff] = useState(
    () => Date.now() - 365 * 24 * 60 * 60 * 1000,
  );

  useEffect(() => {
    if (createOpen) {
      dialogWasOpen.current = true;
      const frame = requestAnimationFrame(() => modalRef.current?.querySelector<HTMLElement>("input, button")?.focus());
      return () => cancelAnimationFrame(frame);
    }
    if (dialogWasOpen.current) {
      dialogWasOpen.current = false;
      createButtonRef.current?.focus();
    }
  }, [createOpen]);

  function closeCreateDialog() {
    setCreateOpen(false);
  }

  function trapModalFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { event.preventDefault(); closeCreateDialog(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...(modalRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]") ?? [])];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/session/me", { cache: "no-store" }),
      fetch("/api/review/licensing/pathways", { cache: "no-store" }),
    ])
      .then(async ([sessionResponse, queueResponse]) => {
        const [sessionBody, queueBody] = await Promise.all([readBody(sessionResponse), readBody(queueResponse)]);
        if (!active) return;
        if (!sessionResponse.ok || !sessionBody.account) {
          router.replace("/login");
          return;
        }
        const accountRoles = sessionBody.account.roles ?? [];
        setRoles(accountRoles);
        if (!accountRoles.some((role) => allowedRoles.includes(role))) {
          setForbidden(true);
          return;
        }
        if (!queueResponse.ok) {
          setMessage(queueBody.message ?? "The licensing review queue could not be loaded.");
          return;
        }
        setPathways(queueBody.pathways ?? []);
      })
      .catch(() => active && setMessage("VetLinX could not reach the licensing trust service."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [router]);

  const canCurate = roles.some((role) => ["LICENSING_CURATOR", "LICENSING_REVIEWER", "PLATFORM_ADMIN"].includes(role));
  const jurisdictions = useMemo(() => {
    const values = new Map<string, string>();
    pathways.forEach((pathway) => values.set(pathway.jurisdiction.code, locale === "ar" ? pathway.jurisdiction.nameAr : pathway.jurisdiction.nameEn));
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [locale, pathways]);
  const filtered = pathways.filter((pathway) => {
    const version = pathway.versions[0];
    const haystack = `${pathway.licenceType.nameEn} ${pathway.authority.nameEn} ${pathway.slug}`.toLowerCase();
    const reviewedAt = version?.reviewedAt ? new Date(version.reviewedAt).getTime() : 0;
    return (!status || version?.status === status)
      && (!jurisdiction || pathway.jurisdiction.code === jurisdiction)
      && (!sourceAge || (sourceAge === "stale" ? !reviewedAt || reviewedAt < staleCutoff : reviewedAt >= staleCutoff))
      && (!search || haystack.includes(search.toLowerCase()));
  });

  async function createPathway(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const key = () => crypto.randomUUID();
    try {
      const jurisdictionResponse = await command("/api/review/licensing/jurisdictions", {
        code: form.get("countryCode"), nameEn: form.get("countryNameEn"), nameAr: form.get("countryNameAr"),
      }, key());
      if (!jurisdictionResponse.ok || !jurisdictionResponse.body.id) throw new Error(jurisdictionResponse.body.message ?? "Jurisdiction could not be created.");
      const authorityResponse = await command("/api/review/licensing/authorities", {
        jurisdictionId: jurisdictionResponse.body.id, code: form.get("authorityCode"), nameEn: form.get("authorityNameEn"), nameAr: form.get("authorityNameAr"), websiteUrl: form.get("authorityUrl"),
      }, key());
      if (!authorityResponse.ok || !authorityResponse.body.id) throw new Error(authorityResponse.body.message ?? "Authority could not be created.");
      const typeResponse = await command("/api/review/licensing/licence-types", {
        code: form.get("licenceTypeCode"), nameEn: form.get("licenceNameEn"), nameAr: form.get("licenceNameAr"), professionalTitleCode: form.get("professionalTitleCode"),
      }, key());
      if (!typeResponse.ok || !typeResponse.body.id) throw new Error(typeResponse.body.message ?? "Licence type could not be created.");
      const pathwayResponse = await command("/api/review/licensing/pathways", {
        jurisdictionId: jurisdictionResponse.body.id,
        authorityId: authorityResponse.body.id,
        licenceTypeId: typeResponse.body.id,
        slug: form.get("slug"),
        sourceUrl: form.get("sourceUrl"),
        sourceTitle: form.get("sourceTitle"),
        effectiveFrom: form.get("effectiveFrom") || undefined,
        requirements: [{
          code: form.get("requirementCode"), titleEn: form.get("requirementTitleEn"), titleAr: form.get("requirementTitleAr"), descriptionEn: form.get("requirementDescriptionEn"), descriptionAr: form.get("requirementDescriptionAr"), position: 1, required: true,
          rule: { kind: "VERIFIED_CREDENTIAL", credentialTypeCode: form.get("credentialTypeCode") },
        }],
      }, key());
      if (!pathwayResponse.ok || !pathwayResponse.body.id) throw new Error(pathwayResponse.body.message ?? "Pathway could not be created.");
      closeCreateDialog();
      router.push(`/review/licensing/pathways/${pathwayResponse.body.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The pathway could not be created.");
    } finally {
      setCreating(false);
    }
  }

  return <>
    <AppShell title={copy.pageTitle} description={copy.pageDescription} scope="review" locale={locale} actions={canCurate ? <button className={styles.primaryAction} onClick={(event) => { createButtonRef.current = event.currentTarget; setCreateOpen(true); }}><Plus />{copy.create}</button> : null}>
      {loading ? <Loading copy={copy} /> : forbidden ? <Forbidden copy={copy} /> : <div className={styles.queueWorkspace}>
        <section className={styles.queueIntro}><div><span><ShieldCheck />{copy.governance}</span><h2>{copy.thesis}</h2><p>{copy.thesisBody}</p></div><dl><div><dt>{pathways.filter((item) => item.versions[0]?.status === "IN_REVIEW").length}</dt><dd>{copy.inReview}</dd></div><div><dt>{pathways.filter((item) => item.versions[0]?.status === "DRAFT").length}</dt><dd>{copy.drafts}</dd></div><div><dt>{pathways.filter((item) => item.versions[0]?.status === "PUBLISHED").length}</dt><dd>{copy.published}</dd></div></dl></section>
        {message ? <div className={styles.queueNotice} role="alert"><RefreshCw />{message}</div> : null}
        <section className={styles.queuePanel}>
          <header><div><span>{copy.governedContent}</span><h2>{copy.queue}</h2></div><div className={styles.queueFilters}><label><Search /><input aria-label={copy.search} placeholder={copy.searchPlaceholder} value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label={copy.allJurisdictions} value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)}><option value="">{copy.allJurisdictions}</option>{jurisdictions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select><select aria-label={copy.allStatuses} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{copy.allStatuses}</option>{["DRAFT", "IN_REVIEW", "PUBLISHED", "SUPERSEDED", "WITHDRAWN"].map((value) => <option key={value} value={value}>{humanStatus(value, locale)}</option>)}</select><select aria-label={copy.sourceAge} value={sourceAge} onChange={(event) => setSourceAge(event.target.value)}><option value="">{copy.sourceAge}</option><option value="current">{copy.currentSources}</option><option value="stale">{copy.staleSources}</option></select></div></header>
          {filtered.length ? <div className={styles.queueList}>{filtered.map((pathway) => { const version = pathway.versions[0]; return <Link key={pathway.id} href={`/review/licensing/pathways/${pathway.id}`}><span className={styles.queueIcon}><Landmark /></span><div><small>{locale === "ar" ? pathway.jurisdiction.nameAr : pathway.jurisdiction.nameEn} · {locale === "ar" ? pathway.authority.nameAr : pathway.authority.nameEn}</small><h3>{locale === "ar" ? pathway.licenceType.nameAr : pathway.licenceType.nameEn}</h3><p>{version?.sourceTitle ?? "—"}</p></div><span className={styles[statusClass(version?.status)]}>{humanStatus(version?.status, locale)}</span><div className={styles.queueMeta}><strong>{copy.version} {version?.version ?? "—"}</strong><small>{version?.reviewedAt ? `${copy.reviewed} ${formatDate(version.reviewedAt, locale)}` : copy.notReviewed}</small></div><ChevronRight className={styles.directionalIcon} /></Link>; })}</div> : <div className={styles.queueEmpty}><BookOpenCheck /><h3>{copy.noMatches}</h3><p>{copy.noMatchesBody}</p></div>}
        </section>
      </div>}
    </AppShell>
    {createOpen ? <div className={styles.modalBackdrop}><section ref={modalRef} onKeyDown={trapModalFocus} className={styles.createModal} role="dialog" aria-modal="true" aria-labelledby="create-pathway-title"><header><div><span>{copy.governedDraft}</span><h2 id="create-pathway-title">{copy.createDialog}</h2></div><button type="button" onClick={closeCreateDialog} aria-label={copy.closeDialog}><X /></button></header><form onSubmit={createPathway}><fieldset><legend>Jurisdiction / الاختصاص</legend><div className={styles.formGrid}><label>Country code<input name="countryCode" dir="ltr" placeholder="AE" required /></label><label>English name<input name="countryNameEn" dir="ltr" required /></label><label>Arabic name<input name="countryNameAr" dir="rtl" required /></label></div></fieldset><fieldset><legend>Authority / الجهة</legend><div className={styles.formGrid}><label>Authority code<input name="authorityCode" dir="ltr" required /></label><label>English name<input name="authorityNameEn" dir="ltr" required /></label><label>Arabic name<input name="authorityNameAr" dir="rtl" required /></label><label className={styles.wide}>Official HTTPS website<input name="authorityUrl" dir="ltr" type="url" required /></label></div></fieldset><fieldset><legend>Licence identity / هوية الترخيص</legend><div className={styles.formGrid}><label>Licence type code<input name="licenceTypeCode" dir="ltr" required /></label><label>Professional title code<input name="professionalTitleCode" dir="ltr" required /></label><label>English name<input name="licenceNameEn" dir="ltr" required /></label><label>Arabic name<input name="licenceNameAr" dir="rtl" required /></label><label className={styles.wide}>Pathway slug<input name="slug" dir="ltr" placeholder="uae-veterinarian" required /></label></div></fieldset><fieldset><legend>Source and first requirement / المصدر والمتطلب الأول</legend><div className={styles.formGrid}><label className={styles.wide}>Official source URL<input name="sourceUrl" dir="ltr" type="url" required /></label><label className={styles.wide}>Source title<input name="sourceTitle" required /></label><label>Effective from<input name="effectiveFrom" type="date" /></label><label>Requirement code<input name="requirementCode" dir="ltr" required /></label><label>Credential type code<input name="credentialTypeCode" dir="ltr" defaultValue="DEGREE" required /></label><label>Requirement title<input name="requirementTitleEn" dir="ltr" required /></label><label>Arabic title<input name="requirementTitleAr" dir="rtl" required /></label><label className={styles.wide}>Requirement description<textarea name="requirementDescriptionEn" dir="ltr" required /></label><label className={styles.wide}>Arabic description<textarea name="requirementDescriptionAr" dir="rtl" required /></label></div></fieldset><footer><button type="button" onClick={closeCreateDialog}>{copy.cancel}</button><button className={styles.primaryAction} disabled={creating}>{creating ? <LoaderCircle className={styles.spinner} /> : <Check />}{creating ? copy.creating : copy.createDraft}</button></footer></form></section></div> : null}
  </>;
}

async function command(path: string, body: Record<string, unknown>, key: string) { const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) }); return { ok: response.ok, body: await readBody(response) }; }
async function readBody(response: Response): Promise<QueueBody> { return (await response.json().catch(() => ({}))) as QueueBody; }
function Loading({ copy }: { copy: (typeof licensingCopy)[Locale]["review"] }) { return <div className={styles.trustState}><LoaderCircle className={styles.spinner} /><h2>{copy.loading}</h2></div>; }
function Forbidden({ copy }: { copy: (typeof licensingCopy)[Locale]["review"] }) { return <div className={styles.trustState}><ShieldCheck /><h2>{copy.accessRequired}</h2><p>{copy.accessBody}</p></div>; }
function statusClass(status?: string) { return status === "PUBLISHED" ? "statusPublished" : status === "IN_REVIEW" ? "statusReview" : status === "DRAFT" ? "statusDraft" : "statusClosed"; }
function humanStatus(status: string | undefined, locale: Locale) { const labels: Record<string, [string, string]> = { DRAFT: ["Draft", "مسودة"], IN_REVIEW: ["In review", "قيد المراجعة"], PUBLISHED: ["Published", "منشور"], SUPERSEDED: ["Superseded", "مستبدل"], WITHDRAWN: ["Withdrawn", "مسحوب"] }; return status ? (labels[status]?.[locale === "ar" ? 1 : 0] ?? status) : "—"; }
function formatDate(value: string, locale: Locale) { return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)); }
