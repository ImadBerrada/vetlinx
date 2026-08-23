"use client";

import {
  BadgeDollarSign,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileText,
  Filter,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Plus,
  Search,
  Send,
  ShieldCheck,
  UserRoundSearch,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import type {
  ApiCandidate,
  ApiEmployment,
  ApiInterview,
  ApiJob,
  ApiJobApplication,
  ApiJobOffer,
  ApiOrganizationMembershipSummary,
} from "@/lib/server/vetlinx-api";
import styles from "./Recruitment.module.css";
import { organizationIdFromWorkspace, organizationWorkspace, readWorkspacePreference, writeWorkspacePreference } from "@/lib/workspace-preference";

type Tab = "jobs" | "candidates";

export function EmployerRecruitment() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<
    ApiOrganizationMembershipSummary[]
  >([]);
  const [organizationId, setOrganizationId] = useState("");
  const [jobs, setJobs] = useState<ApiJob[]>([]);
  const [applications, setApplications] = useState<ApiJobApplication[]>([]);
  const [candidates, setCandidates] = useState<ApiCandidate[]>([]);
  const [selectedJob, setSelectedJob] = useState<ApiJob | null>(null);
  const [selectedApplication, setSelectedApplication] =
    useState<ApiJobApplication | null>(null);
  const [tab, setTab] = useState<Tab>("jobs");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [message, setMessage] = useState("");
  const organization = organizations.find(
    (item) => item.organization.id === organizationId,
  )?.organization;

  const loadJobs = useCallback(async (id: string) => {
    const response = await fetch(
      `/api/employer/jobs?organizationId=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    const body = (await response.json().catch(() => ({}))) as {
      jobs?: ApiJob[];
      message?: string;
    };
    if (!response.ok)
      throw new Error(body.message ?? "Jobs could not be loaded.");
    setJobs(body.jobs ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/organizations", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          organizations?: ApiOrganizationMembershipSummary[];
          message?: string;
        };
        if (!active) return;
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok)
          throw new Error(body.message ?? "Organizations could not be loaded.");
        const allowed = (body.organizations ?? []).filter((item) =>
          ["OWNER", "ADMIN", "RECRUITER"].includes(item.role),
        );
        setOrganizations(allowed);
        if (!allowed.length) {
          router.replace("/employer");
          return;
        }
        const preferredId = organizationIdFromWorkspace(readWorkspacePreference());
        const selected = allowed.find((item) => item.organization.id === preferredId) ?? allowed[0];
        setOrganizationId(selected.organization.id);
        writeWorkspacePreference(organizationWorkspace(selected.organization.id));
        await loadJobs(selected.organization.id);
      })
      .catch(
        (error: unknown) =>
          active &&
          setMessage(
            error instanceof Error
              ? error.message
              : "Workspace could not be loaded.",
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [loadJobs, router]);

  async function selectOrganization(id: string) {
    writeWorkspacePreference(organizationWorkspace(id));
    setOrganizationId(id);
    setSelectedJob(null);
    setSelectedApplication(null);
    setLoading(true);
    try {
      await loadJobs(id);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Jobs could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const requirementLabel = String(data.get("requirementLabel") ?? "").trim();
    const payload = {
      title: data.get("title"),
      description: data.get("description"),
      countryCode: data.get("countryCode"),
      city: data.get("city"),
      employmentType: data.get("employmentType"),
      workMode: data.get("workMode"),
      minExperienceYears: Number(data.get("minExperienceYears")),
      salaryMinMonthly: optionalNumber(data.get("salaryMinMonthly")),
      salaryMaxMonthly: optionalNumber(data.get("salaryMaxMonthly")),
      currencyCode: String(data.get("currencyCode") ?? "").trim() || undefined,
      closingAt: String(data.get("closingAt") ?? "").trim() || undefined,
      requirements: requirementLabel
        ? [
            {
              category: data.get("requirementCategory"),
              valueCode: requirementLabel,
              label: requirementLabel,
              required: true,
            },
          ]
        : [],
    };
    const response = await fetch(
      `/api/employer/jobs?organizationId=${encodeURIComponent(organizationId)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    ).catch(() => null);
    const body = response
      ? ((await response.json().catch(() => ({}))) as {
          job?: ApiJob;
          message?: string;
        })
      : {};
    if (!response?.ok || !body.job)
      setMessage(body.message ?? "Job could not be created.");
    else {
      setJobs((current) => [body.job!, ...current]);
      setComposeOpen(false);
      setMessage("Job draft created. Review it before publishing.");
    }
    setPending(false);
  }

  async function changeJob(job: ApiJob, action: "publish" | "close") {
    setPending(true);
    setMessage("");
    const response = await fetch(
      `/api/employer/jobs/${job.id}/${action}?organizationId=${encodeURIComponent(organizationId)}`,
      { method: "POST" },
    ).catch(() => null);
    const body = response
      ? ((await response.json().catch(() => ({}))) as {
          job?: ApiJob;
          message?: string;
        })
      : {};
    if (!response?.ok || !body.job)
      setMessage(body.message ?? `Job could not be ${action}ed.`);
    else {
      setJobs((current) =>
        current.map((item) => (item.id === job.id ? body.job! : item)),
      );
      setSelectedJob(body.job);
      setMessage(
        action === "publish"
          ? "Job published to verified professionals."
          : "Job closed to new applications.",
      );
    }
    setPending(false);
  }

  async function openApplications(job: ApiJob) {
    setSelectedJob(job);
    setSelectedApplication(null);
    setApplications([]);
    const response = await fetch(
      `/api/employer/jobs/${job.id}/applications?organizationId=${encodeURIComponent(organizationId)}`,
      { cache: "no-store" },
    );
    const body = (await response.json().catch(() => ({}))) as {
      applications?: ApiJobApplication[];
      message?: string;
    };
    if (!response.ok)
      setMessage(body.message ?? "Applications could not be loaded.");
    else setApplications(body.applications ?? []);
  }

  async function updateApplication(
    status: "UNDER_REVIEW" | "SHORTLISTED" | "REJECTED",
  ) {
    if (!selectedApplication) return;
    const reason =
      status === "REJECTED"
        ? window.prompt(
            "Give the candidate a clear reason (minimum 10 characters):",
          )
        : undefined;
    if (status === "REJECTED" && (!reason || reason.trim().length < 10)) return;
    setPending(true);
    const response = await fetch(
      `/api/employer/applications/${selectedApplication.id}?organizationId=${encodeURIComponent(organizationId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, reason }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as {
      application?: ApiJobApplication;
      message?: string;
    };
    if (!response.ok || !body.application)
      setMessage(body.message ?? "Application could not be updated.");
    else {
      const updated = { ...selectedApplication, ...body.application };
      setSelectedApplication(updated);
      setApplications((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage("Candidate workflow updated.");
    }
    setPending(false);
  }

  async function searchCandidates(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!organizationId) return;
    const data = event ? new FormData(event.currentTarget) : null;
    const params = new URLSearchParams({ organizationId });
    for (const key of ["q", "countryCode", "credentialType"]) {
      const value = String(data?.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    setPending(true);
    const response = await fetch(`/api/employer/candidates?${params}`, {
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as {
      candidates?: ApiCandidate[];
      message?: string;
    };
    if (!response.ok)
      setMessage(body.message ?? "Candidates could not be loaded.");
    else setCandidates(body.candidates ?? []);
    setPending(false);
  }

  async function scheduleInterview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedApplication) return;
    setPending(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const payload = {
      startsAt: new Date(String(data.get("startsAt"))).toISOString(),
      endsAt: new Date(String(data.get("endsAt"))).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      mode: data.get("mode"),
      location: String(data.get("location") ?? "").trim() || undefined,
      joinUrl: String(data.get("joinUrl") ?? "").trim() || undefined,
      notes: String(data.get("notes") ?? "").trim() || undefined,
    };
    const response = await fetch(
      `/api/employer/applications/${selectedApplication.id}/interviews?organizationId=${encodeURIComponent(organizationId)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    ).catch(() => null);
    const body = response
      ? ((await response.json().catch(() => ({}))) as {
          interview?: ApiInterview;
          message?: string;
        })
      : {};
    if (!response?.ok || !body.interview)
      setMessage(body.message ?? "Interview could not be scheduled.");
    else {
      const updated = {
        ...selectedApplication,
        status: "INTERVIEWING" as const,
      };
      setSelectedApplication(updated);
      setApplications((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setInterviewOpen(false);
      setMessage("Interview scheduled and the candidate has been notified.");
    }
    setPending(false);
  }

  async function createAndSendOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedApplication) return;
    setPending(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const payload = {
      salaryMonthly: Number(data.get("salaryMonthly")),
      currencyCode: data.get("currencyCode"),
      proposedStartDate: new Date(
        String(data.get("proposedStartDate")),
      ).toISOString(),
      expiresAt: new Date(String(data.get("expiresAt"))).toISOString(),
      terms: data.get("terms"),
    };
    const createdResponse = await fetch(
      `/api/employer/applications/${selectedApplication.id}/offers?organizationId=${encodeURIComponent(organizationId)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    ).catch(() => null);
    const createdBody = createdResponse
      ? ((await createdResponse.json().catch(() => ({}))) as {
          offer?: ApiJobOffer;
          message?: string;
        })
      : {};
    if (!createdResponse?.ok || !createdBody.offer) {
      setMessage(createdBody.message ?? "Offer could not be created.");
      setPending(false);
      return;
    }
    const sentResponse = await fetch(
      `/api/employer/offers/${createdBody.offer.id}/send?organizationId=${encodeURIComponent(organizationId)}`,
      { method: "POST" },
    ).catch(() => null);
    const sentBody = sentResponse
      ? ((await sentResponse.json().catch(() => ({}))) as {
          offer?: ApiJobOffer;
          message?: string;
        })
      : {};
    if (!sentResponse?.ok || !sentBody.offer)
      setMessage(
        sentBody.message ?? "The offer draft exists but could not be sent.",
      );
    else {
      const updated = { ...selectedApplication, status: "OFFERED" as const };
      setSelectedApplication(updated);
      setApplications((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setOfferOpen(false);
      setMessage("Offer sent securely to the candidate.");
    }
    setPending(false);
  }

  async function confirmEmployment(offer: ApiJobOffer) {
    if (!selectedApplication || !window.confirm("Confirm this accepted offer as verified employment? This will update the professional record.")) return;
    setPending(true); setMessage("");
    const response = await fetch(`/api/employer/offers/${offer.id}/employment?organizationId=${encodeURIComponent(organizationId)}`, { method: "POST" }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) as { employment?: ApiEmployment; message?: string } : {};
    if (!response?.ok || !body.employment) setMessage(body.message ?? "Employment could not be confirmed.");
    else {
      const offers = (selectedApplication.offers ?? []).map((item) => item.id === offer.id ? { ...item, employment: body.employment } : item);
      const updated = { ...selectedApplication, status: "HIRED" as const, offers };
      setSelectedApplication(updated); setApplications((current) => current.map((item) => item.id === updated.id ? updated : item)); setMessage("Employment confirmed and propagated to the professional record.");
    }
    setPending(false);
  }

  const counts = useMemo(
    () => ({
      draft: jobs.filter((job) => job.status === "DRAFT").length,
      published: jobs.filter((job) => job.status === "PUBLISHED").length,
      applications: jobs.reduce(
        (sum, job) => sum + (job._count?.applications ?? 0),
        0,
      ),
      shortlisted: applications.filter((item) => item.status === "SHORTLISTED")
        .length,
    }),
    [applications, jobs],
  );
  if (loading)
    return (
      <main className={styles.loading}>
        <LoaderCircle className={styles.spin} />
        Opening recruitment workspace…
      </main>
    );

  return (
    <>
      <AppShell scope="employer" title="Recruitment operations" description="Publish verified roles, evaluate candidates, and move hiring decisions forward." actions={
        <div className={styles.topbar}>
          <label>
            Organization
            <select
              value={organizationId}
              onChange={(event) => selectOrganization(event.target.value)}
            >
              {organizations.map((item) => (
                <option value={item.organization.id} key={item.organization.id}>
                  {item.organization.publicName ?? item.organization.legalName}
                </option>
              ))}
            </select>
          </label>
          {organization ? (
            <span
              className={`${styles.verificationBadge} ${organization.status === "VERIFIED" ? styles.verified : ""}`}
            >
              {organization.status === "VERIFIED" ? (
                <CheckCircle2 />
              ) : (
                <LockKeyhole />
              )}
              {humanize(organization.status)} organization
            </span>
          ) : null}
        </div>
      }>
        <section className={styles.content}>
          {message ? (
            <div className={styles.notice} role="status">
              {message}
              <button onClick={() => setMessage("")}>
                <X />
              </button>
            </div>
          ) : null}
          {!organizations.length ? (
            <Empty
              icon={<Building2 />}
              title="No recruitment organization"
              text="Create an organization and obtain recruitment access before managing vacancies."
            >
              <Link href="/employer">Open organization workspace</Link>
            </Empty>
          ) : (
            <>
              <div className={styles.tabs}>
                <button
                  className={tab === "jobs" ? styles.tabActive : ""}
                  onClick={() => setTab("jobs")}
                >
                  Jobs
                </button>
                <button
                  className={tab === "candidates" ? styles.tabActive : ""}
                  onClick={() => setTab("candidates")}
                >
                  Candidate discovery
                </button>
              </div>
              {tab === "jobs" ? (
                <>
                  <div className={styles.metrics}>
                    <Metric
                      icon={<FileText />}
                      value={counts.draft}
                      label="Draft jobs"
                    />
                    <Metric
                      icon={<Send />}
                      value={counts.published}
                      label="Published jobs"
                    />
                    <Metric
                      icon={<UsersRound />}
                      value={counts.applications}
                      label="Applications"
                    />
                    <Metric
                      icon={<UserRoundSearch />}
                      value={counts.shortlisted}
                      label="Shortlisted"
                    />
                  </div>
                  <section className={styles.panel}>
                    <header>
                      <div>
                        <small>Recruitment operations</small>
                        <h1>Your job vacancies</h1>
                      </div>
                      <button
                        className={styles.primary}
                        onClick={() => setComposeOpen(true)}
                      >
                        <Plus />
                        Create job
                      </button>
                    </header>
                    {!jobs.length ? (
                      <Empty
                        icon={<BriefcaseBusiness />}
                        title="No jobs yet"
                        text="Create a structured vacancy. It remains private until a verified organization publishes it."
                      />
                    ) : (
                      <div className={styles.jobList}>
                        {jobs.map((job) => (
                          <article
                            key={job.id}
                            className={
                              selectedJob?.id === job.id
                                ? styles.selectedRow
                                : ""
                            }
                          >
                            <button
                              className={styles.jobMain}
                              onClick={() => openApplications(job)}
                            >
                              <div>
                                <strong>{job.title}</strong>
                                <span>
                                  <MapPin />
                                  {job.city}, {job.countryCode} ·{" "}
                                  {humanize(job.employmentType)}
                                </span>
                              </div>
                              <Status value={job.status} />
                            </button>
                            <span>
                              {job._count?.applications ?? 0} applicants
                            </span>
                            <time>
                              {new Date(job.updatedAt).toLocaleDateString()}
                            </time>
                            <div className={styles.rowActions}>
                              {job.status === "DRAFT" ? (
                                <button
                                  disabled={
                                    pending ||
                                    organization?.status !== "VERIFIED"
                                  }
                                  onClick={() => changeJob(job, "publish")}
                                >
                                  <Send />
                                  Publish
                                </button>
                              ) : null}
                              {job.status === "PUBLISHED" ? (
                                <button
                                  disabled={pending}
                                  onClick={() => changeJob(job, "close")}
                                >
                                  <X />
                                  Close
                                </button>
                              ) : null}
                              <button
                                onClick={() => openApplications(job)}
                                aria-label={`Open ${job.title}`}
                              >
                                <ChevronRight />
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <section className={styles.panel}>
                  <header>
                    <div>
                      <small>Verified talent</small>
                      <h1>Candidate discovery</h1>
                    </div>
                  </header>
                  <form
                    className={styles.searchForm}
                    onSubmit={searchCandidates}
                  >
                    <label>
                      <Search />
                      <input name="q" placeholder="Professional name" />
                    </label>
                    <input
                      name="countryCode"
                      maxLength={2}
                      placeholder="Country, e.g. AE"
                    />
                    <input
                      name="credentialType"
                      placeholder="Credential, e.g. licence"
                    />
                    <button className={styles.primary} disabled={pending}>
                      <Filter />
                      Search verified profiles
                    </button>
                  </form>
                  {!candidates.length ? (
                    <Empty
                      icon={<UserRoundSearch />}
                      title="No candidates loaded"
                      text="Run a focused search. Only professionals with verified credentials are returned."
                    />
                  ) : (
                    <div className={styles.candidateGrid}>
                      {candidates.map((candidate) => (
                        <article key={candidate.id}>
                          <span className={styles.avatar}>
                            {initials(candidate.displayName)}
                          </span>
                          <div>
                            <h2>{candidate.displayName}</h2>
                            <p>
                              {candidate.countryCode} ·{" "}
                              {candidate.verifiedCredentials.length} verified
                              credential
                              {candidate.verifiedCredentials.length === 1
                                ? ""
                                : "s"}
                            </p>
                          </div>
                          {candidate.verifiedCredentials.map((credential) => (
                            <small key={credential.id}>
                              <ShieldCheck />
                              {credential.title} ·{" "}
                              {credential.issuingOrganization}
                            </small>
                          ))}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </section>
      </AppShell>
      {selectedJob ? (
        <aside className={styles.drawer}>
          <header>
            <div>
              <small>Applications for</small>
              <h2>{selectedJob.title}</h2>
            </div>
            <button
              onClick={() => {
                setSelectedJob(null);
                setSelectedApplication(null);
              }}
              aria-label="Close details"
            >
              <X />
            </button>
          </header>
          {!applications.length ? (
            <Empty
              icon={<UsersRound />}
              title="No applications"
              text="Candidates will appear here after they apply."
            />
          ) : (
            <div className={styles.applicationLayout}>
              <div className={styles.applicationList}>
                {applications.map((application) => (
                  <button
                    key={application.id}
                    className={
                      selectedApplication?.id === application.id
                        ? styles.selectedApplication
                        : ""
                    }
                    onClick={() => setSelectedApplication(application)}
                  >
                    <span>
                      {initials(
                        application.professional?.displayName ?? "Candidate",
                      )}
                    </span>
                    <div>
                      <strong>{application.professional?.displayName}</strong>
                      <small>{humanize(application.status)}</small>
                    </div>
                    <ChevronRight />
                  </button>
                ))}
              </div>
              {selectedApplication ? (
                <section className={styles.applicationDetail}>
                  <div className={styles.person}>
                    <span>
                      {initials(
                        selectedApplication.professional?.displayName ??
                          "Candidate",
                      )}
                    </span>
                    <div>
                      <h3>{selectedApplication.professional?.displayName}</h3>
                      <p>
                        <MapPin />
                        {selectedApplication.professional?.countryCode}
                      </p>
                    </div>
                    <Status value={selectedApplication.status} />
                  </div>
                  <div className={styles.cover}>
                    <small>Cover note</small>
                    <p>
                      {selectedApplication.coverNote ||
                        "No cover note supplied."}
                    </p>
                  </div>
                  {(selectedApplication.offers ?? []).filter((offer) => offer.status === "ACCEPTED").map((offer) => (
                    <div className={styles.cover} key={offer.id}>
                      <small>Accepted offer</small>
                      <p><strong>{offer.currencyCode} {offer.salaryMonthly.toLocaleString()} / month</strong> · proposed start {new Date(offer.proposedStartDate).toLocaleDateString()}</p>
                      {offer.employment ? <Status value={offer.employment.status} /> : <button className={styles.primary} disabled={pending} onClick={() => confirmEmployment(offer)}><CheckCircle2 />Confirm employment</button>}
                    </div>
                  ))}
                  <div className={styles.timeline}>
                    <small>Application timeline</small>
                    {selectedApplication.history.map((entry) => (
                      <div key={entry.id}>
                        <i />
                        <span>
                          <strong>{humanize(entry.toStatus)}</strong>
                          <time>
                            {new Date(entry.createdAt).toLocaleString()}
                          </time>
                          {entry.reason ? <p>{entry.reason}</p> : null}
                        </span>
                      </div>
                    ))}
                  </div>
                  <footer>
                    <button
                      disabled={
                        pending || selectedApplication.status === "REJECTED"
                      }
                      onClick={() => updateApplication("REJECTED")}
                    >
                      <X />
                      Reject
                    </button>
                    {selectedApplication.status === "SUBMITTED" ? (
                      <button
                        disabled={pending}
                        onClick={() => updateApplication("UNDER_REVIEW")}
                      >
                        <FileText />
                        Start review
                      </button>
                    ) : null}
                    {["SUBMITTED", "UNDER_REVIEW"].includes(
                      selectedApplication.status,
                    ) ? (
                      <button
                        className={styles.primary}
                        disabled={pending}
                        onClick={() => updateApplication("SHORTLISTED")}
                      >
                        <UserRoundSearch />
                        Shortlist
                      </button>
                    ) : null}
                    {["UNDER_REVIEW", "SHORTLISTED", "INTERVIEWING"].includes(
                      selectedApplication.status,
                    ) ? (
                      <button disabled={pending} onClick={() => setInterviewOpen(true)}>
                        <CalendarClock /> Interview
                      </button>
                    ) : null}
                    {["SHORTLISTED", "INTERVIEWING"].includes(
                      selectedApplication.status,
                    ) ? (
                      <button className={styles.primary} disabled={pending} onClick={() => setOfferOpen(true)}>
                        <BadgeDollarSign /> Offer
                      </button>
                    ) : null}
                  </footer>
                </section>
              ) : (
                <Empty
                  icon={<FileText />}
                  title="Select an application"
                  text="Review its evidence and status history."
                />
              )}
            </div>
          )}
        </aside>
      ) : null}
      {composeOpen ? (
        <Modal title="Create job draft" onClose={() => setComposeOpen(false)}>
          <form className={styles.jobForm} onSubmit={createJob}>
            <label>
              Job title
              <input name="title" required minLength={4} />
            </label>
            <label>
              Description
              <textarea name="description" required minLength={30} rows={5} />
            </label>
            <div>
              <label>
                Country code
                <input
                  name="countryCode"
                  required
                  maxLength={2}
                  defaultValue={organization?.countryCode ?? "AE"}
                />
              </label>
              <label>
                City
                <input name="city" required />
              </label>
            </div>
            <div>
              <label>
                Employment
                <select name="employmentType">
                  <option value="FULL_TIME">Full time</option>
                  <option value="PART_TIME">Part time</option>
                  <option value="LOCUM">Locum</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERNSHIP">Internship</option>
                </select>
              </label>
              <label>
                Work mode
                <select name="workMode">
                  <option value="ON_SITE">On site</option>
                  <option value="HYBRID">Hybrid</option>
                  <option value="REMOTE">Remote</option>
                </select>
              </label>
              <label>
                Minimum experience
                <input
                  name="minExperienceYears"
                  type="number"
                  min="0"
                  max="60"
                  defaultValue="0"
                />
              </label>
            </div>
            <div>
              <label>
                Minimum monthly salary
                <input name="salaryMinMonthly" type="number" min="0" />
              </label>
              <label>
                Maximum monthly salary
                <input name="salaryMaxMonthly" type="number" min="0" />
              </label>
              <label>
                Currency
                <input name="currencyCode" maxLength={3} placeholder="AED" />
              </label>
            </div>
            <div>
              <label>
                Primary requirement
                <select name="requirementCategory">
                  <option value="LICENCE">Licence</option>
                  <option value="SPECIALTY">Specialty</option>
                  <option value="SPECIES">Species</option>
                  <option value="LANGUAGE">Language</option>
                  <option value="QUALIFICATION">Qualification</option>
                </select>
              </label>
              <label>
                Requirement label
                <input
                  name="requirementLabel"
                  placeholder="UAE Veterinary Licence"
                />
              </label>
              <label>
                Closing date
                <input name="closingAt" type="datetime-local" />
              </label>
            </div>
            <footer>
              <button type="button" onClick={() => setComposeOpen(false)}>
                Cancel
              </button>
              <button className={styles.primary} disabled={pending}>
                {pending ? <LoaderCircle className={styles.spin} /> : <Plus />}
                Create private draft
              </button>
            </footer>
          </form>
        </Modal>
      ) : null}
      {interviewOpen && selectedApplication ? (
        <Modal title="Schedule interview" onClose={() => setInterviewOpen(false)}>
          <form className={styles.jobForm} onSubmit={scheduleInterview}>
            <div><label>Starts at<input name="startsAt" type="datetime-local" required /></label><label>Ends at<input name="endsAt" type="datetime-local" required /></label></div>
            <div><label>Mode<select name="mode"><option value="VIDEO">Video</option><option value="PHONE">Phone</option><option value="IN_PERSON">In person</option></select></label><label>Video join URL<input name="joinUrl" type="url" placeholder="https://" /></label><label>Location<input name="location" /></label></div>
            <label>Internal preparation note<textarea name="notes" rows={4} /></label>
            <footer><button type="button" onClick={() => setInterviewOpen(false)}>Cancel</button><button className={styles.primary} disabled={pending}><CalendarClock />Schedule and notify</button></footer>
          </form>
        </Modal>
      ) : null}
      {offerOpen && selectedApplication ? (
        <Modal title="Create employment offer" onClose={() => setOfferOpen(false)}>
          <form className={styles.jobForm} onSubmit={createAndSendOffer}>
            <div><label>Monthly salary<input name="salaryMonthly" type="number" min="0" required /></label><label>Currency<input name="currencyCode" maxLength={3} defaultValue="AED" required /></label></div>
            <div><label>Proposed start date<input name="proposedStartDate" type="date" required /></label><label>Response deadline<input name="expiresAt" type="datetime-local" required /></label></div>
            <label>Employment terms<textarea name="terms" rows={6} minLength={20} required placeholder="Summarize the role, conditions, and checks that apply." /></label>
            <footer><button type="button" onClick={() => setOfferOpen(false)}>Cancel</button><button className={styles.primary} disabled={pending}><Send />Create and send offer</button></footer>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

function Metric({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <article className={styles.metric}>
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </article>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={`${styles.status} ${styles[`status${value}`] ?? ""}`}>
      {humanize(value)}
    </span>
  );
}
function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.empty}>
      {icon}
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.modalBackdrop}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function initials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "VL"
  );
}
function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? Number(text) : undefined;
}
