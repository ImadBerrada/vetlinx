"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, MapPin, ShieldCheck } from "lucide-react";
import { PublicNavigation } from "@/components/shell/PublicNavigation";
import { AppShell } from "@/components/shell/AppShell";
import { CountrySelect, countryName } from "@/components/forms/CountrySelect";
import { authEntryHref, withReturnTo } from "@/lib/auth-navigation";
import { apiFetch, ApiRequestError } from "@/lib/client-api";
import type { ApiClinic, ApiPet } from "@/lib/server/vetlinx-api";
import styles from "./Consumer.module.css";
import { appointmentTimeToUtc } from "@/lib/appointment-time";
import { ScheduledAppointmentRequest } from "./ScheduledAppointmentRequest";

function subscribeToLocation(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener("vetlinx:directory-location-changed", callback);
  return () => { window.removeEventListener("popstate", callback); window.removeEventListener("vetlinx:directory-location-changed", callback); };
}

function websiteHref(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export function ClinicDirectory({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const locationSearch = useSyncExternalStore(subscribeToLocation, () => window.location.search, () => "");
  const locationParams = new URLSearchParams(locationSearch);
  const filterParams = new URLSearchParams();
  for (const key of ["q", "countryCode", "city"]) { const value = locationParams.get(key)?.trim(); if (value) filterParams.set(key, value); }
  const query = filterParams.toString();
  const clinicId = locationParams.get("clinic");
  const [clinics, setClinics] = useState<ApiClinic[]>([]);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<ApiClinic | null>(null);
  const [pets, setPets] = useState<ApiPet[]>([]);
  const [requestId, setRequestId] = useState("");
  const requestPanel = useRef<HTMLElement>(null);
  const loading = loadedQuery !== query;
  const detailClinic = !loading ? clinics.find((clinic) => clinic.id === clinicId) : null;

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ clinics: ApiClinic[] }>(`/api/clinics?${query}`, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) { setClinics(data.clinics); setLoadedQuery(query); }
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : "Clinics could not be loaded."); setLoadedQuery(query); }
    });
    return () => controller.abort();
  }, [query]);

  useEffect(() => { if (selected) requestPanel.current?.focus(); }, [selected]);

  function updateLocation(params: URLSearchParams) {
    window.history.replaceState(window.history.state, "", `/clinics${params.size ? `?${params}` : ""}`);
    window.dispatchEvent(new Event("vetlinx:directory-location-changed"));
  }

  function returnToClinic(clinic: ApiClinic) {
    const params = new URLSearchParams(query);
    params.set("clinic", clinic.id);
    return `/clinics?${params}`;
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["q", "countryCode", "city"]) { const value = String(form.get(key) ?? "").trim(); if (value) params.set(key, value); }
    setError(""); setNotice(""); setSelected(null); updateLocation(params);
  }

  function resetFilters() {
    setError(""); setNotice(""); setSelected(null); updateLocation(new URLSearchParams());
  }

  async function openRequest(clinic: ApiClinic) {
    const returnTo = returnToClinic(clinic);
    if (!signedIn) { router.push(authEntryHref("login", { intent: "owner", returnTo })); return; }
    updateLocation(new URLSearchParams(returnTo.split("?")[1]));
    setPending(true); setError(""); setNotice("");
    try {
      // Load private pet information only after the owner chooses Request appointment.
      const data = await apiFetch<{ pets: ApiPet[] }>("/api/pets");
      setPets(data.pets); setSelected(clinic); setRequestId(crypto.randomUUID());
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 401) router.push(authEntryHref("login", { intent: "owner", returnTo }));
      else if (failure instanceof ApiRequestError && failure.status === 404) router.push(withReturnTo("/owner/onboarding", returnTo));
      else setError(failure instanceof Error ? failure.message : "Your pets could not be loaded.");
    } finally { setPending(false); }
  }

  async function requestAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startsAt = appointmentTimeToUtc(String(data.get("startsAt")), timeZone);
      if (new Date(startsAt).getTime() <= Date.now()) throw new Error("Choose a date and time in the future.");
      await apiFetch("/api/appointments", { method: "POST", body: JSON.stringify({ requestId, organizationId: selected.id, petId: data.get("petId"), startsAt, timeZone, visitReason: data.get("visitReason"), sharingConsent: data.get("sharingConsent") === "on" }) });
      setSelected(null); setNotice("Your request has been sent. The clinic must confirm the time before your appointment is booked.");
      window.dispatchEvent(new Event("vetlinx:session-changed"));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Appointment could not be requested."); }
    finally { setPending(false); }
  }

  const content = <>
    {!signedIn ? <section className={styles.hero}><span className={styles.eyebrow}>Trusted veterinary organizations</span><h1>Find a clinic for your pet</h1><p>Browse clinics and hospitals whose organization identity has been verified. Each clinic confirms your requested time directly.</p></section> : <p className={styles.muted}>Browse verified clinic organizations accepting requests. A request becomes an appointment only after the clinic confirms it.</p>}
    <form className={styles.search} onSubmit={search} key={query}><label>Clinic name<input name="q" maxLength={120} placeholder="Search clinics" defaultValue={filterParams.get("q") ?? ""} /></label><label>Country<CountrySelect name="countryCode" includeAll defaultValue={filterParams.get("countryCode") ?? ""} /></label><label>City<input name="city" maxLength={120} placeholder="Dubai" defaultValue={filterParams.get("city") ?? ""} /></label><button className={styles.primary} disabled={pending}>Search clinics</button></form>
    {query ? <button type="button" className={styles.secondary} disabled={pending} onClick={resetFilters}>Clear filters</button> : null}
    {error ? <p className={styles.error} role="alert">{error} {!selected ? <button className={styles.secondary} onClick={() => window.location.reload()}>Try again</button> : " Your form is kept below so you can try again."}</p> : null}
    {notice ? <div className={styles.notice} role="status">{notice} <Link href="/owner">View my requests</Link></div> : null}
    {detailClinic && !selected ? <section className={`${styles.panel} ${styles.inlineForm}`} aria-label="Selected clinic"><span className={styles.badge}><ShieldCheck />Organization identity verified</span><h2>Clinic details: {detailClinic.publicName ?? detailClinic.legalName}</h2><p><MapPin size={15} /> {[detailClinic.addressLine1, detailClinic.city, countryName(detailClinic.countryCode)].filter(Boolean).join(", ")}</p>{detailClinic.phone ? <p><a href={`tel:${detailClinic.phone.replace(/[^\d+]/g, "")}`}>Call {detailClinic.phone}</a></p> : null}{websiteHref(detailClinic.website) ? <p><a href={websiteHref(detailClinic.website)!} target="_blank" rel="noopener noreferrer">Visit clinic website</a></p> : null}<p>This clinic accepts requests and confirms availability directly. Organization verification does not establish practitioner licences or available appointment slots.</p><button className={styles.primary} disabled={pending} onClick={() => void openRequest(detailClinic)}>{signedIn ? "Request appointment" : "Sign in to request"}</button></section> : null}
    {clinicId && !loading && !detailClinic && !selected && !error ? <div className={styles.notice}>Your selected clinic is not in these results. It may no longer accept requests. Clear filters or choose another clinic.</div> : null}
    {selected ? <section ref={requestPanel} tabIndex={-1} className={`${styles.panel} ${styles.inlineForm}`} aria-label="Request appointment"><h2>Request a time at {selected.publicName ?? selected.legalName}</h2>{!pets.length ? <><p>Add a pet before requesting an appointment. Your clinic selection will be kept.</p><Link className={styles.primary} href={withReturnTo("/owner", returnToClinic(selected))}>Add my pet</Link><button className={styles.secondary} onClick={() => setSelected(null)}>Close</button></> : selected.appointmentSchedulingEnabled ? <ScheduledAppointmentRequest key={selected.id} clinic={selected} pets={pets} onPending={setPending} onClose={() => setSelected(null)} onBooked={() => { setSelected(null); setNotice("Your request has been sent. The clinic must confirm the time before your appointment is booked."); window.dispatchEvent(new Event("vetlinx:session-changed")); }} /> : <form className={styles.form} onSubmit={requestAppointment}><div className={styles.row}><label>Pet<select name="petId" required defaultValue=""><option value="" disabled>Choose your pet</option>{pets.map((pet) => <option value={pet.id} key={pet.id}>{pet.name} · {pet.speciesCode.toLowerCase()}</option>)}</select></label><label>Preferred date and time<input name="startsAt" type="datetime-local" required /></label></div><p className={styles.muted}>Your time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. The clinic must confirm this requested time.</p><label>Reason for visit<textarea name="visitReason" required minLength={3} maxLength={1000} placeholder="Routine check-up, vaccination, or another reason for your visit" /></label><label className={styles.consent}><input name="sharingConsent" type="checkbox" required /><span>I agree to share my name, contact phone, pet name and species, visit reason, and requested time with this clinic so it can handle my appointment request.</span></label><div className={styles.actions}><button className={styles.primary} disabled={pending}>{pending ? "Sending…" : "Send appointment request"}</button><button type="button" className={styles.secondary} disabled={pending} onClick={() => setSelected(null)}>Cancel</button></div></form>}</section> : null}
    {loading ? <p className={styles.loading} role="status">Loading verified clinics…</p> : !error && !clinics.length ? <div className={styles.empty}><Building2 /><h3>{query ? "No clinics match your search" : "No clinics are accepting requests yet"}</h3><p>{query ? "Try another city or country, or clear your filters." : "Verified clinic organizations appear here when they enable appointment requests."}</p>{query ? <button className={styles.secondary} onClick={resetFilters}>Show all clinics</button> : null}</div> : <div className={styles.grid}>{clinics.map((clinic) => <article className={styles.card} key={clinic.id}><span className={styles.badge}><ShieldCheck />Organization identity verified</span><h2>{clinic.publicName ?? clinic.legalName}</h2><p><MapPin size={15} /> {[clinic.addressLine1, clinic.city, countryName(clinic.countryCode)].filter(Boolean).join(", ")}</p>{clinic.phone ? <p>Phone: {clinic.phone}</p> : null}<div className={styles.actions}><button className={styles.secondary} disabled={pending} onClick={() => updateLocation(new URLSearchParams(returnToClinic(clinic).split("?")[1]))}>Clinic details</button><button className={styles.primary} disabled={pending} onClick={() => void openRequest(clinic)}>{signedIn ? "Request appointment" : "Sign in to request"}</button></div></article>)}</div>}
  </>;
  return signedIn ? <AppShell scope="owner" title="Find a clinic for your pet" description="Your Pet owner workspace — discover clinics and request care.">{content}</AppShell> : <><PublicNavigation><Link href={authEntryHref("register", { intent: "owner", returnTo: `/clinics${locationSearch}` })}>Create account</Link><Link href={authEntryHref("login", { intent: "owner", returnTo: `/clinics${locationSearch}` })}>Sign in</Link></PublicNavigation><main className={styles.page}>{content}</main></>;
}
