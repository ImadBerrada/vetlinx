"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client-api";
import { appointmentTimeInput, appointmentTimeToUtc } from "@/lib/appointment-time";
import type { ApiAppointment, ApiClinicSchedule } from "@/lib/server/vetlinx-api";
import type { AppointmentProposalInput } from "./AppointmentTimeChange";
import { formatAppointment } from "./AppointmentList";
import styles from "./Consumer.module.css";

export function PublishedTimeChange({appointment, clinic, pending, onSave, onClose}: {appointment: ApiAppointment; clinic: boolean; pending: boolean; onSave: (appointment: ApiAppointment, proposal: AppointmentProposalInput) => Promise<boolean>; onClose: () => void}) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [schedule, setSchedule] = useState<ApiClinicSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotId, setSlotId] = useState("");
  const [reason, setReason] = useState("");
  const [deadline, setDeadline] = useState(() => appointmentTimeInput(new Date(Math.min(Date.now() + 86400000, Date.now() + (new Date(appointment.startsAt).getTime() - Date.now()) / 2)), zone));
  const [error, setError] = useState("");
  const selector = useRef<HTMLSelectElement>(null);
  useEffect(() => {selector.current?.focus();}, []);
  const load = useCallback(async (cursor?: string) => {
    setLoading(true); setError("");
    try { const {schedule: data} = await apiFetch<{schedule: ApiClinicSchedule}>(`/api/appointments/${appointment.id}/alternatives${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`); setSchedule(current => cursor && current ? {...data, slots: [...current.slots, ...data.slots]} : data); }
    catch (failure) {setError(failure instanceof Error ? failure.message : "Alternative times could not be loaded.");}
    finally {setLoading(false);}
  }, [appointment.id]);
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<{schedule: ApiClinicSchedule}>(`/api/appointments/${appointment.id}/alternatives`, {signal: controller.signal}).then(result => {if (!controller.signal.aborted) setSchedule(result.schedule);}).catch(failure => {if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Alternative times could not be loaded.");}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [appointment.id]);
  const slots = schedule?.slots.filter(slot => slot.id !== appointment.slotId && slot.remaining > 0 && slot.published && schedule.services.find(service => service.id === slot.serviceId)?.active) ?? [];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try {
      const slot = slots.find(item => item.id === slotId);
      if (!slot) throw new Error("Refresh and choose an available published time.");
      const expiresAt = appointmentTimeToUtc(deadline, zone);
      const now = new Date().getTime();
      if (new Date(expiresAt).getTime() <= now || new Date(expiresAt).getTime() > now + 7 * 86400000 || new Date(expiresAt) > new Date(slot.startsAt) || new Date(expiresAt) > new Date(appointment.startsAt)) throw new Error("Choose a future response deadline within seven days and before both appointment times.");
      if (await onSave(appointment, {slotId: slot.id, startsAt: slot.startsAt, timeZone: slot.timeZone, expiresAt, reason, proposalVersion: appointment.proposalVersion})) onClose();
    } catch (failure) {setError(failure instanceof Error ? failure.message : "Your time change could not be sent.");}
  }
  return <form className={`${styles.form} ${styles.requestForm}`} aria-label={clinic ? "Clinic time proposal" : "Owner reschedule request"} onSubmit={event => void submit(event)}>
    <h4>Choose another published time for {appointment.serviceName}</h4><p>The current appointment keeps its place until {clinic ? "the owner" : "the clinic"} accepts. The proposed time is checked again on acceptance; if it fills up, your original appointment stays unchanged.</p>
    {error ? <p className={styles.error} role="alert">{error} Your draft is kept.</p> : null}{loading ? <p role="status">Loading alternative times…</p> : null}
    <fieldset className={styles.timeChangeFields} disabled={pending || loading}>
      <label>Published alternative time<select ref={selector} required value={slotId} onChange={event => setSlotId(event.target.value)}><option value="">Choose another time</option>{slots.map(slot => <option key={slot.id} value={slot.id}>{formatAppointment(slot)}</option>)}</select></label>
      {!loading && !slots.length ? <p>No alternative places are available in these results. {schedule?.nextCursor ? "Load more times or refresh." : "Keep the current visit or contact the clinic for another time."}</p> : null}
      {schedule?.nextCursor ? <button type="button" className={styles.secondary} onClick={() => void load(schedule.nextCursor!)}>Load more alternative times</button> : null}
      <label>Response deadline ({zone})<input type="datetime-local" required value={deadline} onChange={event => setDeadline(event.target.value)} /></label>
      <label>{clinic ? "Reason for proposed time" : "Reason for rescheduling"}<textarea required minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <div className={styles.actions}><button className={styles.primary} disabled={!slotId}>{clinic ? "Send time proposal" : "Send reschedule request"}</button><button type="button" className={styles.secondary} onClick={() => void load()}>Refresh alternative times</button><button type="button" className={styles.secondary} onClick={onClose}>Keep current time</button></div>
    </fieldset>
  </form>;
}
