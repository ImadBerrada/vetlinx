"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiRequestError } from "@/lib/client-api";
import { appointmentTimeInput, appointmentTimeToUtc } from "@/lib/appointment-time";
import type { ApiAppointmentSlot, ApiClinicSchedule, ApiClinicService, ApiClinicResource } from "@/lib/server/vetlinx-api";
import { ClinicResources } from "./ClinicResources";
import { formatAppointment } from "./AppointmentList";
import styles from "./Consumer.module.css";

export function ClinicSchedule({ organizationId, canManage }: {organizationId: string; canManage: boolean}) {
  const [schedule, setSchedule] = useState<ApiClinicSchedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [serviceRequestId, setServiceRequestId] = useState(() => crypto.randomUUID());
  const [slotRequestId, setSlotRequestId] = useState(() => crypto.randomUUID());
  const [editing, setEditing] = useState<ApiClinicService | null>(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [defaultTime] = useState(() => appointmentTimeInput(new Date(Date.now() + 86400000), timeZone));
  const load = useCallback(async (cursor?: string) => {
    const {schedule: value} = await apiFetch<{schedule: ApiClinicSchedule}>(`/api/organizations/${organizationId}/schedule${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
    setSchedule(current => cursor && current ? {...value, slots: [...current.slots, ...value.slots]} : value); setEditing(current => current ? value.services.find(service => service.id === current.id) ?? null : null); if (!cursor) setLocked(false);
  }, [organizationId]);
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<{schedule: ApiClinicSchedule}>(`/api/organizations/${organizationId}/schedule`, {signal: controller.signal}).then(result => {if (!controller.signal.aborted) setSchedule(result.schedule);}).catch(failure => {if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Scheduling could not be loaded.");});
    return () => controller.abort();
  }, [organizationId]);
  async function refresh() { setBusy(true); setError(""); try {await load();} catch (failure) {setError(failure instanceof Error ? failure.message : "Scheduling could not be refreshed.");} finally {setBusy(false);} }
  async function save(suffix: string, method: string, body: object) {
    if (busy || locked) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiFetch<{settings?: {enabled: boolean}; result?: ApiClinicService | ApiAppointmentSlot | ApiClinicResource}>(`/api/organizations/${organizationId}/schedule${suffix}`, {method, body: JSON.stringify(body)});
      setSchedule(current => {
        if (!current) return current;
        if (result.settings) return {...current, enabled: result.settings.enabled};
        const item = result.result;
        if (!item) return current;
        if ("durationMinutes" in item) return {...current, services: [...current.services.filter(service => service.id !== item.id), item]};
        if ("kind" in item) return {...current, resources: [...(current.resources ?? []).filter(resource => resource.id !== item.id), item]};
        return {...current, slots: [...current.slots.filter(slot => slot.id !== item.id), {...item, remaining: 0}]};
      });
      setNotice("Saved. Existing appointments keep their confirmed details.");
      try {await load();} catch {setLocked(true); setError("Your change was saved, but the schedule could not be refreshed. Refresh before another change.");}
      return true;
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 409) setLocked(true);
      setError(`${failure instanceof Error ? failure.message : "Your change could not be saved."} Your form is kept.${failure instanceof ApiRequestError && failure.status === 409 ? " Refresh and review the latest schedule before trying again." : ""}`);
      return false;
    } finally {setBusy(false);}
  }
  async function service(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const fields = {name: String(data.get("name")), description: String(data.get("description")), durationMinutes: Number(data.get("durationMinutes"))};
    if (await save(editing ? `/services/${editing.id}` : "/services", editing ? "PATCH" : "POST", editing ? {...fields, version: editing.version, active: editing.active} : {...fields, id: serviceRequestId})) {setServiceRequestId(crypto.randomUUID()); setEditing(null); form.reset();}
  }
  async function slot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    try {
      const startsAt = appointmentTimeToUtc(String(data.get("startsAt")), timeZone);
      if (data.getAll("resourceIds").length > 10) throw new Error("Choose up to 10 resources for this time.");
      if (await save("/slots", "POST", {id: slotRequestId, serviceId: data.get("serviceId"), startsAt, timeZone, capacity: Number(data.get("capacity")), resourceIds: data.getAll("resourceIds")})) {setSlotRequestId(crypto.randomUUID()); form.reset();}
    } catch (failure) {setError(failure instanceof Error ? failure.message : "Check the time and try again.");}
  }
  return <details className={`${styles.panel} ${styles.requestForm} ${styles.schedulePanel}`}><summary>Services and availability{schedule ? ` · ${schedule.enabled ? "Published times" : "Flexible requests"}` : ""}</summary>
    <p>Add a service, publish its times, then publish the service and enable published-time requests. Choose capacity to match your available team and allow for existing flexible appointments. Assign shared resources to prevent overlapping reservations across services.</p>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}{notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
    <button className={styles.secondary} disabled={busy} onClick={() => void refresh()}>Refresh schedule</button>
    {!schedule && !error ? <p role="status">Loading services and availability…</p> : null}
    {schedule ? <>
      <section className={styles.notice}><h3>{schedule.enabled ? "Owners choose published times" : "Owners can request a preferred time"}</h3><p>{schedule.enabled ? "New requests require a held published time. If no times are available, owners see that clearly. Your team still confirms each request." : "Flexible requests are handled by your team. Enable published times when your services and availability are ready."}</p>{canManage ? <button className={styles.secondary} disabled={busy || locked} onClick={() => void save("", "PATCH", {enabled: !schedule.enabled, expectedEnabled: schedule.enabled})}>{schedule.enabled ? "Use flexible requests" : "Use published times"}</button> : <p>An owner or administrator manages these settings.</p>}</section>
      <ClinicResources resources={schedule.resources ?? []} canManage={canManage} disabled={busy || locked} onCreate={body => save("/resources", "POST", body)} onChange={(item, active) => save(`/resources/${item.id}`, "PATCH", {version: item.version, active})} />
      <h3>Clinic services</h3>{!schedule.services.length ? <p>No services yet. Add the first service below.</p> : schedule.services.map(item => <article className={styles.requestForm} key={item.id}><h4>{item.name} · {item.durationMinutes} minutes · {item.active ? "Published" : "Draft"}</h4><p>{item.description}</p>{canManage ? <div className={styles.actions}><button className={styles.secondary} disabled={busy || locked} onClick={() => {setEditing(item); setError("");}}>Edit service</button><button className={styles.secondary} disabled={busy || locked} onClick={() => void save(`/services/${item.id}`, "PATCH", {version: item.version, active: !item.active})}>{item.active ? "Unpublish service" : "Publish service"}</button></div> : null}</article>)}
      {canManage ? <form key={editing?.id ?? "new"} className={styles.form} onSubmit={service} aria-label={editing ? "Edit clinic service" : "Add clinic service"}><h3>{editing ? `Edit ${editing.name}` : "Add a service"}</h3><fieldset className={styles.timeChangeFields} disabled={busy || locked}><label>Service name<input name="name" required minLength={3} maxLength={120} defaultValue={editing?.name ?? ""} /></label><label>Service description<textarea name="description" required minLength={3} maxLength={1000} defaultValue={editing?.description ?? ""} /></label><label>Duration in minutes<input name="durationMinutes" type="number" required min={5} max={240} defaultValue={editing?.durationMinutes ?? 30} /></label>{editing ? <p>To change duration after publishing times, add a new service. Existing appointments keep their original details.</p> : null}<div className={styles.actions}><button className={styles.primary}>{editing ? "Save service" : "Add draft service"}</button>{editing ? <button type="button" className={styles.secondary} onClick={() => setEditing(null)}>Close edit</button> : null}</div></fieldset></form> : null}
      <h3>Upcoming times</h3>{!schedule.slots.length ? <p>No times published for the next 90 days.</p> : schedule.slots.map(item => <SlotCapacity key={item.id} slot={item} resources={schedule.resources ?? []} name={schedule.services.find(service => service.id === item.serviceId)?.name ?? "Service"} disabled={busy || locked} canManage={canManage} onSave={(capacity, published, releaseResources) => save(`/slots/${item.id}`, "PATCH", {version: item.version, capacity, published, ...(releaseResources ? {releaseResources: true} : {})})} />)}
      {schedule.nextCursor ? <button className={styles.secondary} disabled={busy || locked} onClick={() => { setBusy(true); void load(schedule.nextCursor!).catch(failure => setError(failure instanceof Error ? failure.message : "More times could not be loaded.")).finally(() => setBusy(false)); }}>Load more times</button> : null}
      {canManage && schedule.services.length ? <form className={styles.form} onSubmit={slot} aria-label="Publish appointment time"><h3>Publish a time</h3><p>Dates use {timeZone}. Publish within the next 90 days. Times for the same service or reserved resource must not overlap. Assignments stay fixed for this time block.</p><fieldset className={styles.timeChangeFields} disabled={busy || locked}><label>Service<select name="serviceId" required>{schedule.services.map(item => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} minutes</option>)}</select></label><label>Available date and time<input name="startsAt" type="datetime-local" required defaultValue={defaultTime} /></label><label>Places available<input name="capacity" type="number" min={1} max={10} required defaultValue={1} /></label>{schedule.resources?.some(item => item.active) ? <fieldset className={styles.resourceChoices}><legend>Resources for this time (optional, up to 10)</legend>{schedule.resources.filter(item => item.active).map(item => <label className={styles.consent} key={item.id}><input name="resourceIds" type="checkbox" value={item.id} /><span>{item.name}</span></label>)}</fieldset> : null}<button className={styles.primary}>Publish time</button></fieldset></form> : null}
    </> : null}
  </details>;
}
function SlotCapacity({slot, name, resources, disabled, canManage, onSave}: {slot: ApiAppointmentSlot; name: string; resources: ApiClinicResource[]; disabled: boolean; canManage: boolean; onSave: (capacity: number, published: boolean, releaseResources?: boolean) => Promise<boolean>}) {
  const [draftCapacity, setDraftCapacity] = useState<number | null>(null);
  const capacity = draftCapacity ?? slot.capacity;
  async function saveCapacity() { if (await onSave(capacity, slot.published)) setDraftCapacity(null); }
  const assignedNames = (slot.resources ?? []).map(item => resources.find(resource => resource.id === item.resourceId)?.name ?? "Clinic resource");
  return <section className={styles.requestForm}><h4>{name} · {formatAppointment(slot)}</h4><p>{slot.published ? "Published" : "Closed to new requests"} · {slot.remaining} of {slot.capacity} places free · ends {formatAppointment({startsAt: slot.endsAt, timeZone: slot.timeZone})}</p>{assignedNames.length ? <p>{slot.resourcesReserved === false ? "Resources released" : "Resources reserved"}: {assignedNames.join(", ")}. Closing alone keeps reservations. Reopening checks availability again.</p> : null}{canManage ? <div className={`${styles.actions} ${styles.scheduleCapacity}`}><label>Capacity<input aria-label={`Capacity for ${name} at ${slot.startsAt}`} type="number" min={1} max={10} value={capacity} disabled={disabled} onChange={event => setDraftCapacity(Number(event.target.value))} /></label><button className={styles.secondary} disabled={disabled || !Number.isInteger(capacity) || capacity < 1 || capacity > 10} onClick={() => void saveCapacity()}>Save capacity</button><button className={styles.secondary} disabled={disabled} onClick={() => void onSave(slot.capacity, !slot.published)}>{slot.published ? "Close this time" : "Reopen this time"}</button>{!slot.published && assignedNames.length && slot.resourcesReserved !== false ? <button className={styles.secondary} disabled={disabled} onClick={() => void onSave(slot.capacity, false, true)}>Release unused resources</button> : null}</div> : null}</section>;
}
