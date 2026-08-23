"use client";

import { BadgeCheck, BellRing, CircleAlert, Info, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ApiNotification } from "@/lib/server/vetlinx-api";
import styles from "./NotificationCenter.module.css";

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/notifications", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { notifications?: ApiNotification[] };
        if (active && response.ok) {
          setNotifications((body.notifications ?? []).filter((item) => item.status === "UNREAD"));
        }
      })
      .catch(() => null);
    return () => { active = false; };
  }, []);

  async function dismiss(notificationId: string) {
    const response = await fetch(`/api/notifications/${notificationId}/read`, { method: "POST" }).catch(() => null);
    if (response?.ok) setNotifications((current) => current.filter((item) => item.id !== notificationId));
  }

  if (!notifications.length) return null;

  return (
    <section className={styles.center} aria-label="Unread notifications">
      <header><BellRing /><strong>Updates to your trusted record</strong><span>{notifications.length}</span></header>
      {notifications.slice(0, 3).map((item) => {
        const positive = item.kind === "CREDENTIAL_VERIFIED" || item.kind === "ORGANIZATION_VERIFIED";
        const negative = item.kind === "CREDENTIAL_REJECTED" || item.kind === "ORGANIZATION_REJECTED";
        const Icon = positive ? BadgeCheck : negative ? CircleAlert : Info;
        return <article key={item.id} className={negative ? styles.negative : positive ? styles.positive : ""}>
          <Icon />
          <div><strong>{item.title}</strong><p>{item.message}</p><time>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></div>
          <button onClick={() => dismiss(item.id)} aria-label={`Mark ${item.title} as read`}><X /></button>
        </article>;
      })}
    </section>
  );
}
