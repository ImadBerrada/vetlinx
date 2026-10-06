"use client";
import {useEffect, useRef, useState, type FormEvent} from "react";
import type {ApiClinicResource} from "@/lib/server/vetlinx-api";
import styles from "./Consumer.module.css";

const kinds = {ROOM: "Room", EQUIPMENT: "Equipment", CARE_TEAM: "Care team"};
export function ClinicResources({resources, canManage, disabled, onCreate, onChange}: {resources: ApiClinicResource[]; canManage: boolean; disabled: boolean; onCreate: (body: object) => Promise<boolean>; onChange: (item: ApiClinicResource, active: boolean) => Promise<boolean>}) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (await onCreate({id: requestId, name: data.get("name"), kind: data.get("kind")})) {setRequestId(crypto.randomUUID()); form.reset(); requestAnimationFrame(() => form.querySelector<HTMLInputElement>('input[name="name"]')?.focus());}
  }
  return <section aria-label="Clinic resources"><h3>Shared clinic resources</h3><p>Reserve rooms, equipment or a care team across services. Each selected resource is reserved for the whole time block, including all of its places. These details are visible only to your clinic team.</p>
    {!resources.length ? <p>No resources added yet. Resource assignment is optional for existing times.</p> : resources.map(item => <ResourceRow key={item.id} item={item} disabled={disabled} canManage={canManage} onChange={onChange} />)}
    {canManage ? <form className={styles.form} aria-label="Add clinic resource" onSubmit={create}><fieldset className={styles.timeChangeFields} disabled={disabled}><div className={styles.row}><label>Resource name<input name="name" required minLength={2} maxLength={120} placeholder="Consultation room 1" /></label><label>Resource type<select name="kind" defaultValue="ROOM"><option value="ROOM">Room</option><option value="EQUIPMENT">Equipment</option><option value="CARE_TEAM">Care team</option></select></label></div><button className={styles.primary}>Add resource</button></fieldset></form> : null}
  </section>;
}
function ResourceRow({item, disabled, canManage, onChange}: {item: ApiClinicResource; disabled: boolean; canManage: boolean; onChange: (item: ApiClinicResource, active: boolean) => Promise<boolean>}) {
  const [confirm, setConfirm] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {if (confirm) confirmButton.current?.focus();}, [confirm]);
  return <article className={styles.requestForm}><h4>{item.name} · {kinds[item.kind]} · {item.active ? "Available" : "Retired"}</h4>{canManage ? <>
    <button ref={trigger} className={styles.secondary} disabled={disabled} onClick={() => item.active ? setConfirm(true) : void onChange(item, true)}>{item.active ? `Retire ${item.name}` : `Reactivate ${item.name}`}</button>
    {confirm ? <div className={styles.confirmAppointment}><p>Retire {item.name}? Close unused times and release their resources first. Upcoming or ongoing reservations prevent retirement. Existing records are kept.</p><div className={styles.actions}><button ref={confirmButton} className={styles.primary} disabled={disabled} onClick={() => void onChange(item, false).then(saved => {if (saved) {setConfirm(false); requestAnimationFrame(() => trigger.current?.focus());}})}>Confirm retirement</button><button className={styles.secondary} disabled={disabled} onClick={() => {setConfirm(false); trigger.current?.focus();}}>Keep resource</button></div></div> : null}
  </> : null}</article>;
}
