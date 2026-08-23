"use client";

import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CircleDashed,
  FileBadge2,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import type { ApiCredential, ApiJob, ApiPortfolio, ApiSystemRole } from "@/lib/server/vetlinx-api";
import styles from "./dashboard.module.css";

interface MeResponse {
  account?: { email: string; roles: ApiSystemRole[] };
  profile?: { id: string; displayName: string; countryCode: string } | null;
}

export function Dashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<NonNullable<MeResponse["profile"]> | null>(null);
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [portfolio, setPortfolio] = useState<ApiPortfolio | null>(null);
  const [jobs, setJobs] = useState<ApiJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/session/me", { cache: "no-store" }),
      fetch("/api/credentials", { cache: "no-store" }),
      fetch("/api/portfolio", { cache: "no-store" }),
      fetch("/api/jobs", { cache: "no-store" }),
    ]).then(async ([meResponse, credentialsResponse, portfolioResponse, jobsResponse]) => {
      const [me, wallet, portfolioBody, jobsBody] = await Promise.all([
        meResponse.json() as Promise<MeResponse>,
        credentialsResponse.json() as Promise<{ credentials?: ApiCredential[] }>,
        portfolioResponse.json() as Promise<{ portfolio?: ApiPortfolio }>,
        jobsResponse.json() as Promise<{ jobs?: ApiJob[] }>,
      ]);
      if (!active) return;
      if (!meResponse.ok || !me.account) return router.replace("/login");
      if (!me.profile) return router.replace("/onboarding");
      setProfile(me.profile);
      if (credentialsResponse.ok) setCredentials(wallet.credentials ?? []);
      if (portfolioResponse.ok) setPortfolio(portfolioBody.portfolio ?? null);
      if (jobsResponse.ok) setJobs(jobsBody.jobs ?? []);
    }).catch(() => active && setMessage("Your workspace could not be refreshed. Try again."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [router]);

  const verifiedCredentials = credentials.filter((item) => item.status === "VERIFIED");
  const pendingCredentials = credentials.filter((item) => item.status === "SUBMITTED");
  const completion = useMemo(() => {
    if (!portfolio) return 0;
    const fields = [portfolio.displayName, portfolio.countryCode, portfolio.headline, portfolio.summary, portfolio.specialtyCodes.length, portfolio.languageCodes.length];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [portfolio]);
  const nextAction = !credentials.length
    ? { title: "Add your first credential", copy: "Employers can only rely on qualifications supported by evidence.", href: "/credentials", label: "Add credential" }
    : pendingCredentials.length
      ? { title: "Track your evidence review", copy: `${pendingCredentials.length} credential${pendingCredentials.length === 1 ? " is" : "s are"} waiting for a verification decision.`, href: "/credentials", label: "View review status" }
      : completion < 100
        ? { title: "Complete your professional story", copy: "Add your headline, summary, specialties, and languages so employers understand your fit.", href: "/portfolio", label: "Complete portfolio" }
        : { title: "Find your next verified role", copy: "Your record is ready to use in applications to verified organizations.", href: "/jobs", label: "Explore roles" };

  if (loading) return <main className={styles.loading}><LoaderCircle />Preparing your trusted record…</main>;
  if (!profile) return null;

  return (
    <AppShell title={`Good morning, ${profile.displayName}`} description="Your verified career record and the next action that strengthens it.">
      {message ? <div className={styles.notice} role="status">{message}</div> : null}
      <section className={styles.trustRail} aria-label="Trust record">
        <TrustStep icon={UserRound} label="Profile completion" value={`${completion}% complete`} href="/portfolio" complete={completion === 100} />
        <TrustStep icon={ShieldCheck} label="Verified credentials" value={`${verifiedCredentials.length} verified`} href="/credentials" complete={verifiedCredentials.length > 0} />
        <TrustStep icon={BriefcaseBusiness} label="Confirmed employment" value={`${portfolio?.trust.verifiedEmploymentCount ?? 0} confirmed`} href="/portfolio" complete={(portfolio?.trust.verifiedEmploymentCount ?? 0) > 0} />
        <TrustStep icon={FileBadge2} label="Public portfolio" value={portfolio?.visibility === "PRIVATE" ? "Private" : humanize(portfolio?.visibility ?? "PRIVATE")} href="/portfolio" complete={portfolio?.visibility !== "PRIVATE"} />
      </section>

      <section className={styles.nextAction}>
        <span><ShieldCheck /></span>
        <div><h2>{nextAction.title}</h2><p>{nextAction.copy}</p></div>
        <Link href={nextAction.href}>{nextAction.label}<ArrowRight /></Link>
      </section>

      <div className={styles.dashboardGrid}>
        <div className={styles.leftColumn}>
          <section className={styles.panel}>
            <header><h2>Recent credentials</h2><Link href="/credentials">View all<ArrowRight /></Link></header>
            {credentials.length ? <div className={styles.table} role="table" aria-label="Recent credentials">
              <div className={styles.tableHead} role="row"><span>Credential</span><span>Issued by</span><span>Status</span><span>Expiry</span></div>
              {credentials.slice(0, 5).map((credential) => <Link href="/credentials" key={credential.id} className={styles.tableRow} role="row"><span><strong>{credential.title}</strong><small>{credential.typeCode.replaceAll("_", " ")}</small></span><span>{credential.issuingOrganization}</span><Status value={credential.status} /><span>{credential.expiryDate ? new Date(credential.expiryDate).toLocaleDateString() : "—"}</span></Link>)}
            </div> : <Empty icon={WalletCards} title="No credentials yet" copy="Add a degree, licence, or certification to begin your verified record." action="Add credential" href="/credentials" />}
          </section>

          <section className={styles.panel}>
            <header><h2>Recommended roles</h2><Link href="/jobs">View all jobs<ArrowRight /></Link></header>
            {jobs.length ? <div className={styles.jobs}>{jobs.slice(0, 3).map((job) => <Link href={`/jobs?job=${job.id}`} key={job.id}><span><BriefcaseBusiness /></span><div><strong>{job.title}</strong><p>{job.organization?.publicName ?? job.organization?.legalName ?? "Verified organization"}</p></div><small><MapPin />{[job.city, job.countryCode].filter(Boolean).join(", ")}</small><ArrowRight /></Link>)}</div> : <Empty icon={BriefcaseBusiness} title="No verified roles available" copy="Published roles from verified organizations will appear here." action="Open jobs" href="/jobs" />}
          </section>
        </div>

        <section className={`${styles.panel} ${styles.activity}`}>
          <header><h2>Career activity</h2><span>Evidence-backed</span></header>
          <ol>
            {verifiedCredentials.slice(0, 4).map((credential) => <Activity key={credential.id} complete title={`${credential.title} verified`} detail={credential.issuingOrganization} date={credential.issueDate} />)}
            {portfolio?.employments.slice(0, 3).map((employment) => <Activity key={employment.id} complete title={`${employment.title} confirmed`} detail={employment.organization.publicName ?? employment.organization.legalName} date={employment.startDate} />)}
            {!verifiedCredentials.length && !portfolio?.employments.length ? <li className={styles.activityEmpty}><CircleDashed /><div><strong>Your trust timeline starts here</strong><p>Verified credentials and confirmed employment will appear automatically.</p></div></li> : null}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}

function TrustStep({ icon: Icon, label, value, href, complete }: { icon: typeof UserRound; label: string; value: string; href: string; complete: boolean }) {
  return <Link href={href} className={styles.trustStep}><span><Icon /></span><div><strong>{label}</strong><small>{value}</small></div><i className={complete ? styles.complete : ""}>{complete ? <Check /> : <CircleDashed />}</i></Link>;
}
function Status({ value }: { value: string }) { return <span className={`${styles.status} ${styles[`status${value}`] ?? ""}`}>{humanize(value)}</span>; }
function Activity({ complete, title, detail, date }: { complete: boolean; title: string; detail: string; date: string }) { return <li><i className={complete ? styles.complete : ""}>{complete ? <Check /> : <CircleDashed />}</i><div><strong>{title}</strong><p>{detail}</p></div><time>{new Date(date).toLocaleDateString()}</time></li>; }
function Empty({ icon: Icon, title, copy, action, href }: { icon: typeof WalletCards; title: string; copy: string; action: string; href: string }) { return <div className={styles.empty}><Icon /><div><h3>{title}</h3><p>{copy}</p></div><Link href={href}>{action}<ArrowRight /></Link></div>; }
function humanize(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
