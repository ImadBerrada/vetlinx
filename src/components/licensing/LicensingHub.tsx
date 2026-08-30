"use client";

import {
  ArrowRight,
  BellRing,
  BookOpenCheck,
  Check,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  FileCheck2,
  Landmark,
  LoaderCircle,
  MapPinned,
  RefreshCw,
  Route,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import type {
  ApiLicencePathwaySummary,
  ApiLicensingEligibility,
  ApiLicensingJurisdiction,
  ApiLicensingReminderPreference,
  ApiPathwayEnrollment,
} from "@/lib/server/vetlinx-api";
import styles from "./LicensingHub.module.css";

interface SessionResponse {
  account?: { email: string };
  profile?: { id: string; displayName: string; countryCode: string } | null;
}

interface HubResponse<T> {
  message?: string;
  errors?: Record<string, string[]>;
  jurisdictions?: ApiLicensingJurisdiction[];
  pathways?: ApiLicencePathwaySummary[];
  enrollments?: ApiPathwayEnrollment[];
  preference?: ApiLicensingReminderPreference;
  eligibility?: ApiLicensingEligibility;
  value?: T;
}

export function LicensingHub() {
  const router = useRouter();
  const [jurisdictions, setJurisdictions] = useState<ApiLicensingJurisdiction[]>([]);
  const [pathways, setPathways] = useState<ApiLicencePathwaySummary[]>([]);
  const [enrollments, setEnrollments] = useState<ApiPathwayEnrollment[]>([]);
  const [eligibility, setEligibility] = useState<Record<string, ApiLicensingEligibility>>({});
  const [preference, setPreference] = useState<ApiLicensingReminderPreference | null>(null);
  const [jurisdictionCode, setJurisdictionCode] = useState("");
  const [licenceTypeCode, setLicenceTypeCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingReminder, setSavingReminder] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch("/api/session/me", { cache: "no-store" }),
      fetch("/api/licensing/jurisdictions", { cache: "no-store" }),
      fetch("/api/licensing/pathways", { cache: "no-store" }),
      fetch("/api/licensing/enrollments", { cache: "no-store" }),
      fetch("/api/licensing/reminder-preferences", { cache: "no-store" }),
    ])
      .then(async ([sessionResponse, jurisdictionResponse, pathwayResponse, enrollmentResponse, reminderResponse]) => {
        const [session, jurisdictionBody, pathwayBody, enrollmentBody, reminderBody] = await Promise.all([
          readBody<SessionResponse>(sessionResponse),
          readBody<HubResponse<ApiLicensingJurisdiction[]>>(jurisdictionResponse),
          readBody<HubResponse<ApiLicencePathwaySummary[]>>(pathwayResponse),
          readBody<HubResponse<ApiPathwayEnrollment[]>>(enrollmentResponse),
          readBody<HubResponse<ApiLicensingReminderPreference>>(reminderResponse),
        ]);
        if (!active) return;
        if (!sessionResponse.ok || !session.account) {
          router.replace("/login");
          return;
        }
        if (!session.profile) {
          router.replace("/onboarding");
          return;
        }
        const failed = [jurisdictionResponse, pathwayResponse, enrollmentResponse, reminderResponse]
          .find((response) => !response.ok);
        if (failed) {
          const body = failed === jurisdictionResponse
            ? jurisdictionBody
            : failed === pathwayResponse
              ? pathwayBody
              : failed === enrollmentResponse
                ? enrollmentBody
                : reminderBody;
          setLoadError(body.message ?? "Your licensing workspace could not be loaded.");
          return;
        }
        const loadedPathways = pathwayBody.pathways ?? [];
        setJurisdictions(jurisdictionBody.jurisdictions ?? []);
        setPathways(loadedPathways);
        setEnrollments(enrollmentBody.enrollments ?? []);
        setPreference(reminderBody.preference ?? null);
        setJurisdictionCode((current) => current || session.profile?.countryCode || "");

        const previews = await Promise.all(
          loadedPathways.map(async (pathway) => {
            const response = await fetch(
              `/api/licensing/pathways/${encodeURIComponent(pathway.id)}/eligibility`,
              { cache: "no-store" },
            ).catch(() => null);
            if (!response?.ok) return null;
            const body = await readBody<HubResponse<ApiLicensingEligibility>>(response);
            return body.eligibility ? ([pathway.id, body.eligibility] as const) : null;
          }),
        );
        if (active) setEligibility(Object.fromEntries(previews.filter(Boolean) as Array<readonly [string, ApiLicensingEligibility]>));
      })
      .catch(() => active && setLoadError("VetLinX could not reach the licensing service. Try again."))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [reloadKey, router]);

  const licenceTypes = useMemo(() => {
    const entries = new Map<string, string>();
    pathways.forEach((pathway) => entries.set(pathway.licenceType.code, pathway.licenceType.nameEn));
    return [...entries.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [pathways]);

  const filteredPathways = pathways.filter(
    (pathway) =>
      (!jurisdictionCode || pathway.jurisdiction.code === jurisdictionCode) &&
      (!licenceTypeCode || pathway.licenceType.code === licenceTypeCode),
  );
  const activeEnrollments = enrollments.filter((item) =>
    ["ACTIVE", "SUBMITTED_EXTERNALLY"].includes(item.status),
  );

  async function saveReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preference) return;
    setSavingReminder(true);
    setReminderMessage("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/licensing/reminder-preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        timeZone: data.get("timeZone"),
        renewalEnabled: data.get("renewalEnabled") === "on",
        leadDays: Number(data.get("leadDays")),
      }),
    }).catch(() => null);
    const body = response
      ? await readBody<HubResponse<ApiLicensingReminderPreference>>(response)
      : {};
    if (!response?.ok || !body.preference) {
      setReminderMessage(body.message ?? "Reminder settings could not be saved.");
      setSavingReminder(false);
      return;
    }
    setPreference(body.preference);
    setReminderMessage("Renewal reminders saved.");
    setSavingReminder(false);
  }

  function retryLoad() {
    setLoading(true);
    setLoadError("");
    setReloadKey((value) => value + 1);
  }

  return (
    <AppShell
      title="Licensing pathways"
      description="Use verified evidence to understand, prepare, and track your route to professional licensure."
    >
      <div className={styles.hub}>
        <section className={styles.routeMap} aria-labelledby="licensing-route-title">
          <div className={styles.routeIntro}>
            <span><Route />Your licensing route</span>
            <h2 id="licensing-route-title">One evidence trail, from requirements to renewal.</h2>
            <p>VetLinX guides your preparation and records what you report. Licensing decisions remain with the named authority.</p>
          </div>
          <ol>
            <li><span><MapPinned /></span><div><strong>Choose a governed pathway</strong><small>Review the jurisdiction, authority, and official source.</small></div></li>
            <li><span><FileCheck2 /></span><div><strong>Reuse verified evidence</strong><small>See which credentials satisfy each published requirement.</small></div></li>
            <li><span><BellRing /></span><div><strong>Track the external result</strong><small>Record your application honestly and plan renewal.</small></div></li>
          </ol>
        </section>

        {loadError ? (
          <section className={styles.errorState} role="alert">
            <RefreshCw />
            <div><h2>Licensing workspace unavailable</h2><p>{loadError}</p></div>
            <button type="button" onClick={retryLoad}>Try again</button>
          </section>
        ) : loading ? (
          <LoadingState />
        ) : (
          <div className={styles.workspace}>
            <div className={styles.primaryColumn}>
              <section className={styles.currentSection} aria-labelledby="current-pathways-title">
                <div className={styles.sectionHeading}>
                  <div><span>In progress</span><h2 id="current-pathways-title">Current pathways</h2></div>
                  <small>{activeEnrollments.length ? `${activeEnrollments.length} active` : "Nothing started"}</small>
                </div>
                {activeEnrollments.length ? (
                  <div className={styles.currentGrid}>
                    {activeEnrollments.map((enrollment) => (
                      <Link href={`/licensing/pathways/${enrollment.pathwayVersion.pathway.id}`} key={enrollment.id} className={styles.currentCard}>
                        <span className={styles.authorityMark}><Landmark /></span>
                        <div>
                          <small>{enrollment.pathwayVersion.pathway.jurisdiction.nameEn}</small>
                          <h3>{enrollment.pathwayVersion.pathway.licenceType.nameEn}</h3>
                          <p>{enrollment.readiness.satisfied} of {enrollment.readiness.required} required items satisfied</p>
                        </div>
                        <span className={styles.readinessRing} aria-label={`${enrollment.readiness.remaining} required items remaining`}>
                          {enrollment.readiness.ready ? <Check /> : enrollment.readiness.remaining}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyCurrent}>
                    <CircleDashed />
                    <div><strong>No pathway started</strong><p>Choose a published pathway below to review its requirements before enrolling.</p></div>
                  </div>
                )}
              </section>

              <section className={styles.catalogue} aria-labelledby="pathway-catalogue-title">
                <div className={styles.catalogueHead}>
                  <div><span>Official-source catalogue</span><h2 id="pathway-catalogue-title">Find a pathway</h2></div>
                  <div className={styles.filters}>
                    <label>Jurisdiction
                      <select value={jurisdictionCode} onChange={(event) => setJurisdictionCode(event.target.value)}>
                        <option value="">All jurisdictions</option>
                        {jurisdictions.map((jurisdiction) => <option key={jurisdiction.id} value={jurisdiction.code}>{jurisdiction.nameEn}</option>)}
                      </select>
                    </label>
                    <label>Licence type
                      <select value={licenceTypeCode} onChange={(event) => setLicenceTypeCode(event.target.value)}>
                        <option value="">All licence types</option>
                        {licenceTypes.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                      </select>
                    </label>
                  </div>
                </div>

                {filteredPathways.length ? (
                  <div className={styles.pathwayList}>
                    {filteredPathways.map((pathway) => (
                      <PathwayCard key={pathway.id} pathway={pathway} eligibility={eligibility[pathway.id]} />
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyCatalogue}>
                    <BookOpenCheck />
                    <h3>No published pathway matches these filters</h3>
                    <p>Clear a filter or choose another jurisdiction. VetLinX only lists pathways backed by a published source.</p>
                    <button type="button" onClick={() => { setJurisdictionCode(""); setLicenceTypeCode(""); }}>Clear filters</button>
                  </div>
                )}
              </section>
            </div>

            <aside className={styles.reminderPanel} aria-labelledby="renewal-reminders-title">
              <div className={styles.reminderIcon}><BellRing /></div>
              <span>Licence continuity</span>
              <h2 id="renewal-reminders-title">Renewal reminders</h2>
              <p>Choose when VetLinX should remind you about verified professional licences with an expiry date.</p>
              {preference ? (
                <form onSubmit={saveReminder}>
                  <label className={styles.toggle}>
                    <input name="renewalEnabled" type="checkbox" defaultChecked={preference.renewalEnabled} />
                    <span aria-hidden="true" />
                    Renewal reminders enabled
                  </label>
                  <label>Time zone
                    <input name="timeZone" defaultValue={preference.timeZone} required />
                    <small>Use an IANA time zone, such as Asia/Dubai.</small>
                  </label>
                  <label>Remind me before expiry
                    <select name="leadDays" defaultValue={preference.leadDays}>
                      {[30, 60, 90, 120].map((days) => <option key={days} value={days}>{days} days</option>)}
                    </select>
                  </label>
                  {reminderMessage ? <p className={styles.reminderMessage} role="status">{reminderMessage}</p> : null}
                  <button type="submit" disabled={savingReminder}>
                    {savingReminder ? <LoaderCircle className={styles.spinner} /> : <Check />}
                    {savingReminder ? "Saving…" : "Save reminders"}
                  </button>
                </form>
              ) : <p className={styles.unavailable}>Reminder settings are unavailable for this account.</p>}
              <div className={styles.truthNote}><ShieldCheck /><p><strong>Authority decisions stay external.</strong> VetLinX never labels a user-reported application as authority verified.</p></div>
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function PathwayCard({ pathway, eligibility }: { pathway: ApiLicencePathwaySummary; eligibility?: ApiLicensingEligibility }) {
  const version = pathway.versions[0];
  return (
    <article className={styles.pathwayCard}>
      <div className={styles.pathwayIdentity}>
        <span className={styles.authorityMark}><Landmark /></span>
        <div>
          <small>{pathway.jurisdiction.nameEn} · {pathway.authority.nameEn}</small>
          <h3>{pathway.licenceType.nameEn}</h3>
          <p>{version ? `Published pathway version ${version.version}` : "Published pathway"}</p>
        </div>
        <span className={styles.governed}><ShieldCheck />Published</span>
      </div>
      {eligibility ? (
        <div className={styles.eligibility}>
          <div className={styles.eligibilitySummary}>
            {eligibility.summary.ready ? <CheckCircle2 /> : <CircleDashed />}
            <div><strong>{eligibility.summary.ready ? "Evidence ready" : `${eligibility.summary.remaining} item${eligibility.summary.remaining === 1 ? "" : "s"} remaining`}</strong><small>{eligibility.summary.satisfied} of {eligibility.summary.required} required items satisfied</small></div>
          </div>
          {eligibility.requirements.slice(0, 1).map((requirement) => (
            <div className={styles.evidencePreview} key={requirement.id}>
              <span>{requirement.state === "SATISFIED" ? <Check /> : <CircleDashed />}</span>
              <div><strong>{requirement.titleEn}</strong><p>{requirement.explanation}</p></div>
            </div>
          ))}
        </div>
      ) : <div className={styles.eligibilityPending}><CircleDashed />Eligibility preview unavailable</div>}
      <footer>
        <div>
          <span>Source</span>
          {version ? <a href={version.sourceUrl} target="_blank" rel="noreferrer">{version.sourceTitle}<ExternalLink /></a> : <small>Source unavailable</small>}
          {version?.effectiveFrom ? <small>Effective {formatDate(version.effectiveFrom)}</small> : null}
        </div>
        <Link href={`/licensing/pathways/${pathway.id}`} aria-label={`Open ${pathway.licenceType.nameEn} pathway`}>
          Review pathway <ArrowRight />
        </Link>
      </footer>
    </article>
  );
}

function LoadingState() {
  return <div className={styles.loading} role="status"><LoaderCircle /><div><strong>Loading licensing pathways</strong><span>Checking published sources and your evidence readiness…</span></div></div>;
}

async function readBody<T>(response: Response): Promise<T & { message?: string }> {
  return (await response.json().catch(() => ({}))) as T & { message?: string };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}
