import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import styles from "./AppShell.module.css";

export function PublicNavigation({children}: {children: ReactNode}) {
  return <header className={styles.publicHeader}><div className={styles.publicHeaderInner}><Link href="/" className={styles.publicBrand} aria-label="VetLinX home"><BrandMark /></Link><nav aria-label="Public navigation">{children}</nav></div></header>;
}
