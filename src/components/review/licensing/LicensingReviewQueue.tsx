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
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
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

export function LicensingReviewQueue() {
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
  const [creating, setCreating] = useState(false);
  const [staleCutoff] = useState(
    () => Date.now() - 365 * 24 * 60 * 60 * 1000,
  );

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
    pathways.forEach((pathway) => values.set(pathway.jurisdiction.code, pathway.jurisdiction.nameEn));
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [pathways]);
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
      setCreateOpen(false);
      router.push(`/review/licensing/pathways/${pathwayResponse.body.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The pathway could not be created.");
    } finally {
      setCreating(false);
    }
  }

  return <>
    <AppShell title="Licensing pathways" description="Curate sourced requirements, review consequential changes, and preserve every published version." scope="review" actions={canCurate ? <button className={styles.primaryAction} onClick={() => setCreateOpen(true)}><Plus />Create pathway</button> : null}>
      {loading ? <Loading /> : forbidden ? <Forbidden /> : <div className={styles.queueWorkspace}>
        <section className={styles.queueIntro}><div><span><ShieldCheck />Licensing governance</span><h2>Source truth before workflow speed.</h2><p>Drafts can move quickly. Publication cannot: reviewers see the exact source, effective dates, ordered rules, and version history before making the pathway visible to professionals.</p></div><dl><div><dt>{pathways.filter((item) => item.versions[0]?.status === "IN_REVIEW").length}</dt><dd>in review</dd></div><div><dt>{pathways.filter((item) => item.versions[0]?.status === "DRAFT").length}</dt><dd>drafts</dd></div><div><dt>{pathways.filter((item) => item.versions[0]?.status === "PUBLISHED").length}</dt><dd>published</dd></div></dl></section>
        {message ? <div className={styles.queueNotice} role="alert"><RefreshCw />{message}</div> : null}
        <section className={styles.queuePanel}>
          <header><div><span>Governed content</span><h2>Pathway queue</h2></div><div className={styles.queueFilters}><label><Search /><input aria-label="Search pathways" placeholder="Search authority or licence" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Jurisdiction filter" value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)}><option value="">All jurisdictions</option>{jurisdictions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select><select aria-label="Status filter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["DRAFT", "IN_REVIEW", "PUBLISHED", "SUPERSEDED", "WITHDRAWN"].map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Source review age filter" value={sourceAge} onChange={(event) => setSourceAge(event.target.value)}><option value="">Any source age</option><option value="current">Reviewed within a year</option><option value="stale">Needs source review</option></select></div></header>
          {filtered.length ? <div className={styles.queueList}>{filtered.map((pathway) => { const version = pathway.versions[0]; return <Link key={pathway.id} href={`/review/licensing/pathways/${pathway.id}`}><span className={styles.queueIcon}><Landmark /></span><div><small>{pathway.jurisdiction.nameEn} · {pathway.authority.nameEn}</small><h3>{pathway.licenceType.nameEn}</h3><p>{version?.sourceTitle ?? "No source title"}</p></div><span className={styles[statusClass(version?.status)]}>{humanStatus(version?.status)}</span><div className={styles.queueMeta}><strong>Version {version?.version ?? "—"}</strong><small>{version?.reviewedAt ? `Reviewed ${formatDate(version.reviewedAt)}` : "Not yet reviewed"}</small></div><ChevronRight /></Link>; })}</div> : <div className={styles.queueEmpty}><BookOpenCheck /><h3>No pathways match these filters</h3><p>Change the filters or create a governed pathway.</p></div>}
        </section>
      </div>}
    </AppShell>
    {createOpen ? <div className={styles.modalBackdrop}><section className={styles.createModal} role="dialog" aria-modal="true" aria-labelledby="create-pathway-title"><header><div><span>Governed draft</span><h2 id="create-pathway-title">Create licensing pathway</h2></div><button onClick={() => setCreateOpen(false)} aria-label="Close create pathway dialog"><X /></button></header><form onSubmit={createPathway}><fieldset><legend>Jurisdiction</legend><div className={styles.formGrid}><label>Country code<input name="countryCode" placeholder="AE" required /></label><label>English name<input name="countryNameEn" required /></label><label>Arabic name<input name="countryNameAr" dir="rtl" required /></label></div></fieldset><fieldset><legend>Authority</legend><div className={styles.formGrid}><label>Authority code<input name="authorityCode" required /></label><label>English name<input name="authorityNameEn" required /></label><label>Arabic name<input name="authorityNameAr" dir="rtl" required /></label><label className={styles.wide}>Official HTTPS website<input name="authorityUrl" type="url" required /></label></div></fieldset><fieldset><legend>Licence identity</legend><div className={styles.formGrid}><label>Licence type code<input name="licenceTypeCode" required /></label><label>Professional title code<input name="professionalTitleCode" required /></label><label>English name<input name="licenceNameEn" required /></label><label>Arabic name<input name="licenceNameAr" dir="rtl" required /></label><label className={styles.wide}>Pathway slug<input name="slug" placeholder="uae-veterinarian" required /></label></div></fieldset><fieldset><legend>Source and first requirement</legend><div className={styles.formGrid}><label className={styles.wide}>Official source URL<input name="sourceUrl" type="url" required /></label><label className={styles.wide}>Source title<input name="sourceTitle" required /></label><label>Effective from<input name="effectiveFrom" type="date" /></label><label>Requirement code<input name="requirementCode" required /></label><label>Credential type code<input name="credentialTypeCode" defaultValue="DEGREE" required /></label><label>Requirement title<input name="requirementTitleEn" required /></label><label>Arabic title<input name="requirementTitleAr" dir="rtl" required /></label><label className={styles.wide}>Requirement description<textarea name="requirementDescriptionEn" required /></label><label className={styles.wide}>Arabic description<textarea name="requirementDescriptionAr" dir="rtl" required /></label></div></fieldset><footer><button type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button className={styles.primaryAction} disabled={creating}>{creating ? <LoaderCircle className={styles.spinner} /> : <Check />}{creating ? "Creating…" : "Create governed draft"}</button></footer></form></section></div> : null}
  </>;
}

async function command(path: string, body: Record<string, unknown>, key: string) { const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) }); return { ok: response.ok, body: await readBody(response) }; }
async function readBody(response: Response): Promise<QueueBody> { return (await response.json().catch(() => ({}))) as QueueBody; }
function Loading() { return <div className={styles.trustState}><LoaderCircle className={styles.spinner} /><h2>Loading licensing governance</h2></div>; }
function Forbidden() { return <div className={styles.trustState}><ShieldCheck /><h2>Licensing access required</h2><p>This workspace is limited to licensing curators and reviewers.</p></div>; }
function statusClass(status?: string) { return status === "PUBLISHED" ? "statusPublished" : status === "IN_REVIEW" ? "statusReview" : status === "DRAFT" ? "statusDraft" : "statusClosed"; }
function humanStatus(status?: string) { return status ? status.toLowerCase().replaceAll("_", " ") : "No version"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)); }
