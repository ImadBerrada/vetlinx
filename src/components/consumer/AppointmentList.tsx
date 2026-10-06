"use client";
import { useState } from "react";
import type { ApiAppointment } from "@/lib/server/vetlinx-api";
import { AppointmentConfirmation, AppointmentTimeChange, type AppointmentProposalInput } from "./AppointmentTimeChange";
import styles from "./Consumer.module.css";
export type { AppointmentProposalInput } from "./AppointmentTimeChange";

type Actions = {
  pending: boolean;
  onAction: (appointment: ApiAppointment, status: ApiAppointment["status"], reason?: string) => Promise<boolean>;
  onPropose?: (appointment: ApiAppointment, proposal: AppointmentProposalInput) => Promise<boolean>;
  onRespond?: (appointment: ApiAppointment, accept: boolean, reason?: string) => Promise<boolean>;
  onWithdraw?: (appointment: ApiAppointment) => Promise<boolean>;
  onCheckIn?: (appointment: ApiAppointment) => Promise<boolean>;
};
export function formatAppointment(value: { startsAt: string; timeZone: string }) {
  return `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: value.timeZone }).format(new Date(value.startsAt))} (${value.timeZone})`;
}
const labels: Record<ApiAppointment["status"], string> = { REQUESTED: "requested", CONFIRMED: "confirmed", DECLINED: "declined", CANCELLED: "cancelled", COMPLETED: "completed", NO_SHOW: "no-show" };
function proposalState(appointment: ApiAppointment) {
  const exists = Boolean(appointment.proposedStartsAt && appointment.proposedTimeZone && appointment.proposalExpiresAt);
  const expired = exists && (new Date(appointment.proposalExpiresAt!) <= new Date() || new Date(appointment.proposedStartsAt!) <= new Date());
  return { exists, expired, live: exists && !expired, origin: appointment.proposalInitiator ?? "CLINIC" };
}

export function AppointmentList({ appointments, clinic = false, ...actions }: { appointments: ApiAppointment[]; clinic?: boolean } & Actions) {
  const [filter, setFilter] = useState<"active" | "history" | "all">("active");
  const active = appointments.filter((item) => ["REQUESTED", "CONFIRMED"].includes(item.status));
  const visible = filter === "all" ? appointments : appointments.filter((item) => filter === "active" ? active.includes(item) : !active.includes(item));
  return <>
    <div className={styles.actions} role="group" aria-label="Appointment filters">{(["active", "history", "all"] as const).map((value) => <button key={value} className={filter === value ? styles.primary : styles.secondary} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "active" ? `Active (${active.length})` : value === "history" ? `History (${appointments.length - active.length})` : `All (${appointments.length})`}</button>)}</div>
    {!visible.length ? <div className={styles.empty}><h3>{filter === "history" ? "No past appointments" : "No active appointment requests"}</h3><p>{filter === "history" ? "Completed, declined, cancelled, and missed appointments remain here." : clinic ? "Owner requests appear here after you enable appointment requests." : "Find a clinic and request a time that works for you."}</p></div> : <div className={styles.list}>{visible.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} clinic={clinic} {...actions} />)}</div>}
  </>;
}

function AppointmentCard({ appointment, clinic, ...actions }: { appointment: ApiAppointment; clinic: boolean } & Actions) {
  const terminal = !["REQUESTED", "CONFIRMED"].includes(appointment.status);
  return <article className={styles.appointment}>
    <header><h3>{appointment.petName} · {clinic ? appointment.ownerName : appointment.clinicName}</h3><span className={`${styles.status} ${appointment.status === "REQUESTED" ? styles.requested : terminal && appointment.status !== "COMPLETED" ? styles.appointmentClosed : ""}`}>{labels[appointment.status]}</span></header>
    {appointment.serviceName ? <p><strong>Service:</strong> {appointment.serviceName} · {appointment.durationMinutes} minutes</p> : null}
    <p><strong>{appointment.status === "REQUESTED" ? "Requested time" : "Appointment time"}:</strong> {formatAppointment(appointment)}</p>
    {appointment.checkedInAt ? <p className={styles.arrivalNote}><strong>Checked in:</strong> {new Date(appointment.checkedInAt).toLocaleString()}</p> : null}
    <p>{appointment.visitReason}</p>{clinic ? <p>Shared contact: {appointment.contactPhone} · {appointment.speciesCode.toLowerCase()}</p> : null}
    {appointment.responseNote ? <p><strong>Latest update:</strong> {appointment.responseNote}</p> : null}
    {appointment.status === "REQUESTED" ? <p className={styles.muted}>This request is waiting for clinic confirmation. {appointment.slotId ? "A place is reserved at the selected time while the clinic reviews your request." : "No availability slot has been reserved."}</p> : null}
    {!terminal ? <TimeProposal appointment={appointment} clinic={clinic} {...actions} /> : null}
    {clinic ? <ClinicActions appointment={appointment} {...actions} /> : <OwnerActions appointment={appointment} {...actions} />}
    <details className={styles.requestForm}><summary>Appointment history</summary><ol>{appointment.history.map((item, index) => <li key={`${item.createdAt}-${index}`}><p><strong>{historyLabel(item)}</strong> · {new Date(item.createdAt).toLocaleString()}{item.proposedStartsAt && item.proposedTimeZone ? ` · ${formatAppointment({ startsAt: item.proposedStartsAt, timeZone: item.proposedTimeZone })}` : ""}</p>{item.reason ? <p>{item.reason}</p> : null}</li>)}</ol></details>
  </article>;
}

