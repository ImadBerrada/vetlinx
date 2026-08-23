"use client";

import {
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCircle2,
  Clipboard,
  FileCheck2,
  FileUp,
  IdCard,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  MailPlus,
  Pencil,
  Plus,
  Send,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import type {
  ApiOrganization,
  ApiOrganizationMembershipSummary,
  ApiOrganizationVerification,
  ApiOrganizationWorkspace,
} from "@/lib/server/vetlinx-api";
import styles from "./EmployerWorkspace.module.css";
import { organizationIdFromWorkspace, organizationWorkspace, readWorkspacePreference, writeWorkspacePreference } from "@/lib/workspace-preference";

interface MeResponse { account?: { accountId: string; email: string } }

const organizationTypes = ["CLINIC", "HOSPITAL", "LABORATORY", "UNIVERSITY", "COMPANY", "OTHER"] as const;

export function EmployerWorkspace() {
  const router = useRouter();
  const [account, setAccount] = useState<NonNullable<MeResponse["account"]> | null>(null);
  const [organizations, setOrganizations] = useState<ApiOrganizationMembershipSummary[]>([]);
  const [workspace, setWorkspace] = useState<ApiOrganizationWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [invitationToken, setInvitationToken] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/session/me", { cache: "no-store" }), fetch("/api/organizations", { cache: "no-store" })])
      .then(async ([meResponse, organizationsResponse]) => {
        const me = (await meResponse.json().catch(() => ({}))) as MeResponse;
        const body = (await organizationsResponse.json().catch(() => ({}))) as { organizations?: ApiOrganizationMembershipSummary[]; message?: string };
        if (!active) return;
        if (!meResponse.ok || !me.account) { router.replace("/login"); return; }
        setAccount(me.account);
        if (!organizationsResponse.ok) { setMessage(body.message ?? "Organizations could not be loaded."); return; }
        const items = body.organizations ?? [];
        setOrganizations(items);
        if (!items.length) { setFormMode("create"); return; }
        const preferredId = organizationIdFromWorkspace(readWorkspacePreference());
        const selected = items.find((item) => item.organization.id === preferredId) ?? items[0];
        writeWorkspacePreference(organizationWorkspace(selected.organization.id));
        await loadWorkspace(selected.organization.id, active);
      })
      .catch(() => active && setMessage("VetLinX could not load the employer workspace."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [router]);

  async function loadWorkspace(organizationId: string, active = true) {
    const response = await fetch(`/api/organizations/${organizationId}`, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as { workspace?: ApiOrganizationWorkspace; message?: string };
    if (!active) return;
    if (!response.ok || !body.workspace) { setMessage(body.message ?? "Organization workspace could not be loaded."); return; }
    writeWorkspacePreference(organizationWorkspace(organizationId));
    setWorkspace(body.workspace);
  }

  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setMessage("");
    const values = Object.fromEntries(
      [...new FormData(event.currentTarget).entries()].filter(
        ([, value]) => typeof value !== "string" || value.trim() !== "",
      ),
    );
    const editing = formMode === "edit" && workspace;
    const response = await fetch(editing ? `/api/organizations/${workspace.organization.id}` : "/api/organizations", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => null);
    const body = response ? (await response.json().catch(() => ({}))) as { workspace?: ApiOrganizationWorkspace; organization?: ApiOrganization; message?: string } : {};
    if (!response?.ok) setMessage(body.message ?? "Organization details could not be saved.");
    else if (editing && body.organization) {
      setWorkspace({ ...workspace, organization: body.organization });
      setFormMode(null);
      setMessage("Organization details updated.");
    } else if (body.workspace) {
      setWorkspace(body.workspace);
      setOrganizations([{ id: body.workspace.membership.id, role: body.workspace.membership.role, createdAt: new Date().toISOString(), organization: body.workspace.organization }]);
      writeWorkspacePreference(organizationWorkspace(body.workspace.organization.id));
      setFormMode(null);
      setMessage("Organization created with you as its owner.");
    }
    setPending(false);
  }

  async function uploadEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !selectedFile) return;
    setPending(true); setMessage("");
    const data = new FormData(); data.set("file", selectedFile, selectedFile.name);
    const response = await fetch(`/api/organizations/${workspace.organization.id}/evidence`, { method: "POST", body: data }).catch(() => null);
    const body = response ? (await response.json().catch(() => ({}))) as { verification?: ApiOrganizationVerification; message?: string } : {};
    if (!response?.ok || !body.verification) setMessage(body.message ?? "Evidence could not be uploaded.");
    else { setWorkspace({ ...workspace, verification: body.verification }); setSelectedFile(null); setMessage("Organization evidence received and format-validated."); }
    setPending(false);
  }

  async function submitVerification() {
    if (!workspace) return;
    setPending(true); setMessage("");
    const response = await fetch(`/api/organizations/${workspace.organization.id}/submit`, { method: "POST" }).catch(() => null);
    const body = response ? (await response.json().catch(() => ({}))) as { verification?: ApiOrganizationVerification; message?: string } : {};
    if (!response?.ok || !body.verification) setMessage(body.message ?? "Verification could not be submitted.");
    else {
      setWorkspace({ ...workspace, organization: { ...workspace.organization, status: "VERIFICATION_PENDING" }, verification: body.verification });
      setMessage("Organization submitted for governed review.");
    }
    setPending(false);
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    setPending(true); setMessage("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/organizations/${workspace.organization.id}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }).catch(() => null);
    const body = response ? (await response.json().catch(() => ({}))) as { invitation?: ApiOrganizationWorkspace["invitations"][number] & { invitationToken: string }; message?: string } : {};
    if (!response?.ok || !body.invitation) setMessage(body.message ?? "Invitation could not be created.");
    else {
      setWorkspace({ ...workspace, invitations: [{ ...body.invitation }, ...workspace.invitations] });
      setInvitationToken(body.invitation.invitationToken);
      setMessage("Invitation created. Copy the one-time token before closing this panel.");
    }
    setPending(false);
  }

  async function acceptInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    const token = String(new FormData(event.currentTarget).get("token") ?? "").trim();
    const response = await fetch("/api/organization-invitations/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    const body = response ? (await response.json().catch(() => ({}))) as { workspace?: ApiOrganizationWorkspace; message?: string } : {};
    if (!response?.ok || !body.workspace) setMessage(body.message ?? "Invitation could not be accepted.");
    else { setWorkspace(body.workspace); setAcceptOpen(false); setMessage(`You joined ${body.workspace.organization.publicName ?? body.workspace.organization.legalName}.`); }
    setPending(false);
  }

  if (loading) return <main className={styles.loading}><LoaderCircle /><p>Opening organization operations…</p></main>;
  if (!account) return null;
  const canManage = workspace?.membership.role === "OWNER" || workspace?.membership.role === "ADMIN";

  return <>
    <AppShell scope="employer" title="Organization workspace" description="Manage verified organization identity, evidence, and team access." actions={<button className={styles.acceptButton} onClick={() => setAcceptOpen(true)}><KeyRound />Accept invitation</button>}>
      <div className={styles.content}>
        {message ? <div className={styles.notice} role="status"><span>{message}</span><button onClick={() => setMessage("")}><X /></button></div> : null}
        {!workspace ? <section className={styles.firstOrganization}><Building2 /><h2>Create your employer organization</h2><p>Add the real legal and contact details that VetLinX will use for membership, verification, and future recruitment.</p><button onClick={() => setFormMode("create")}><Plus />Create organization</button></section> : <>
          <section className={styles.organizationHeader}>
            <span className={styles.orgMark}><Building2 /></span><div><div className={styles.nameRow}><h2>{workspace.organization.publicName ?? workspace.organization.legalName}</h2><Status status={workspace.organization.status} /></div><p>{humanize(workspace.organization.type)} · {countryName(workspace.organization.countryCode)}</p><small>{[workspace.organization.addressLine1, workspace.organization.city, workspace.organization.region].filter(Boolean).join(", ") || "Address not provided"}</small></div>
            {organizations.length > 1 ? <select aria-label="Select organization" value={workspace.organization.id} onChange={(event) => loadWorkspace(event.target.value)}>{organizations.map((item) => <option key={item.organization.id} value={item.organization.id}>{item.organization.publicName ?? item.organization.legalName}</option>)}</select> : null}
            {canManage && workspace.organization.status !== "VERIFIED" ? <button className={styles.outlineButton} onClick={() => setFormMode("edit")}><Pencil />Edit details</button> : null}
          </section>

          <div className={styles.grid}>
            <section className={styles.checklist}><header><div><small>Readiness</small><h2>Onboarding checklist</h2></div><CheckCircle2 /></header><ol><CheckStep complete title="Create organization" text="Legal organization and owner membership exist." /><CheckStep complete={workspace.verification.evidence.length > 0} title="Add verification evidence" text="Provide a real business registration document." /><CheckStep complete={["SUBMITTED", "UNDER_REVIEW", "VERIFIED"].includes(workspace.verification.status)} title="Submit verification" text="An authorized reviewer evaluates the evidence." /><CheckStep complete={workspace.members.length > 1} title="Build the team" text="Invite administrators, recruiters, or staff." /></ol></section>

            <section className={styles.details}><header><div><small>Identity</small><h2>Organization profile</h2></div><IdCard /></header><dl><Detail label="Legal name" value={workspace.organization.legalName} /><Detail label="Public name" value={workspace.organization.publicName} /><Detail label="Email" value={workspace.organization.email} /><Detail label="Phone" value={workspace.organization.phone} /><Detail label="Website" value={workspace.organization.website} /><Detail label="Address" value={[workspace.organization.addressLine1, workspace.organization.city, workspace.organization.region, workspace.organization.postalCode].filter(Boolean).join(", ")} /></dl></section>

            <section className={styles.verification} id="verification"><header><div><small>Trust evidence</small><h2>Verification</h2></div><Status status={workspace.verification.status} /></header>{workspace.verification.decisions.at(-1)?.reason ? <div className={styles.reason}><strong>Reviewer note</strong><p>{workspace.verification.decisions.at(-1)?.reason}</p></div> : null}<div className={styles.files}>{workspace.verification.evidence.map((item) => <div key={item.id}><FileCheck2 /><span><strong>{item.file?.originalName ?? "Evidence"}</strong><small>{item.file ? formatBytes(item.file.byteSize) : "Private file"}</small></span></div>)}</div>{canManage && ["EVIDENCE_REQUIRED", "NEEDS_INFORMATION"].includes(workspace.verification.status) ? <form onSubmit={uploadEvidence}><label><FileUp /><span>{selectedFile?.name ?? "Choose business registration evidence"}</span><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} /></label><button disabled={pending || !selectedFile}>{pending ? <LoaderCircle className={styles.spinner} /> : <FileUp />}Upload</button></form> : null}{canManage && workspace.verification.status === "READY_TO_SUBMIT" ? <button className={styles.submitButton} disabled={pending} onClick={submitVerification}><Send />Submit for verification</button> : null}{["SUBMITTED", "UNDER_REVIEW"].includes(workspace.verification.status) ? <p className={styles.pendingNote}><LockKeyhole />Evidence is locked while an authorized review is active.</p> : null}</section>

            <section className={styles.team} id="team"><header><div><small>Access control</small><h2>Team access</h2></div>{canManage ? <button onClick={() => { setInviteOpen(true); setInvitationToken(""); }}><UserPlus />Invite member</button> : <UsersRound />}</header><div className={styles.memberTable}><div className={styles.tableHead}><span>Account</span><span>Role</span><span>Status</span></div>{workspace.members.map((member) => <div key={member.id}><span><i>{initials(member.account.email)}</i><strong>{member.account.email}</strong></span><span>{humanize(member.role)}</span><span className={styles.memberStatus}>{humanize(member.account.status)}</span></div>)}{workspace.invitations.map((invite) => <div key={invite.id}><span><i><MailPlus /></i><strong>{invite.email}</strong></span><span>{humanize(invite.role)}</span><span className={styles.invited}>Invited</span></div>)}</div></section>

            <section className={styles.jobs} id="jobs"><header><div><small>Recruitment</small><h2>Jobs</h2></div><BriefcaseBusiness /></header><div><BriefcaseBusiness /><h3>Recruitment workspace</h3><p>Create structured vacancies, review applications, and discover verified professionals.</p><Link href="/employer/jobs"><BriefcaseBusiness />Open jobs</Link></div></section>
          </div>
        </>}
      </div>
    </AppShell>

    {formMode ? <Modal title={formMode === "create" ? "Create organization" : "Edit organization"} onClose={() => workspace ? setFormMode(null) : null}><form className={styles.orgForm} onSubmit={saveOrganization}><label>Legal name<input name="legalName" required defaultValue={workspace?.organization.legalName ?? ""} /></label><label>Public name<input name="publicName" defaultValue={workspace?.organization.publicName ?? ""} /></label><div><label>Organization type<select name="type" defaultValue={workspace?.organization.type ?? "CLINIC"}>{organizationTypes.map((type) => <option value={type} key={type}>{humanize(type)}</option>)}</select></label><label>Country code<input name="countryCode" required maxLength={2} defaultValue={workspace?.organization.countryCode ?? "AE"} /></label></div><div><label>Email<input name="email" type="email" defaultValue={workspace?.organization.email ?? account.email} /></label><label>Phone<input name="phone" defaultValue={workspace?.organization.phone ?? ""} /></label></div><label>Website<input name="website" type="url" placeholder="https://" defaultValue={workspace?.organization.website ?? ""} /></label><label>Address<input name="addressLine1" defaultValue={workspace?.organization.addressLine1 ?? ""} /></label><div><label>City<input name="city" defaultValue={workspace?.organization.city ?? ""} /></label><label>Region<input name="region" defaultValue={workspace?.organization.region ?? ""} /></label><label>Postal code<input name="postalCode" defaultValue={workspace?.organization.postalCode ?? ""} /></label></div><footer>{workspace ? <button type="button" onClick={() => setFormMode(null)}>Cancel</button> : null}<button className={styles.primaryButton} disabled={pending}>{pending ? <LoaderCircle className={styles.spinner} /> : <Check />}{formMode === "create" ? "Create organization" : "Save changes"}</button></footer></form></Modal> : null}

    {inviteOpen ? <Modal title="Invite team member" onClose={() => setInviteOpen(false)}>{invitationToken ? <div className={styles.tokenPanel}><KeyRound /><h3>One-time invitation token</h3><p>Send this token securely to the invited email address. VetLinX stores only its hash and will not show it again.</p><code>{invitationToken}</code><button onClick={() => navigator.clipboard.writeText(invitationToken)}><Clipboard />Copy token</button></div> : <form className={styles.inviteForm} onSubmit={inviteMember}><label>Email<input name="email" type="email" required /></label><label>Role<select name="role" defaultValue="RECRUITER"><option value="ADMIN">Admin</option><option value="RECRUITER">Recruiter</option><option value="STAFF">Staff</option></select></label><footer><button type="button" onClick={() => setInviteOpen(false)}>Cancel</button><button className={styles.primaryButton} disabled={pending}><UserPlus />Create invitation</button></footer></form>}</Modal> : null}
    {acceptOpen ? <Modal title="Accept organization invitation" onClose={() => setAcceptOpen(false)}><form className={styles.inviteForm} onSubmit={acceptInvitation}><p className={styles.modalCopy}>Sign in with the exact invited email, then paste the one-time token supplied by the organization owner.</p><label>Invitation token<textarea name="token" required minLength={32} /></label><footer><button type="button" onClick={() => setAcceptOpen(false)}>Cancel</button><button className={styles.primaryButton} disabled={pending}><KeyRound />Accept invitation</button></footer></form></Modal> : null}
  </>;
}

function Modal({ title, onClose, children }: { title: string; onClose: (() => void) | null; children: React.ReactNode }) { return <div className={styles.modalBackdrop}><section className={styles.modal} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2>{onClose ? <button onClick={onClose} aria-label="Close"><X /></button> : null}</header>{children}</section></div>; }
function CheckStep({ complete, title, text }: { complete: boolean; title: string; text: string }) { return <li className={complete ? styles.stepComplete : ""}><span>{complete ? <Check /> : null}</span><div><strong>{title}</strong><p>{text}</p></div></li>; }
function Detail({ label, value }: { label: string; value?: string | null }) { return <div><dt>{label}</dt><dd>{value || "Not provided"}</dd></div>; }
function Status({ status }: { status: string }) { return <span className={`${styles.status} ${styles[`status${status}`] ?? ""}`}><i />{humanize(status)}</span>; }
function humanize(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function initials(value: string) { return value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VL"; }
function countryName(code: string) { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code; }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
