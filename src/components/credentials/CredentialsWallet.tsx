"use client";

import {
  BadgeCheck,
  Check,
  ChevronRight,
  FileUp,
  FileCheck2,
  GraduationCap,
  IdCard,
  LoaderCircle,
  LockKeyhole,
  Plus,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import type { ApiCredential, ApiVerificationRequest } from "@/lib/server/vetlinx-api";
import styles from "./CredentialsWallet.module.css";

const credentialTypes = [
  { code: "DEGREE", label: "Degree", help: "Academic degrees and diplomas", icon: GraduationCap },
  { code: "PROFESSIONAL_LICENCE", label: "Professional licence", help: "Licences and registrations", icon: IdCard },
  { code: "CERTIFICATION", label: "Certification", help: "Certifications and specializations", icon: BadgeCheck },
] as const;

const countries = [
  { code: "AE", name: "United Arab Emirates" },
  { code: "EG", name: "Egypt" },
  { code: "SA", name: "Saudi Arabia" },
];

interface MeResponse {
  account?: { email: string };
  profile?: { id: string; displayName: string; countryCode: string } | null;
}

interface CredentialsResponse {
  credentials?: ApiCredential[];
  credential?: ApiCredential;
  message?: string;
  errors?: Record<string, string[]>;
}

interface VerificationResponse {
  verificationRequests?: ApiVerificationRequest[];
  verificationRequest?: ApiVerificationRequest;
  message?: string;
}

export function CredentialsWallet() {
  const router = useRouter();
  const [profile, setProfile] = useState<MeResponse["profile"]>(null);
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [verificationRequests, setVerificationRequests] = useState<ApiVerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState("");
  const [evidenceRequest, setEvidenceRequest] = useState<ApiVerificationRequest | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/session/me", { cache: "no-store" }),
      fetch("/api/credentials", { cache: "no-store" }),
      fetch("/api/verification-requests", { cache: "no-store" }),
    ])
      .then(async ([meResponse, credentialsResponse, verificationResponse]) => {
        const [me, wallet, verification] = await Promise.all([
          meResponse.json() as Promise<MeResponse>,
          credentialsResponse.json() as Promise<CredentialsResponse>,
          verificationResponse.json() as Promise<VerificationResponse>,
        ]);
        if (!active) return;
        if (!meResponse.ok || !me.account) {
          router.replace("/login");
          return;
        }
        if (!me.profile) {
          router.replace("/onboarding");
          return;
        }
        setProfile(me.profile);
        if (credentialsResponse.ok) setCredentials(wallet.credentials ?? []);
        else setMessage(wallet.message ?? "Credentials could not be loaded.");
        if (verificationResponse.ok) setVerificationRequests(verification.verificationRequests ?? []);
      })
      .catch(() => active && setMessage("VetLinX could not load your credentials."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [router]);

  async function createCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setMessage("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/credentials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(data)),
    }).catch(() => null);
    if (!response) {
      setMessage("VetLinX could not be reached. Try again.");
      setPending(false);
      return;
    }
    const body = (await response.json().catch(() => ({}))) as CredentialsResponse;
    if (!response.ok || !body.credential) {
      setErrors(body.errors ?? {});
      setMessage(body.message ?? "Credential could not be saved.");
      setPending(false);
      if (response.status === 401) router.replace("/login");
      return;
    }
    setCredentials((current) => [body.credential!, ...current]);
    setFormOpen(false);
    setPending(false);
    setMessage("Credential saved as self-declared. Add evidence when you are ready to submit it.");
  }

  async function submitCredential(credentialId: string) {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/credentials/${credentialId}/submit`, { method: "POST" }).catch(() => null);
    const body = response ? (await response.json().catch(() => ({}))) as CredentialsResponse : {};
    if (!response?.ok || !body.credential) {
      setMessage(body.message ?? "Credential could not be submitted.");
      setPending(false);
      return;
    }
    setCredentials((current) => current.map((item) => item.id === credentialId ? body.credential! : item));
    setPending(false);
    setMessage("Credential details submitted. Evidence collection is the next verification step.");
  }

  function updateVerification(updated: ApiVerificationRequest) {
    setVerificationRequests((current) => {
      const exists = current.some((item) => item.id === updated.id);
      return exists ? current.map((item) => item.id === updated.id ? updated : item) : [updated, ...current];
    });
    setEvidenceRequest(updated);
  }

  async function startEvidence(credentialId: string) {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/credentials/${credentialId}/verification`, { method: "POST" }).catch(() => null);
    const body = response ? (await response.json().catch(() => ({}))) as VerificationResponse : {};
    if (!response?.ok || !body.verificationRequest) {
      setMessage(body.message ?? "Evidence collection could not be started.");
      setPending(false);
      return;
    }
    updateVerification(body.verificationRequest);
    setSelectedFile(null);
    setPending(false);
  }

  async function uploadEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!evidenceRequest || !selectedFile) {
      setMessage("Select a PDF, PNG, or JPEG evidence file.");
      return;
    }
    setPending(true);
    setMessage("");
    const data = new FormData();
    data.set("file", selectedFile, selectedFile.name);
    const response = await fetch(`/api/verification-requests/${evidenceRequest.id}/evidence`, { method: "POST", body: data }).catch(() => null);
    const body = response ? (await response.json().catch(() => ({}))) as VerificationResponse : {};
    if (!response?.ok || !body.verificationRequest) {
      setMessage(body.message ?? "Evidence could not be uploaded.");
      setPending(false);
      return;
    }
    updateVerification(body.verificationRequest);
    setSelectedFile(null);
    setPending(false);
    setMessage("Evidence received and validated. Submit it when you are ready for review.");
  }

  async function submitVerification(requestId: string) {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/verification-requests/${requestId}/submit`, { method: "POST" }).catch(() => null);
    const body = response ? (await response.json().catch(() => ({}))) as VerificationResponse : {};
    if (!response?.ok || !body.verificationRequest) {
      setMessage(body.message ?? "Evidence could not be submitted for review.");
      setPending(false);
      return;
    }
    updateVerification(body.verificationRequest);
    setEvidenceRequest(null);
    setPending(false);
    setMessage("Evidence submitted for review. VetLinX has not verified this credential yet.");
  }

  const submittedCount = credentials.filter((item) => item.status === "SUBMITTED").length;

  return (
    <>
      <AppShell title="Credentials" description="Manage qualifications, submit evidence, and track every verification decision.">
        <div className={styles.workspace}>
          <section className={styles.wallet}>
            <div className={styles.headingRow}>
              <div><h2>Your credential record</h2><p>Claims remain self-declared until supporting evidence is reviewed.</p></div>
              <button className={styles.primary} onClick={() => { setErrors({}); setMessage(""); setFormOpen(true); }}><Plus />Add credential</button>
            </div>

            <div className={styles.summary}>
              <div><strong>{submittedCount}</strong><span>details submitted</span></div>
              <div className={styles.summaryLine}><span>Identity</span><i className={styles.complete}><UserRound /></i><b /><i /><b /><i /><span>Credentials</span></div>
              <small>{credentials.length ? `${credentials.length} credential${credentials.length === 1 ? "" : "s"} in your professional record` : "Complete credentials to build trust"}</small>
            </div>

            {message ? <div className={styles.notice} role="status">{message}</div> : null}
            {loading ? <div className={styles.loading}><LoaderCircle />Loading your credentials…</div> : credentials.length === 0 ? (
              <section className={styles.empty}>
                <div className={styles.emptyIcon}><ShieldCheck /><IdCard /></div>
                <h2>Add your first credential</h2>
                <p>Add your qualifications and licences to start building your verified record.</p>
                <ul>
                  {credentialTypes.map(({ code, label, help, icon: Icon }) => <li key={code}><span><Icon /></span><div><strong>{label}</strong><small>{help}</small></div></li>)}
                </ul>
              </section>
            ) : (
              <section className={styles.list} aria-label="Your credentials">
                {credentials.map((credential) => {
                  const type = credentialTypes.find((item) => item.code === credential.typeCode) ?? credentialTypes[0];
                  const Icon = type.icon;
                  const verification = verificationRequests.find((item) => item.credentialId === credential.id);
                  const verificationLabel = getVerificationLabel(verification);
                  const decisionReason = verification?.decisions.at(-1)?.reason;
                  return <article key={credential.id}>
                    <span className={styles.credentialIcon}><Icon /></span>
                    <div className={styles.credentialCopy}><small>{type.label}</small><h2>{credential.title}</h2><p>{credential.issuingOrganization} · {credential.countryCode}</p></div>
                    <div className={styles.credentialState}>
                      <span className={styles[`credential${credential.status}`]}>{credentialStatusLabel(credential.status)}</span>
                      {credential.status === "DRAFT" ? <button disabled={pending} onClick={() => submitCredential(credential.id)}>Submit details<ChevronRight /></button>
                        : verification?.status === "READY_TO_SUBMIT" ? <button disabled={pending} onClick={() => { setEvidenceRequest(verification); setSelectedFile(null); }}>Review evidence<ChevronRight /></button>
                        : verification?.status === "SUBMITTED" || verification?.status === "UNDER_REVIEW" ? <small className={styles.reviewStatus}><FileCheck2 />{verificationLabel}</small>
                        : verification?.status === "NEEDS_INFORMATION" ? <><small className={styles.attentionStatus}><FileUp />{verificationLabel}</small>{decisionReason ? <p className={styles.decisionReason}>{decisionReason}</p> : null}<button disabled={pending} onClick={() => { setEvidenceRequest(verification); setSelectedFile(null); }}>Add requested evidence<ChevronRight /></button></>
                        : verification?.status === "VERIFIED" ? <small className={styles.verifiedStatus}><ShieldCheck />Verified by VetLinX</small>
                        : verification?.status === "REJECTED" ? <>{decisionReason ? <p className={styles.decisionReason}>{decisionReason}</p> : null}<small className={styles.rejectedStatus}>This review is closed</small></>
                        : <button disabled={pending} onClick={() => verification ? setEvidenceRequest(verification) : startEvidence(credential.id)}>{verification ? "Add evidence" : "Start evidence"}<ChevronRight /></button>}
                    </div>
                  </article>;
                })}
              </section>
            )}
          </section>

          <aside className={styles.trustPanel}>
            <h2>Credential status</h2>
            <p>Each step strengthens the record colleagues and employers can trust.</p>
            <ol>
              <li><span><UserRound /></span><div><strong>Self-declared</strong><small>You add the credential details.</small></div></li>
              <li className={verificationRequests.some((item) => ["SUBMITTED", "UNDER_REVIEW", "VERIFIED"].includes(item.status)) ? styles.completeStep : ""}><span><FileUp /></span><div><strong>Evidence submitted</strong><small>You provide supporting documents for review.</small></div></li>
              <li className={verificationRequests.some((item) => item.status === "VERIFIED") ? styles.completeStep : ""}><span><ShieldCheck /></span><div><strong>VetLinX reviewed</strong><small>An authorized reviewer verifies the credential and updates its status.</small></div></li>
            </ol>
          </aside>
        </div>
      </AppShell>

      {formOpen ? <div className={styles.modalBackdrop} role="presentation">
        <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="credential-form-title">
          <header><h2 id="credential-form-title">Add credential</h2><button onClick={() => setFormOpen(false)} aria-label="Close credential form"><X /></button></header>
          <form onSubmit={createCredential} noValidate>
            <label>Credential type<span>*</span><select name="typeCode" defaultValue=""><option value="" disabled>Select credential type</option>{credentialTypes.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select>{errors.typeCode ? <small className={styles.error}>{errors.typeCode[0]}</small> : null}</label>
            <label>Credential title<span>*</span><input name="title" placeholder="e.g., Doctor of Veterinary Medicine" />{errors.title ? <small className={styles.error}>{errors.title[0]}</small> : null}</label>
            <label>Issuing organization<span>*</span><input name="issuingOrganization" placeholder="e.g., University of Sydney" />{errors.issuingOrganization ? <small className={styles.error}>{errors.issuingOrganization[0]}</small> : null}</label>
            <label>Issuing country<span>*</span><select name="countryCode" defaultValue={profile?.countryCode ?? "AE"}>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
            <div className={styles.dateFields}><label>Issue date<span>*</span><input name="issueDate" type="date" />{errors.issueDate ? <small className={styles.error}>{errors.issueDate[0]}</small> : null}</label><label>Expiry date <em>(optional)</em><input name="expiryDate" type="date" />{errors.expiryDate ? <small className={styles.error}>{errors.expiryDate[0]}</small> : null}</label></div>
            <p className={styles.formNote}><FileUp />Evidence upload follows after the credential is saved.</p>
            <footer><button type="button" className={styles.secondary} onClick={() => setFormOpen(false)}>Cancel</button><button className={styles.primary} type="submit" disabled={pending}>{pending ? <LoaderCircle className={styles.spinner} /> : <Check />}{pending ? "Saving…" : "Save credential"}</button></footer>
          </form>
        </section>
      </div> : null}

      {evidenceRequest ? <div className={styles.modalBackdrop} role="presentation">
        <section className={`${styles.modal} ${styles.evidenceModal}`} role="dialog" aria-modal="true" aria-labelledby="evidence-form-title">
          <header><div><small>Private evidence</small><h2 id="evidence-form-title">Support this credential</h2></div><button onClick={() => setEvidenceRequest(null)} aria-label="Close evidence form"><X /></button></header>
          <div className={styles.securityNote}><LockKeyhole /><p><strong>Your document is private.</strong> It is stored outside public web assets, format-checked, hashed, and attached only to this verification request.</p></div>
          {evidenceRequest.status === "NEEDS_INFORMATION" && evidenceRequest.decisions.at(-1)?.reason ? <div className={styles.informationRequest}><FileUp /><div><strong>Reviewer requested more information</strong><p>{evidenceRequest.decisions.at(-1)?.reason}</p></div></div> : null}
          {evidenceRequest.evidence.length ? <div className={styles.evidenceFiles}>
            <h3>Evidence received</h3>
            {evidenceRequest.evidence.map((evidence) => <div key={evidence.id}><span><FileCheck2 /></span><div><strong>{evidence.file?.originalName ?? "Evidence file"}</strong><small>{evidence.file ? `${formatBytes(evidence.file.byteSize)} · ${evidence.file.validationStatus === "VALIDATED" ? "File format validated" : "Quarantined"}` : "Metadata unavailable"}</small></div></div>)}
          </div> : null}
          {evidenceRequest.status === "EVIDENCE_REQUIRED" || evidenceRequest.status === "NEEDS_INFORMATION" ? <form onSubmit={uploadEvidence}>
            <label className={styles.fileDrop}>Evidence file<span>PDF, PNG, or JPEG · maximum 10 MB</span><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />{selectedFile ? <strong>{selectedFile.name}</strong> : <small>Choose a supporting document</small>}</label>
            <footer><button type="button" className={styles.secondary} onClick={() => setEvidenceRequest(null)}>Cancel</button><button className={styles.primary} disabled={pending || !selectedFile}>{pending ? <LoaderCircle className={styles.spinner} /> : <FileUp />}{pending ? "Uploading…" : "Upload evidence"}</button></footer>
          </form> : evidenceRequest.status === "READY_TO_SUBMIT" ? <div className={styles.reviewActions}><p>Submitting sends this evidence to the VetLinX review queue. It does not automatically verify the credential.</p><button className={styles.primary} disabled={pending} onClick={() => submitVerification(evidenceRequest.id)}>{pending ? <LoaderCircle className={styles.spinner} /> : <ShieldCheck />}{pending ? "Submitting…" : "Submit for review"}</button></div> : <div className={styles.submittedPanel}><FileCheck2 /><div><strong>Evidence submitted for review</strong><p>This credential remains unverified until an authorized reviewer completes the assessment.</p></div></div>}
        </section>
      </div> : null}
    </>
  );
}

function getVerificationLabel(request?: ApiVerificationRequest) {
  if (!request) return "Evidence not started";
  if (request.status === "READY_TO_SUBMIT") return "Ready to submit";
  if (request.status === "SUBMITTED") return "Submitted for review";
  if (request.status === "UNDER_REVIEW") return "Under review";
  if (request.status === "NEEDS_INFORMATION") return "More information needed";
  if (request.status === "VERIFIED") return "Verified";
  if (request.status === "REJECTED") return "Review declined";
  return "Evidence requested";
}

function credentialStatusLabel(status: ApiCredential["status"]) {
  if (status === "DRAFT") return "Self-declared";
  if (status === "SUBMITTED") return "Details submitted";
  if (status === "VERIFIED") return "Verified";
  if (status === "REJECTED") return "Review declined";
  if (status === "EXPIRED") return "Expired";
  return "Revoked";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
