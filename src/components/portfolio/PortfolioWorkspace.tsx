"use client";

import {
  BriefcaseBusiness,
  Check,
  Clipboard,
  Download,
  Eye,
  FileCheck2,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import type { ApiPortfolio, ApiProfessionalProfile } from "@/lib/server/vetlinx-api";
import styles from "./Portfolio.module.css";

export function PortfolioWorkspace() {
  const router = useRouter();
  const [portfolio, setPortfolio] = useState<ApiPortfolio | null>(null);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/portfolio", { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({})) as { portfolio?: ApiPortfolio; message?: string };
      if (response.status === 401) return router.replace("/login");
      if (!response.ok || !body.portfolio) throw new Error(body.message ?? "Portfolio could not be loaded.");
      if (active) setPortfolio(body.portfolio);
    }).catch((error: unknown) => active && setMessage(error instanceof Error ? error.message : "Portfolio could not be loaded."));
    return () => { active = false; };
  }, [router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!portfolio) return;
    setPending(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const payload = {
      displayName: data.get("displayName"), countryCode: data.get("countryCode"), headline: data.get("headline"), summary: data.get("summary"),
      visibility: data.get("visibility"), contactVisibility: data.get("contactVisibility"), specialtyCodes: codes(data.get("specialtyCodes")),
      speciesCodes: codes(data.get("speciesCodes")), languageCodes: codes(data.get("languageCodes")),
    };
    const response = await fetch("/api/professional-profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({})) as { profile?: ApiProfessionalProfile; message?: string };
    if (!response.ok || !body.profile) setMessage(body.message ?? "Portfolio settings could not be saved.");
    else { setPortfolio({ ...portfolio, ...body.profile }); setEditing(false); setMessage("Portfolio and privacy settings saved."); }
    setPending(false);
  }

  if (!portfolio) return <main className={styles.loading}><LoaderCircle />{message || "Building your verified portfolio…"}</main>;
  const publicUrl = portfolio.publicSlug && typeof window !== "undefined" ? `${window.location.origin}/p/${portfolio.publicSlug}` : null;
  const profileFields = [portfolio.headline, portfolio.summary, portfolio.specialtyCodes.length, portfolio.speciesCodes.length, portfolio.languageCodes.length];
  const completion = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100);

  async function copyLink() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      <AppShell title="Portfolio & ATS CV" description="Control the career record employers can see and download." actions={<><a className={styles.secondaryAction} href="/api/portfolio/cv"><Download />Download CV</a><button className={styles.primaryAction} onClick={() => setEditing(true)}><Pencil />Edit portfolio</button></>}>
        {message ? <div className={styles.notice}>{message}<button onClick={() => setMessage("")}><X /></button></div> : null}
        <section className={styles.recordRail}>
          <RecordMetric label="Profile completion" value={`${completion}%`} complete={completion === 100} />
          <RecordMetric label="Verified credentials" value={`${portfolio.trust.verifiedCredentialCount}`} complete={portfolio.trust.verifiedCredentialCount > 0} />
          <RecordMetric label="Confirmed roles" value={`${portfolio.trust.verifiedEmploymentCount}`} complete={portfolio.trust.verifiedEmploymentCount > 0} />
          <RecordMetric label="Portfolio access" value={humanize(portfolio.visibility)} complete={portfolio.visibility !== "PRIVATE"} />
        </section>

        <div className={styles.portfolioGrid}>
          <section className={styles.profileRecord}>
            <header>
              <span className={styles.avatar}>{initials(portfolio.displayName)}</span>
              <div><h2>{portfolio.displayName}</h2><p>{portfolio.headline || "Add a professional headline"}</p><small>{portfolio.countryCode}</small></div>
              <span className={styles.verified}><ShieldCheck />Evidence-backed record</span>
            </header>
            {portfolio.summary ? <p className={styles.summaryCopy}>{portfolio.summary}</p> : <EmptyCopy>Add a concise summary so an employer can understand your expertise and preferred work.</EmptyCopy>}
            <TagSection title="Specialties" values={portfolio.specialtyCodes} />
            <TagSection title="Species experience" values={portfolio.speciesCodes} />
            <TagSection title="Languages" values={portfolio.languageCodes} />
          </section>

          <aside className={styles.privacyPanel}>
            <header><div><h2>Privacy & sharing</h2><p>You decide who can see this record.</p></div>{portfolio.visibility === "PRIVATE" ? <LockKeyhole /> : <Globe2 />}</header>
            <dl><div><dt>Portfolio</dt><dd>{humanize(portfolio.visibility)}</dd></div><div><dt>Contact details</dt><dd>{humanize(portfolio.contactVisibility)}</dd></div></dl>
            {publicUrl && portfolio.visibility !== "PRIVATE" ? <div className={styles.publicLink}><input readOnly value={publicUrl} /><button onClick={copyLink} aria-label="Copy public link">{copied ? <Check /> : <Clipboard />}</button><Link href={`/p/${portfolio.publicSlug}`} target="_blank" aria-label="Open public portfolio"><Eye /></Link></div> : <div className={styles.privateNote}><LockKeyhole /><p><strong>Your portfolio is private.</strong> Change visibility when your record is ready to share.</p></div>}
            <button className={styles.panelAction} onClick={() => setEditing(true)}>Change privacy settings</button>
          </aside>

          <EvidenceSection title="Verified credentials" icon={FileCheck2} empty="No verified credentials yet. Complete an evidence review before publishing.">
            {portfolio.credentials.map((credential) => <article key={credential.id}><FileCheck2 /><div><strong>{credential.title}</strong><p>{credential.issuingOrganization} · {credential.countryCode}</p></div><span>Verified</span></article>)}
          </EvidenceSection>
          <EvidenceSection title="Confirmed employment" icon={BriefcaseBusiness} empty="Employment appears automatically after an accepted offer is confirmed by the organization.">
            {portfolio.employments.map((employment) => <article key={employment.id}><BriefcaseBusiness /><div><strong>{employment.title}</strong><p>{employment.organization.publicName ?? employment.organization.legalName} · {new Date(employment.startDate).toLocaleDateString()}–{employment.endDate ? new Date(employment.endDate).toLocaleDateString() : "Present"}</p></div><span>{humanize(employment.status)}</span></article>)}
          </EvidenceSection>
        </div>
      </AppShell>

      {editing ? <div className={styles.modalBackdrop}><section className={styles.modal} role="dialog" aria-modal="true" aria-label="Edit portfolio and privacy"><header><h2>Edit portfolio and privacy</h2><button onClick={() => setEditing(false)} aria-label="Close"><X /></button></header><form onSubmit={save}><div><label>Professional name<input name="displayName" defaultValue={portfolio.displayName} required /></label><label>Country code<input name="countryCode" defaultValue={portfolio.countryCode} maxLength={2} required /></label></div><label>Headline<input name="headline" defaultValue={portfolio.headline ?? ""} maxLength={220} /></label><label>Professional summary<textarea name="summary" defaultValue={portfolio.summary ?? ""} rows={6} maxLength={4000} /></label><label>Specialties <small>Comma separated</small><input name="specialtyCodes" defaultValue={portfolio.specialtyCodes.join(", ")} /></label><label>Species experience <small>Comma separated</small><input name="speciesCodes" defaultValue={portfolio.speciesCodes.join(", ")} /></label><label>Languages <small>Use codes such as EN, AR</small><input name="languageCodes" defaultValue={portfolio.languageCodes.join(", ")} /></label><div><label>Portfolio visibility<select name="visibility" defaultValue={portfolio.visibility}><option value="PRIVATE">Private</option><option value="UNLISTED">Unlisted link</option><option value="PUBLIC">Public</option></select></label><label>Contact visibility<select name="contactVisibility" defaultValue={portfolio.contactVisibility}><option value="PRIVATE">Private</option><option value="VERIFIED_EMPLOYERS">Verified employers</option><option value="PUBLIC">Public</option></select></label></div><footer><button type="button" onClick={() => setEditing(false)}>Cancel</button><button disabled={pending}>{pending ? <LoaderCircle /> : <Check />}Save changes</button></footer></form></section></div> : null}
    </>
  );
}

function RecordMetric({ label, value, complete }: { label: string; value: string; complete: boolean }) { return <div><i className={complete ? styles.complete : ""}>{complete ? <Check /> : null}</i><span><small>{label}</small><strong>{value}</strong></span></div>; }
function EvidenceSection({ title, icon: Icon, empty, children }: { title: string; icon: typeof FileCheck2; empty: string; children: React.ReactNode[] }) { return <section className={styles.evidenceSection}><header><h2>{title}</h2><Icon /></header>{children.length ? children : <EmptyCopy>{empty}</EmptyCopy>}</section>; }
function EmptyCopy({ children }: { children: React.ReactNode }) { return <div className={styles.emptyCopy}>{children}</div>; }
function TagSection({ title, values }: { title: string; values: string[] }) { return values.length ? <div className={styles.tags}><small>{title}</small><div>{values.map((value) => <span key={value}>{humanize(value)}</span>)}</div></div> : null; }
function codes(value: FormDataEntryValue | null) { return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean); }
function humanize(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VL"; }