function historyLabel(item: ApiAppointment["history"][number]) {
  const actions: Record<string, string> = {
    REQUESTED: "Owner requested appointment", REQUEST_SNAPSHOT: "Original requested time", PROPOSED: "Clinic proposed a time", PROPOSAL_ACCEPTED: "Owner accepted proposed time", PROPOSAL_REJECTED: "Owner kept original time",
    OWNER_RESCHEDULE_REQUESTED: "Owner requested a different time", OWNER_RESCHEDULE_ACCEPTED: "Clinic accepted owner’s time change", OWNER_RESCHEDULE_DECLINED: "Clinic declined owner’s time change", OWNER_RESCHEDULE_WITHDRAWN: "Owner withdrew time change", CHECKED_IN: "Clinic recorded arrival",
  };
  if (item.action === "PROPOSAL_EXPIRED") return item.proposalInitiator === "OWNER" ? "Expired owner change request closed" : "Expired clinic proposal closed";
  return actions[item.action] ?? `Status: ${item.toStatus.toLowerCase().replaceAll("_", "-")}`;
}

function TimeProposal({ appointment, clinic, pending, onRespond, onWithdraw }: { appointment: ApiAppointment; clinic: boolean } & Actions) {
  const proposal = proposalState(appointment);
  const [accepting, setAccepting] = useState(false);
  const [reason, setReason] = useState("");
  if (!proposal.exists) return null;
  const ownerInitiated = proposal.origin === "OWNER";
  const mayRespond = clinic ? ownerInitiated : !ownerInitiated;
  return <section className={styles.notice} aria-label={`Proposed time for ${appointment.petName}`}>
    <h4>{proposal.expired ? ownerInitiated ? "Owner reschedule request expired" : "Proposed time expired" : ownerInitiated ? "Owner requested a different time" : "Clinic proposed a different time"}</h4>
    <p><strong>Proposed time:</strong> {formatAppointment({ startsAt: appointment.proposedStartsAt!, timeZone: appointment.proposedTimeZone! })}</p>
    <p>{appointment.proposalReason}</p>
    <p>Respond by {formatAppointment({ startsAt: appointment.proposalExpiresAt!, timeZone: appointment.proposedTimeZone! })}. {appointment.status === "CONFIRMED" ? "Your original confirmed time stays in place until the other party accepts." : "The original request stays unchanged until the owner accepts."}</p>
    {ownerInitiated && !clinic ? <p>Waiting for clinic approval. This request does not change your confirmed appointment.</p> : !ownerInitiated && clinic ? <p>Waiting for the owner’s approval.</p> : null}
    {mayRespond && onRespond ? <>
      {clinic ? <label className={styles.form}>Response to reschedule request<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} disabled={pending} placeholder="Required when declining the owner’s requested change" /></label> : null}
      <div className={styles.actions}>{!proposal.expired ? <button className={styles.primary} disabled={pending} onClick={() => setAccepting(true)}>{clinic ? "Accept reschedule request" : "Accept proposed time"}</button> : null}<button className={styles.secondary} disabled={pending || (clinic && reason.trim().length < 3)} onClick={() => void onRespond(appointment, false, reason.trim() || undefined)}>{clinic ? "Decline reschedule request" : proposal.expired ? "Dismiss expired proposal" : "Keep original time"}</button></div>
      {accepting && !proposal.expired ? <AppointmentConfirmation pending={pending} label="Confirm time change" message={`Change the appointment from ${formatAppointment(appointment)} to ${formatAppointment({ startsAt: appointment.proposedStartsAt!, timeZone: appointment.proposedTimeZone! })}? The original confirmed time will be replaced.`} onConfirm={() => onRespond(appointment, true, reason.trim() || undefined)} onClose={() => setAccepting(false)} /> : null}
    </> : null}
    {!clinic && ownerInitiated && onWithdraw ? <button className={styles.secondary} disabled={pending} onClick={() => void onWithdraw(appointment)}>{proposal.expired ? "Withdraw expired change request" : "Withdraw reschedule request"}</button> : null}
  </section>;
}

