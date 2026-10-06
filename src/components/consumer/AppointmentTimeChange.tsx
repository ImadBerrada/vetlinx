"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { appointmentTimeInput, appointmentTimeToUtc } from "@/lib/appointment-time";
import type { ApiAppointment } from "@/lib/server/vetlinx-api";
import styles from "./Consumer.module.css";
import { PublishedTimeChange } from "./PublishedTimeChange";

export interface AppointmentProposalInput {
  slotId?: string;
  startsAt: string;
  timeZone: string;
  expiresAt: string;
  proposalVersion: number;
  reason: string;
}

export function AppointmentTimeChange(props: Parameters<typeof FlexibleTimeChange>[0]) {
  return props.appointment.slotId ? <PublishedTimeChange {...props} /> : <FlexibleTimeChange {...props} />;
}
function FlexibleTimeChange({ appointment, clinic, pending, onSave, onClose }: {
  appointment: ApiAppointment; clinic: boolean; pending: boolean;
  onSave: (appointment: ApiAppointment, proposal: AppointmentProposalInput) => Promise<boolean>;
  onClose: () => void;
}) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [openedAt] = useState(() => Date.now());
  const [startsAt, setStartsAt] = useState(() => appointmentTimeInput(new Date(Math.max(new Date(appointment.startsAt).getTime() + 86400000, Date.now() + 172800000)), timeZone));
  const [expiresAt, setExpiresAt] = useState(() => appointmentTimeInput(new Date(appointment.status === "CONFIRMED" ? Math.min(Date.now() + 86400000, Date.now() + (new Date(appointment.startsAt).getTime() - Date.now()) / 2) : Date.now() + 86400000), timeZone));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const firstField = useRef<HTMLInputElement>(null);
  useEffect(() => { firstField.current?.focus(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const proposedUtc = appointmentTimeToUtc(startsAt, timeZone);
      const deadlineUtc = appointmentTimeToUtc(expiresAt, timeZone);
      if (new Date(proposedUtc).getTime() <= Date.now() || new Date(deadlineUtc).getTime() <= Date.now()) throw new Error("Choose a proposed time and response deadline in the future.");
      if (new Date(deadlineUtc) > new Date(proposedUtc) || (appointment.status === "CONFIRMED" && new Date(deadlineUtc) > new Date(appointment.startsAt))) throw new Error("The response deadline must be no later than the proposed time or your current confirmed appointment.");
      if (new Date(deadlineUtc).getTime() > Date.now() + 7 * 86400000) throw new Error("Choose a response deadline within the next seven days.");
      if (reason.trim().length < 3) throw new Error("Add a reason of at least three characters.");
      if (await onSave(appointment, { startsAt: proposedUtc, timeZone, expiresAt: deadlineUtc, reason: reason.trim(), proposalVersion: appointment.proposalVersion })) onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Check your proposed time and try again."); }
  }

  return <form className={`${styles.form} ${styles.requestForm}`} onSubmit={(event) => void submit(event)} aria-label={clinic ? "Clinic time proposal" : "Owner reschedule request"}>
    <h4>{clinic ? "Propose a time for owner approval" : "Request a time change from the clinic"}</h4>
    <p>Your current appointment stays unchanged until {clinic ? "the owner" : "the clinic"} accepts. {clinic ? "A new proposal replaces your previous clinic proposal." : "A new request replaces your previous owner request."}</p>
    <p>Dates and deadline use your displayed time zone: <strong>{timeZone}</strong>. Choose a response deadline within the next seven days, before the current and proposed appointment times.</p>
    {error ? <p className={styles.error} role="alert">{error} Your draft has been kept.</p> : null}
    <fieldset className={styles.timeChangeFields} disabled={pending}>
      <label>Proposed date and time<input ref={firstField} name="startsAt" type="datetime-local" required min={appointmentTimeInput(new Date(openedAt + 60_000), timeZone)} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
      <label>Response deadline<input name="expiresAt" type="datetime-local" required min={appointmentTimeInput(new Date(openedAt + 60_000), timeZone)} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
      <label>{clinic ? "Reason for proposed time" : "Reason for rescheduling"}<textarea name="reason" required minLength={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <div className={styles.actions}><button className={styles.primary}>{clinic ? "Send time proposal" : "Send reschedule request"}</button><button className={styles.secondary} type="button" onClick={onClose}>Keep current time</button></div>
    </fieldset>
  </form>;
}

export function AppointmentConfirmation({ message, label, pending, onConfirm, onClose, danger = false, canConfirm = true }: {
  message: string; label: string; pending: boolean; onConfirm: () => Promise<boolean>; onClose: () => void; danger?: boolean; canConfirm?: boolean;
}) {
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { confirmButton.current?.focus(); }, []);
  return <div className={styles.confirmAppointment} role="group" aria-label={label}><p>{message}</p><div className={styles.actions}><button ref={confirmButton} className={danger ? styles.danger : styles.primary} disabled={pending || !canConfirm} onClick={() => void onConfirm().then((saved) => { if (saved) onClose(); })}>{label}</button><button className={styles.secondary} disabled={pending} onClick={onClose}>Keep unchanged</button></div></div>;
}
