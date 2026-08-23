"use client";

import {
  BriefcaseBusiness,
  Building2,
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  LoaderCircle,
  MapPin,
  Search,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import type { ApiEmployment, ApiInterview, ApiJob, ApiJobApplication, ApiJobOffer } from "@/lib/server/vetlinx-api";
import styles from "./ProfessionalJobs.module.css";

export function ProfessionalJobs() {
  const router = useRouter();
  const [jobs, setJobs] = useState<ApiJob[]>([]);
  const [applications, setApplications] = useState<ApiJobApplication[]>([]);
  const [interviews, setInterviews] = useState<ApiInterview[]>([]);
  const [offers, setOffers] = useState<ApiJobOffer[]>([]);
  const [employments, setEmployments] = useState<ApiEmployment[]>([]);
  const [selected, setSelected] = useState<ApiJob | null>(null);
  const [tab, setTab] = useState<"discover" | "applications">("discover");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(
    async (query = "") => {
      const [jobsResponse, applicationsResponse, interviewsResponse, offersResponse, employmentsResponse] = await Promise.all([
        fetch(`/api/jobs${query ? `?${query}` : ""}`, { cache: "no-store" }),
        fetch("/api/applications", { cache: "no-store" }),
        fetch("/api/interviews", { cache: "no-store" }),
        fetch("/api/offers", { cache: "no-store" }),
        fetch("/api/employments", { cache: "no-store" }),
      ]);
      if (jobsResponse.status === 401 || applicationsResponse.status === 401) {
        router.replace("/login");
        return;
      }
      const jobsBody = (await jobsResponse.json().catch(() => ({}))) as {
        jobs?: ApiJob[];
        message?: string;
      };
      const applicationsBody = (await applicationsResponse
        .json()
        .catch(() => ({}))) as {
        applications?: ApiJobApplication[];
        message?: string;
      };
      const interviewsBody = (await interviewsResponse.json().catch(() => ({}))) as { interviews?: ApiInterview[]; message?: string };
      const offersBody = (await offersResponse.json().catch(() => ({}))) as { offers?: ApiJobOffer[]; message?: string };
      const employmentsBody = (await employmentsResponse.json().catch(() => ({}))) as { employments?: ApiEmployment[]; message?: string };
      if (!jobsResponse.ok)
        throw new Error(jobsBody.message ?? "Jobs could not be loaded.");
      if (!applicationsResponse.ok)
        throw new Error(
          applicationsBody.message ?? "Applications could not be loaded.",
        );
      if (!interviewsResponse.ok) throw new Error(interviewsBody.message ?? "Interviews could not be loaded.");
      if (!offersResponse.ok) throw new Error(offersBody.message ?? "Offers could not be loaded.");
      if (!employmentsResponse.ok) throw new Error(employmentsBody.message ?? "Employment record could not be loaded.");
      setJobs(jobsBody.jobs ?? []);
      setApplications(applicationsBody.applications ?? []);
      setInterviews(interviewsBody.interviews ?? []);
      setOffers(offersBody.offers ?? []);
      setEmployments(employmentsBody.employments ?? []);
    },
    [router],
  );

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        await load();
      } catch (error: unknown) {
        if (active)
          setMessage(
            error instanceof Error
              ? error.message
              : "Jobs could not be loaded.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [load]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["q", "countryCode", "city", "employmentType"]) {
      const value = String(data.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    setLoading(true);
    try {
      await load(params.toString());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }
  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setPending(true);
    const coverNote = String(
      new FormData(event.currentTarget).get("coverNote") ?? "",
    ).trim();
    const response = await fetch(`/api/jobs/${selected.id}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ coverNote: coverNote || undefined }),
    }).catch(() => null);
    const body = response
      ? ((await response.json().catch(() => ({}))) as {
          application?: ApiJobApplication;
          message?: string;
        })
      : {};
    if (!response?.ok || !body.application)
      setMessage(body.message ?? "Application could not be submitted.");
    else {
      setApplications((current) => [body.application!, ...current]);
      setApplyOpen(false);
      setMessage("Application submitted and added to your private tracker.");
    }
    setPending(false);
  }
  async function withdraw(application: ApiJobApplication) {
    if (
      !window.confirm(
        "Withdraw this application? This action is recorded in its history.",
      )
    )
      return;
    setPending(true);
    const response = await fetch(
      `/api/applications/${application.id}/withdraw`,
      { method: "POST" },
    );
    const body = (await response.json().catch(() => ({}))) as {
      application?: Partial<ApiJobApplication>;
      message?: string;
    };
    if (!response.ok || !body.application)
      setMessage(body.message ?? "Application could not be withdrawn.");
    else {
      setApplications((current) =>
        current.map((item) =>
          item.id === application.id ? { ...item, ...body.application } : item,
        ),
      );
      setMessage("Application withdrawn.");
    }
    setPending(false);
  }

  async function respondToOffer(offer: ApiJobOffer, status: "ACCEPTED" | "DECLINED") {
    const reason = status === "DECLINED" ? window.prompt("You may add a reason for declining:") : undefined;
    if (status === "ACCEPTED" && !window.confirm("Accept this employment offer? Your decision is final and auditable.")) return;
    setPending(true);
    const response = await fetch(`/api/offers/${offer.id}/respond`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, reason: reason?.trim() || undefined }) });
    const body = await response.json().catch(() => ({})) as { offer?: ApiJobOffer; message?: string };
    if (!response.ok || !body.offer) setMessage(body.message ?? "Offer response could not be saved.");
    else { setOffers((current) => current.map((item) => item.id === offer.id ? body.offer! : item)); setMessage(`Offer ${status.toLowerCase()}.`); }
    setPending(false);
  }

  const appliedJobIds = useMemo(
    () => new Set(applications.map((item) => item.jobId)),
    [applications],
  );
  if (loading)
    return (
      <main className={styles.loading}>
        <LoaderCircle />
        Loading verified opportunities…
      </main>
    );
  return (
    <>
      <AppShell title="Veterinary roles" description="Find verified roles, understand your eligibility, and track every application.">
        {message ? (
          <div className={styles.notice}>
            {message}
            <button onClick={() => setMessage("")}>
              <X />
            </button>
          </div>
        ) : null}
        {interviews.some((item) => item.status === "SCHEDULED") || offers.some((item) => item.status === "SENT") || employments.some((item) => ["CONFIRMED", "ACTIVE"].includes(item.status)) ? (
          <section className={styles.nextSteps} aria-label="Recruitment next steps">
            {interviews.filter((item) => item.status === "SCHEDULED").map((interview) => (
              <article key={interview.id}><span><CalendarClock /></span><div><small>Interview scheduled</small><h2>{interview.application?.job.title}</h2><p>{new Date(interview.startsAt).toLocaleString()} · {humanize(interview.mode)}</p></div>{interview.joinUrl ? <a href={interview.joinUrl} target="_blank" rel="noreferrer">Open meeting</a> : null}</article>
            ))}
            {offers.filter((item) => item.status === "SENT").map((offer) => (
              <article key={offer.id}><span><BadgeDollarSign /></span><div><small>Offer awaiting your response</small><h2>{offer.application?.job.title}</h2><p>{offer.currencyCode} {offer.salaryMonthly.toLocaleString()} / month · Start {new Date(offer.proposedStartDate).toLocaleDateString()}</p><p>{offer.terms}</p></div><div className={styles.offerActions}><button disabled={pending} onClick={() => respondToOffer(offer, "DECLINED")}>Decline</button><button disabled={pending} onClick={() => respondToOffer(offer, "ACCEPTED")}>Accept offer</button></div></article>
            ))}
            {employments.filter((item) => ["CONFIRMED", "ACTIVE"].includes(item.status)).map((employment) => (
              <article key={employment.id}><span><ShieldCheck /></span><div><small>Verified employment · {humanize(employment.status)}</small><h2>{employment.title}</h2><p>{employment.organization?.publicName ?? employment.organization?.legalName} · {humanize(employment.employmentType)} · Start {new Date(employment.startDate).toLocaleDateString()}</p></div><Status value={employment.status} /></article>
            ))}
          </section>
        ) : null}
        <div className={styles.tabs}>
          <button
            className={tab === "discover" ? styles.active : ""}
            onClick={() => setTab("discover")}
          >
            Discover jobs <span>{jobs.length}</span>
          </button>
          <button
            className={tab === "applications" ? styles.active : ""}
            onClick={() => setTab("applications")}
          >
            My applications <span>{applications.length}</span>
          </button>
        </div>
        {tab === "discover" ? (
          <>
            <form className={styles.filters} onSubmit={search}>
              <label>
                <Search />
                <input name="q" placeholder="Role or keyword" />
              </label>
              <input name="city" placeholder="City" />
              <input name="countryCode" maxLength={2} placeholder="Country" />
              <select name="employmentType">
                <option value="">Any employment</option>
                <option value="FULL_TIME">Full time</option>
                <option value="PART_TIME">Part time</option>
                <option value="LOCUM">Locum</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERNSHIP">Internship</option>
              </select>
              <button>
                <Filter />
                Search
              </button>
            </form>
            <div className={styles.board}>
              <section className={styles.list}>
                {jobs.length ? (
                  jobs.map((job) => (
                    <button
                      key={job.id}
                      className={selected?.id === job.id ? styles.selected : ""}
                      onClick={() => setSelected(job)}
                    >
                      <span className={styles.orgIcon}>
                        <Building2 />
                      </span>
                      <div>
                        <strong>{job.title}</strong>
                        <p>
                          {job.organization?.publicName ??
                            job.organization?.legalName}
                        </p>
                        <small>
                          <MapPin />
                          {job.city}, {job.countryCode}
                          <i />
                          {humanize(job.employmentType)}
                        </small>
                      </div>
                      <ChevronRight />
                    </button>
                  ))
                ) : (
                  <Empty
                    title="No matching opportunities"
                    text="Adjust the filters or return later as verified employers publish new roles."
                  />
                )}
              </section>
              <aside className={styles.detail}>
                {selected ? (
                  <>
                    <header>
                      <span>
                        <Building2 />
                      </span>
                      <div>
                        <small>
                          {selected.organization?.publicName ??
                            selected.organization?.legalName}
                        </small>
                        <h2>{selected.title}</h2>
                        <p>
                          <MapPin />
                          {selected.city}, {selected.countryCode} ·{" "}
                          {humanize(selected.workMode)}
                        </p>
                      </div>
                    </header>
                    <div className={styles.facts}>
                      <span>
                        <Clock3 />
                        {humanize(selected.employmentType)}
                      </span>
                      <span>
                        <FileText />
                        {selected.minExperienceYears}+ years
                      </span>
                      {selected.salaryMinMonthly ? (
                        <span>
                          {selected.currencyCode}{" "}
                          {selected.salaryMinMonthly.toLocaleString()}–
                          {selected.salaryMaxMonthly?.toLocaleString() ??
                            "open"}{" "}
                          / month
                        </span>
                      ) : null}
                    </div>
                    <article>
                      <h3>About the role</h3>
                      <p>{selected.description}</p>
                    </article>
                    <article>
                      <h3>Requirements</h3>
                      {selected.requirements.length ? (
                        <ul>
                          {selected.requirements.map((requirement) => (
                            <li key={requirement.id}>
                              <CheckCircle2 />
                              {requirement.label}
                              {requirement.required ? (
                                <small>Required</small>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No additional structured requirements.</p>
                      )}
                    </article>
                    <footer>
                      {appliedJobIds.has(selected.id) ? (
                        <button disabled>
                          <CheckCircle2 />
                          Application submitted
                        </button>
                      ) : (
                        <button onClick={() => setApplyOpen(true)}>
                          <Send />
                          Apply with VetLinX
                        </button>
                      )}
                    </footer>
                  </>
                ) : (
                  <Empty
                    title="Select an opportunity"
                    text="Review role details and structured requirements before applying."
                  />
                )}
              </aside>
            </div>
          </>
        ) : (
          <section className={styles.applications}>
            {applications.length ? (
              applications.map((application) => (
                <article key={application.id}>
                  <span className={styles.orgIcon}>
                    <Building2 />
                  </span>
                  <div>
                    <small>
                      {application.job?.organization?.publicName ??
                        application.job?.organization?.legalName}
                    </small>
                    <h2>{application.job?.title}</h2>
                    <p>
                      <MapPin />
                      {application.job?.city}, {application.job?.countryCode}
                    </p>
                  </div>
                  <Status value={application.status} />
                  <div className={styles.history}>
                    {application.history.map((entry) => (
                      <span key={entry.id}>
                        <i />
                        <strong>{humanize(entry.toStatus)}</strong>
                        <time>
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </time>
                      </span>
                    ))}
                  </div>
                  {["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED"].includes(
                    application.status,
                  ) ? (
                    <button
                      disabled={pending}
                      onClick={() => withdraw(application)}
                    >
                      Withdraw
                    </button>
                  ) : null}
                </article>
              ))
            ) : (
              <Empty
                title="No applications yet"
                text="Apply to a verified opportunity and its complete status history will appear here."
              />
            )}
          </section>
        )}
      </AppShell>
      {applyOpen && selected ? (
        <div className={styles.modalBackdrop}>
          <section className={styles.modal} role="dialog" aria-modal="true">
            <header>
              <div>
                <small>Apply to</small>
                <h2>{selected.title}</h2>
              </div>
              <button onClick={() => setApplyOpen(false)}>
                <X />
              </button>
            </header>
            <form onSubmit={apply}>
              <p>
                Your verified professional identity and credential wallet are
                linked to this application.
              </p>
              <label>
                Cover note <span>Optional</span>
                <textarea
                  name="coverNote"
                  rows={7}
                  maxLength={4000}
                  placeholder="Briefly explain your fit for this role."
                />
              </label>
              <footer>
                <button type="button" onClick={() => setApplyOpen(false)}>
                  Cancel
                </button>
                <button disabled={pending}>
                  {pending ? <LoaderCircle /> : <Send />}Submit application
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={`${styles.status} ${styles[`status${value}`] ?? ""}`}>
      {humanize(value)}
    </span>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.empty}>
      <BriefcaseBusiness />
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