function OwnerActions({ appointment, pending, onAction, onPropose }: { appointment: ApiAppointment } & Actions) {
  const [cancelling, setCancelling] = useState(false);
  const [proposing, setProposing] = useState(false);
  const proposal = proposalState(appointment);
  if (!["REQUESTED", "CONFIRMED"].includes(appointment.status)) return null;
  if (appointment.checkedInAt) return <p className={styles.muted}>Your pet has been checked in. Contact the clinic to change or cancel this visit.</p>;
  const mayRequestChange = appointment.status === "CONFIRMED" && new Date(appointment.startsAt) > new Date() && !(proposal.live && proposal.origin === "CLINIC");
  return <><div className={styles.actions}>
    {mayRequestChange && onPropose ? <button className={styles.secondary} disabled={pending} onClick={() => setProposing(!proposing)}>Request a different time</button> : null}
    <button className={styles.secondary} disabled={pending} onClick={() => setCancelling(true)}>Cancel request for {appointment.petName}</button>
  </div>
    {cancelling ? <AppointmentConfirmation pending={pending} danger label="Confirm cancellation" message={`Cancel ${appointment.petName}’s ${appointment.status === "CONFIRMED" ? "confirmed appointment" : "request"}? Any pending time change will also close.`} onConfirm={() => onAction(appointment, "CANCELLED")} onClose={() => setCancelling(false)} /> : null}
    {proposing && mayRequestChange && onPropose ? <AppointmentTimeChange appointment={appointment} clinic={false} pending={pending} onSave={onPropose} onClose={() => setProposing(false)} /> : null}
  </>;
}

function ClinicActions({ appointment, pending, onAction, onPropose, onCheckIn }: { appointment: ApiAppointment } & Actions) {
  const [reason, setReason] = useState("");
  const [proposing, setProposing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [noShow, setNoShow] = useState(false);
  if (!["REQUESTED", "CONFIRMED"].includes(appointment.status)) return null;
  const proposal = proposalState(appointment);
  const future = new Date(appointment.startsAt) > new Date();
  const mayPropose = !appointment.checkedInAt && (appointment.status === "REQUESTED" || future) && !(proposal.live && proposal.origin === "OWNER");
  const mayCheckIn = appointment.status === "CONFIRMED" && !appointment.checkedInAt && !proposal.live && new Date().getTime() >= new Date(appointment.startsAt).getTime() - 86400000;
  const mayNoShow = appointment.status === "CONFIRMED" && !future && !appointment.checkedInAt && !proposal.live;
  return <div className={styles.requestForm}>
    <label className={styles.form}>Message to pet owner<input aria-label={`Message for ${appointment.petName}`} maxLength={1000} value={reason} disabled={pending} onChange={(event) => setReason(event.target.value)} placeholder="Required when declining, cancelling, or marking no-show" /></label>
    <div className={styles.actions}>{appointment.status === "REQUESTED" ? <><button className={styles.primary} disabled={pending || !future || proposal.live} onClick={() => void onAction(appointment, "CONFIRMED", reason)}>Confirm time</button><button className={styles.secondary} disabled={pending || !reason.trim()} onClick={() => void onAction(appointment, "DECLINED", reason)}>Decline request</button></> : <>
      {mayCheckIn && onCheckIn ? <button className={styles.primary} disabled={pending} onClick={() => void onCheckIn(appointment)}>Check in {appointment.petName}</button> : null}
      <button className={styles.primary} disabled={pending || future || proposal.live} onClick={() => void onAction(appointment, "COMPLETED", reason)}>Mark completed</button>
      {mayNoShow ? <button className={styles.secondary} disabled={pending || reason.trim().length < 3} onClick={() => setNoShow(true)}>Mark no-show</button> : null}
      <button className={styles.secondary} disabled={pending || !reason.trim()} onClick={() => setCancelling(true)}>Cancel appointment</button>
    </>}{mayPropose && onPropose ? <button className={styles.secondary} disabled={pending} onClick={() => setProposing(!proposing)}>Propose a different time</button> : null}</div>
    {appointment.status === "CONFIRMED" && !appointment.checkedInAt && !mayCheckIn && future && !proposal.live ? <p className={styles.muted}>Check-in opens 24 hours before the appointment.</p> : null}
    {cancelling ? <AppointmentConfirmation pending={pending} danger label="Confirm cancellation" message="Cancel this confirmed appointment and notify the owner?" onConfirm={() => onAction(appointment, "CANCELLED", reason)} onClose={() => setCancelling(false)} /> : null}
    {noShow ? <AppointmentConfirmation pending={pending} canConfirm={reason.trim().length >= 3} danger label="Confirm no-show" message={`Record ${appointment.petName} as not attending this appointment and notify the owner? Your reason will be saved in the history.`} onConfirm={() => onAction(appointment, "NO_SHOW", reason)} onClose={() => setNoShow(false)} /> : null}
    {proposing && mayPropose && onPropose ? <AppointmentTimeChange appointment={appointment} clinic pending={pending} onSave={onPropose} onClose={() => setProposing(false)} /> : null}
  </div>;
}
