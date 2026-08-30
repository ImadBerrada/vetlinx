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
import { licensingCopy } from "@/lib/i18n/licensing";
import type { Locale } from "@/lib/i18n/locales";
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

export function LicensingHub({ locale }: { locale: Locale }) {
  const copy = licensingCopy[locale];
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
    pathways.forEach((pathway) => entries.set(pathway.licenceType.code, locale === "ar" ? pathway.licenceType.nameAr : pathway.licenceType.nameEn));
    return [...entries.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [locale, pathways]);

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
      title={copy.title}
      description={copy.description}
      locale={locale}
    >
      <div className={styles.hub}>
        <section className={styles.routeMap} aria-labelledby="licensing-route-title">
          <div className={styles.routeIntro}>
            <span><Route />{copy.routeEyebrow}</span>
            <h2 id="licensing-route-title">{copy.routeTitle}</h2>
            <p>{copy.routeBody}</p>
          </div>
          <ol>
            <li><span><MapPinned /></span><div><strong>{copy.steps[0][0]}</strong><small>{copy.steps[0][1]}</small></div></li>
            <li><span><FileCheck2 /></span><div><strong>{copy.steps[1][0]}</strong><small>{copy.steps[1][1]}</small></div></li>
            <li><span><BellRing /></span><div><strong>{copy.steps[2][0]}</strong><small>{copy.steps[2][1]}</small></div></li>
          </ol>
        </section>

        {loadError ? (
          <section className={styles.errorState} role="alert">
            <RefreshCw />
            <div><h2>{locale === "ar" ? "مساحة الترخيص غير متاحة" : "Licensing workspace unavailable"}</h2><p>{loadError}</p></div>
            <button type="button" onClick={retryLoad}>{locale === "ar" ? "إعادة المحاولة" : "Try again"}</button>
          </section>
        ) : loading ? (
          <LoadingState locale={locale} />
        ) : (
          <div className={styles.workspace}>
            <div className={styles.primaryColumn}>
              <section className={styles.currentSection} aria-labelledby="current-pathways-title">
                <div className={styles.sectionHeading}>
                  <div><span>{copy.inProgress}</span><h2 id="current-pathways-title">{copy.currentPathways}</h2></div>
                  <small>{activeEnrollments.length ? (locale === "ar" ? `${activeEnrollments.length} نشط` : `${activeEnrollments.length} active`) : copy.nothingStarted}</small>
                </div>
                {activeEnrollments.length ? (
                  <div className={styles.currentGrid}>
                    {activeEnrollments.map((enrollment) => (
                      <Link href={`/licensing/pathways/${enrollment.pathwayVersion.pathway.id}`} key={enrollment.id} className={styles.currentCard}>
                        <span className={styles.authorityMark}><Landmark /></span>
                        <div>
                          <small>{locale === "ar" ? enrollment.pathwayVersion.pathway.jurisdiction.nameAr : enrollment.pathwayVersion.pathway.jurisdiction.nameEn}</small>
                          <h3>{locale === "ar" ? enrollment.pathwayVersion.pathway.licenceType.nameAr : enrollment.pathwayVersion.pathway.licenceType.nameEn}</h3>
                          <p>{locale === "ar" ? `${enrollment.readiness.satisfied} من ${enrollment.readiness.required} متطلبات إلزامية مستوفاة` : `${enrollment.readiness.satisfied} of ${enrollment.readiness.required} required items satisfied`}</p>
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
                    <div><strong>{copy.noPathway}</strong><p>{copy.noPathwayBody}</p></div>
                  </div>
                )}
              </section>

              <section className={styles.catalogue} aria-labelledby="pathway-catalogue-title">
                <div className={styles.catalogueHead}>
                  <div><span>{copy.catalogue}</span><h2 id="pathway-catalogue-title">{copy.findPathway}</h2></div>
                  <div className={styles.filters}>
                    <label>{copy.jurisdiction}
                      <select value={jurisdictionCode} onChange={(event) => setJurisdictionCode(event.target.value)}>
                        <option value="">{copy.allJurisdictions}</option>
                        {jurisdictions.map((jurisdiction) => <option key={jurisdiction.id} value={jurisdiction.code}>{locale === "ar" ? jurisdiction.nameAr : jurisdiction.nameEn}</option>)}
                      </select>
                    </label>
                    <label>{copy.licenceType}
                      <select value={licenceTypeCode} onChange={(event) => setLicenceTypeCode(event.target.value)}>
                        <option value="">{copy.allLicenceTypes}</option>
                        {licenceTypes.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                      </select>
                    </label>
                  </div>
                </div>

                {filteredPathways.length ? (
                  <div className={styles.pathwayList}>
                    {filteredPathways.map((pathway) => (
                      <PathwayCard key={pathway.id} pathway={pathway} eligibility={eligibility[pathway.id]} locale={locale} />
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyCatalogue}>
                    <BookOpenCheck />
                    <h3>{copy.noMatches}</h3>
                    <p>{copy.noMatchesBody}</p>
                    <button type="button" onClick={() => { setJurisdictionCode(""); setLicenceTypeCode(""); }}>{copy.clearFilters}</button>
                  </div>
                )}
              </section>
            </div>

            <aside className={styles.reminderPanel} aria-labelledby="renewal-reminders-title">
              <div className={styles.reminderIcon}><BellRing /></div>
              <span>{copy.continuity}</span>
              <h2 id="renewal-reminders-title">{copy.reminders}</h2>
              <p>{copy.remindersBody}</p>
              {preference ? (
                <form onSubmit={saveReminder}>
                  <label className={styles.toggle}>
                    <input name="renewalEnabled" type="checkbox" defaultChecked={preference.renewalEnabled} />
                    <span aria-hidden="true" />
                    {copy.remindersEnabled}
                  </label>
                  <label>{copy.timeZone}
                    <input name="timeZone" defaultValue={preference.timeZone} required />
                    <small>{locale === "ar" ? "استخدم منطقة زمنية وفق IANA مثل Asia/Dubai." : "Use an IANA time zone, such as Asia/Dubai."}</small>
                  </label>
                  <label>{copy.reminderLead}
                    <select name="leadDays" defaultValue={preference.leadDays}>
                      {[30, 60, 90, 120].map((days) => <option key={days} value={days}>{locale === "ar" ? `${days} يوماً` : `${days} days`}</option>)}
                    </select>
                  </label>
                  {reminderMessage ? <p className={styles.reminderMessage} role="status">{reminderMessage}</p> : null}
                  <button type="submit" disabled={savingReminder}>
                    {savingReminder ? <LoaderCircle className={styles.spinner} /> : <Check />}
                    {savingReminder ? (locale === "ar" ? "جارٍ الحفظ…" : "Saving…") : copy.saveReminders}
                  </button>
                </form>
              ) : <p className={styles.unavailable}>{locale === "ar" ? "إعدادات التذكير غير متاحة لهذا الحساب." : "Reminder settings are unavailable for this account."}</p>}
              <div className={styles.truthNote}><ShieldCheck /><p><strong>{copy.authorityTruth}</strong> {copy.authorityTruthBody}</p></div>
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function PathwayCard({ pathway, eligibility, locale }: { pathway: ApiLicencePathwaySummary; eligibility?: ApiLicensingEligibility; locale: Locale }) {
  const version = pathway.versions[0];
  return (
    <article className={styles.pathwayCard}>
      <div className={styles.pathwayIdentity}>
        <span className={styles.authorityMark}><Landmark /></span>
        <div>
          <small>{locale === "ar" ? pathway.jurisdiction.nameAr : pathway.jurisdiction.nameEn} · {locale === "ar" ? pathway.authority.nameAr : pathway.authority.nameEn}</small>
          <h3>{locale === "ar" ? pathway.licenceType.nameAr : pathway.licenceType.nameEn}</h3>
          <p>{locale === "ar" ? (version ? `مسار منشور · الإصدار ${version.version}` : "مسار منشور") : (version ? `Published pathway version ${version.version}` : "Published pathway")}</p>
        </div>
        <span className={styles.governed}><ShieldCheck />{locale === "ar" ? "منشور" : "Published"}</span>
      </div>
      {eligibility ? (
        <div className={styles.eligibility}>
          <div className={styles.eligibilitySummary}>
            {eligibility.summary.ready ? <CheckCircle2 /> : <CircleDashed />}
            <div><strong>{locale === "ar" ? (eligibility.summary.ready ? "الأدلة جاهزة" : `${eligibility.summary.remaining} متطلبات متبقية`) : (eligibility.summary.ready ? "Evidence ready" : `${eligibility.summary.remaining} item${eligibility.summary.remaining === 1 ? "" : "s"} remaining`)}</strong><small>{locale === "ar" ? `${eligibility.summary.satisfied} من ${eligibility.summary.required} متطلبات إلزامية مستوفاة` : `${eligibility.summary.satisfied} of ${eligibility.summary.required} required items satisfied`}</small></div>
          </div>
          {eligibility.requirements.slice(0, 1).map((requirement) => (
            <div className={styles.evidencePreview} key={requirement.id}>
              <span>{requirement.state === "SATISFIED" ? <Check /> : <CircleDashed />}</span>
              <div><strong>{locale === "ar" ? requirement.titleAr : requirement.titleEn}</strong><p>{locale === "ar" ? localizedExplanation(requirement.explanation) : requirement.explanation}</p></div>
            </div>
          ))}
        </div>
      ) : <div className={styles.eligibilityPending}><CircleDashed />{locale === "ar" ? "معاينة الأهلية غير متاحة" : "Eligibility preview unavailable"}</div>}
      <footer>
        <div>
          <span>{locale === "ar" ? "المصدر" : "Source"}</span>
          {version ? <a href={version.sourceUrl} dir="ltr" target="_blank" rel="noreferrer">{version.sourceTitle}<ExternalLink /></a> : <small>{locale === "ar" ? "المصدر غير متاح" : "Source unavailable"}</small>}
          {version?.effectiveFrom ? <small>{locale === "ar" ? "ساري من" : "Effective"} {formatDate(version.effectiveFrom, locale)}</small> : null}
        </div>
        <Link href={`/licensing/pathways/${pathway.id}`} aria-label={locale === "ar" ? `فتح مسار ${pathway.licenceType.nameAr}` : `Open ${pathway.licenceType.nameEn} pathway`}>
          {locale === "ar" ? "مراجعة المسار" : "Review pathway"} <ArrowRight className={styles.directionalIcon} />
        </Link>
      </footer>
    </article>
  );
}

function LoadingState({ locale }: { locale: Locale }) {
  return <div className={styles.loading} role="status"><LoaderCircle /><div><strong>{locale === "ar" ? "جارٍ تحميل مسارات الترخيص" : "Loading licensing pathways"}</strong><span>{locale === "ar" ? "جارٍ التحقق من المصادر المنشورة وجاهزية أدلتك…" : "Checking published sources and your evidence readiness…"}</span></div></div>;
}

async function readBody<T>(response: Response): Promise<T & { message?: string }> {
  return (await response.json().catch(() => ({}))) as T & { message?: string };
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}
function localizedExplanation(value: string) { if (/satisfied|matches/i.test(value)) return "يطابق الدليل الموثق المرتبط هذا المتطلب."; if (/credential|evidence/i.test(value)) return "يلزم ربط مؤهل موثق يطابق هذا المتطلب."; return "تحقق من الدليل المطلوب وحالته قبل المتابعة."; }
