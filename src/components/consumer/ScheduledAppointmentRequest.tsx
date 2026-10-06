"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client-api";
import type { ApiAppointmentSlot, ApiClinic, ApiClinicSchedule, ApiPet } from "@/lib/server/vetlinx-api";
import { formatAppointment } from "./AppointmentList";
import styles from "./Consumer.module.css";

type Hold = { id: string; expiresAt: string; slot: ApiAppointmentSlot & { service: { name: string; durationMinutes: number } } };
export function ScheduledAppointmentRequest({ clinic, pets, onBooked, onClose, onPending }: {
  clinic: ApiClinic; pets: ApiPet[]; onBooked: () => void; onClose: () => void; onPending: (busy: boolean) => void;
}) {
  const [schedule, setSchedule] = useState<ApiClinicSchedule | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [petId, setPetId] = useState(pets.length === 1 ? pets[0].id : "");
  const [hold, setHold] = useState<Hold | null>(null);
  const [holdRequest, setHoldRequest] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [visitReason, setVisitReason] = useState("");
  const [consent, setConsent] = useState(false);
  const heldPanel = useRef<HTMLElement>(null);
  useEffect(() => { if (hold) heldPanel.current?.focus(); }, [hold]);
  const load = useCallback(async (cursor?: string) => {
    setLoading(true); setError("");
    try {
      const result = await apiFetch<{schedule: ApiClinicSchedule}>(`/api/clinics/${clinic.id}/availability${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
      setSchedule(current => cursor && current ? {...result.schedule, slots: [...current.slots, ...result.schedule.slots]} : result.schedule);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Available times could not be loaded."); }
    finally { setLoading(false); }
  }, [clinic.id]);
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<{schedule: ApiClinicSchedule}>(`/api/clinics/${clinic.id}/availability`, {signal: controller.signal}).then(result => {if (!controller.signal.aborted) setSchedule(result.schedule);}).catch(failure => {if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Available times could not be loaded.");}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [clinic.id]);
  useEffect(() => {
    if (!hold) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((new Date(hold.expiresAt).getTime() - Date.now()) / 1000)));
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [hold]);
  const slots = schedule?.slots.filter(slot => slot.serviceId === serviceId && slot.remaining > 0) ?? [];
  function pending(value: boolean) { setBusy(value); onPending(value); }
  async function reserve() {
    if (busy || !slotId || !petId) return;
    pending(true); setError("");
    const id = holdRequest || crypto.randomUUID(); setHoldRequest(id);
    try {
      const result = await apiFetch<{hold: Hold}>(`/api/clinics/${clinic.id}/holds`, {method: "POST", body: JSON.stringify({id, slotId, petId})});
      setRemaining(Math.max(0, Math.ceil((new Date(result.hold.expiresAt).getTime() - Date.now()) / 1000)));
      setHold(result.hold);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "This time could not be held."); }
    finally { pending(false); }
  }
  async function chooseAgain() {
    if (busy) return;
    pending(true); setError("");
    try {
      if (hold) await apiFetch(`/api/appointments/holds/${hold.id}/release`, {method: "POST"});
      setHold(null); setHoldRequest(""); setSlotId(""); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The hold could not be released. It will expire automatically."); }
    finally { pending(false); }
  }
  async function close() {
    if (busy) return;
    pending(true);
    try { if (hold) await apiFetch(`/api/appointments/holds/${hold.id}/release`, {method: "POST"}); }
    catch { /* The five-minute deadline releases a hold even if this request cannot reach the server. */ }
    finally { pending(false); onClose(); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hold || !remaining || busy) return;
    pending(true); setError("");
    try {
      await apiFetch("/api/appointments", {method: "POST", body: JSON.stringify({requestId, holdId: hold.id, organizationId: clinic.id, petId, startsAt: hold.slot.startsAt, timeZone: hold.slot.timeZone, visitReason, sharingConsent: consent})});
      onBooked();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Your request could not be sent. Your form is kept."); }
    finally { pending(false); }
  }
  return <form className={styles.form} onSubmit={submit} aria-label="Published appointment request">
    <p>Choose a service and published time. A hold lasts up to five minutes; the clinic still confirms the appointment after you send your request.</p>
    {error ? <p role="alert" className={styles.error}>{error} Your details are kept. <Link href="/owner">Check my requests</Link></p> : null}
    {loading ? <p role="status">Loading published times…</p> : null}
    {!hold ? <>
      <fieldset className={styles.timeChangeFields} disabled={busy || loading}>
        <label>Pet<select required value={petId} onChange={event => {setPetId(event.target.value); setHoldRequest("");}}><option value="">Choose your pet</option>{pets.map(pet => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</select></label>
        <label>Service<select required value={serviceId} onChange={event => {setServiceId(event.target.value); setSlotId(""); setHoldRequest("");}}><option value="">Choose a service</option>{schedule?.services.map(service => <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes} minutes</option>)}</select></label>
        {serviceId ? <p>{schedule?.services.find(service => service.id === serviceId)?.description}</p> : null}
        <label>Available time<select required value={slotId} onChange={event => {setSlotId(event.target.value); setHoldRequest("");}}><option value="">Choose a time</option>{slots.map(slot => <option key={slot.id} value={slot.id}>{formatAppointment(slot)}</option>)}</select></label>
        {serviceId && !slots.length ? <p>{schedule?.nextCursor ? "No available places for this service in these results. Load more times or refresh." : "No published places are available for this service. Refresh times or contact the clinic."}</p> : null}
        {schedule && !schedule.enabled ? <p>The clinic changed its booking settings. Close this form and refresh the directory before requesting.</p> : null}
        <div className={styles.actions}><button type="button" className={styles.primary} disabled={!slotId || !petId || !schedule?.enabled} onClick={() => void reserve()}>Hold this time</button><button type="button" className={styles.secondary} onClick={() => void load()}>Refresh times</button>{schedule?.nextCursor ? <button type="button" className={styles.secondary} onClick={() => void load(schedule.nextCursor!)}>Load more times</button> : null}</div>
      </fieldset>
    </> : <section ref={heldPanel} tabIndex={-1} className={styles.notice} aria-label="Your held time"><h3>{hold.slot.service.name}</h3><p>{pets.find(pet => pet.id === petId)?.name} · {formatAppointment(hold.slot)} · {hold.slot.service.durationMinutes} minutes</p><p role="status" aria-live={remaining ? "off" : "polite"}>{remaining ? `Time held for ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}. Send your request before it ends.` : "Your hold expired. Choose a time again; your reason and consent are kept."}</p><button type="button" className={styles.secondary} disabled={busy} onClick={() => void chooseAgain()}>Choose another time</button></section>}
    <label>Reason for visit<textarea required minLength={3} maxLength={1000} value={visitReason} disabled={busy} onChange={event => setVisitReason(event.target.value)} /></label>
    <label className={styles.consent}><input type="checkbox" required checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>I agree to share my name, contact phone, pet name and species, visit reason, service and selected time with this clinic to handle my request.</span></label>
    <div className={styles.actions}><button className={styles.primary} disabled={busy || !hold || !remaining}>{busy ? "Saving…" : "Send appointment request"}</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => void close()}>Close request</button></div>
  </form>;
}
