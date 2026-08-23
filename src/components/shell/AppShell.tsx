"use client";

import {
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronsUpDown,
  ClipboardCheck,
  FileBadge2,
  HelpCircle,
  Home,
  LogOut,
  Menu,
  ShieldCheck,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import type { ApiSystemRole } from "@/lib/server/vetlinx-api";
import type { ApiOrganizationMembershipSummary } from "@/lib/server/vetlinx-api";
import {
  organizationIdFromWorkspace,
  organizationWorkspace,
  readWorkspacePreference,
  writeWorkspacePreference,
  type WorkspacePreference,
} from "@/lib/workspace-preference";
import styles from "./AppShell.module.css";

interface SessionSummary {
  account?: { email: string; roles: ApiSystemRole[] };
  profile?: { displayName: string } | null;
}

interface AppShellProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  scope?: "professional" | "employer" | "review";
}

const professionalLinks = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/onboarding", label: "Professional profile", icon: UserRound },
  { href: "/credentials", label: "Credentials", icon: WalletCards },
  { href: "/portfolio", label: "Portfolio & CV", icon: FileBadge2 },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
];

const employerLinks = [
  { href: "/employer", label: "Organization", icon: Building2 },
  { href: "/employer/jobs", label: "Recruitment", icon: BriefcaseBusiness },
];

const reviewLinks = [
  { href: "/review", label: "Professional reviews", icon: ClipboardCheck },
  { href: "/review/organizations", label: "Organization reviews", icon: ShieldCheck },
];

export function AppShell({ title, description, actions, children, scope = "professional" }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [session, setSession] = useState<SessionSummary>({});
  const [organizations, setOrganizations] = useState<ApiOrganizationMembershipSummary[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspacePreference>("personal");

  useEffect(() => {
    let active = true;
    function loadSession() {
      Promise.all([
        fetch("/api/session/me", { cache: "no-store" }),
        fetch("/api/organizations", { cache: "no-store" }),
      ])
        .then(async ([sessionResponse, organizationsResponse]) => {
          if (!sessionResponse.ok) return;
          const body = (await sessionResponse.json()) as SessionSummary;
          const organizationBody = organizationsResponse.ok
            ? ((await organizationsResponse.json()) as { organizations?: ApiOrganizationMembershipSummary[] })
            : {};
          if (!active) return;
          const memberships = organizationBody.organizations ?? [];
          setSession(body);
          setOrganizations(memberships);
          const stored = readWorkspacePreference();
          const storedOrganizationId = organizationIdFromWorkspace(stored);
          if (scope === "review") setActiveWorkspace("trust");
          else if (scope === "employer") {
            const selected = memberships.find((item) => item.organization.id === storedOrganizationId) ?? memberships[0];
            setActiveWorkspace(selected ? organizationWorkspace(selected.organization.id) : "personal");
          } else setActiveWorkspace("personal");
        })
        .catch(() => undefined);
    }
    loadSession();
    window.addEventListener("vetlinx:session-changed", loadSession);
    window.addEventListener("vetlinx:workspace-changed", loadSession);
    return () => {
      active = false;
      window.removeEventListener("vetlinx:session-changed", loadSession);
      window.removeEventListener("vetlinx:workspace-changed", loadSession);
    };
  }, [scope]);

  const initials = useMemo(() => {
    const source = session.profile?.displayName ?? session.account?.email ?? "VetLinX";
    return source.replace(/^dr\.?\s*/i, "").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VL";
  }, [session]);
  const roles = session.account?.roles ?? [];
  const canReview = roles.some((role) => ["REVIEWER", "OPERATIONS_ADMIN", "PLATFORM_ADMIN"].includes(role));
  const activeOrganizationId = organizationIdFromWorkspace(activeWorkspace);
  const activeOrganization = organizations.find((item) => item.organization.id === activeOrganizationId);
  const currentWorkspace = scope === "review"
    ? { label: "Trust operations", detail: "Reviewer", icon: ShieldCheck }
    : scope === "employer"
      ? { label: activeOrganization ? activeOrganization.organization.publicName ?? activeOrganization.organization.legalName : "Organization workspace", detail: activeOrganization ? humanizeRole(activeOrganization.role) : "Create or join", icon: Building2 }
      : { label: session.profile?.displayName ?? "Personal workspace", detail: "Professional", icon: UserRound };
  const CurrentWorkspaceIcon = currentWorkspace.icon;
  const canRecruit = Boolean(activeOrganization && ["OWNER", "ADMIN", "RECRUITER"].includes(activeOrganization.role));

  function selectWorkspace(preference: WorkspacePreference, href: string) {
    writeWorkspacePreference(preference);
    setActiveWorkspace(preference);
    setWorkspaceOpen(false);
    setMenuOpen(false);
    router.push(href);
  }

  async function logout() {
    await fetch("/api/session/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`} aria-label="Primary navigation">
        <div className={styles.brandRow}><BrandMark inverse /><button onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X /></button></div>
        <div className={styles.workspacePicker}>
          <button className={styles.workspaceButton} type="button" aria-expanded={workspaceOpen} onClick={() => setWorkspaceOpen((open) => !open)}>
            <span className={styles.workspaceIcon}><CurrentWorkspaceIcon /></span>
            <span><strong>{currentWorkspace.label}</strong><small>{currentWorkspace.detail}</small></span>
            <ChevronsUpDown />
          </button>
          {workspaceOpen ? <div className={styles.workspaceMenu} role="menu" aria-label="Switch workspace">
            <WorkspaceOption active={scope === "professional"} icon={UserRound} label={session.profile?.displayName ?? "Personal workspace"} detail={session.profile ? "Professional" : "Setup required"} onSelect={() => selectWorkspace("personal", session.profile ? "/" : "/onboarding")} />
            {organizations.map((membership) => {
              const label = membership.organization.publicName ?? membership.organization.legalName;
              return <WorkspaceOption key={membership.organization.id} active={scope === "employer" && membership.organization.id === activeOrganizationId} icon={Building2} label={label} detail={humanizeRole(membership.role)} onSelect={() => selectWorkspace(organizationWorkspace(membership.organization.id), "/employer")} />;
            })}
            {!organizations.length ? <WorkspaceOption active={false} icon={Building2} label="Organization workspace" detail="Create or join" onSelect={() => selectWorkspace("personal", "/employer")} /> : null}
            {canReview ? <WorkspaceOption active={scope === "review"} icon={ShieldCheck} label="Trust operations" detail="Reviewer" onSelect={() => selectWorkspace("trust", "/review")} /> : null}
          </div> : null}
        </div>
        {scope === "professional" ? <NavGroup label="Professional" links={professionalLinks} pathname={pathname} /> : null}
        {scope === "employer" ? <NavGroup label="Employer" links={canRecruit ? employerLinks : employerLinks.slice(0, 1)} pathname={pathname} /> : null}
        {scope === "review" && canReview ? <NavGroup label="Trust operations" links={reviewLinks} pathname={pathname} /> : null}
        <div className={styles.sidebarFoot}>
          <a href="mailto:support@vetlinx.com"><HelpCircle />Help & support</a>
          <button onClick={logout}><LogOut />Sign out</button>
          <div className={styles.identity}><span>{initials}</span><div><strong>{session.profile?.displayName ?? "VetLinX member"}</strong><small>{session.account?.email ?? "Secure workspace"}</small></div></div>
        </div>
      </aside>
      {menuOpen ? <button className={styles.scrim} onClick={() => setMenuOpen(false)} aria-label="Close navigation" /> : null}
      <div className={styles.stage}>
        <header className={styles.topbar}>
          <button className={styles.menuButton} onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu /></button>
          <div className={styles.titleBlock}><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>
          <div className={styles.topActions}>{actions}<NotificationCenter /><span className={styles.topIdentity}>{initials}</span></div>
        </header>
        <main className={styles.content}>
          {actions ? <div className={styles.mobileActions}>{actions}</div> : null}
          {children}
        </main>
      </div>
    </div>
  );
}

function WorkspaceOption({ active, icon: Icon, label, detail, onSelect }: { active: boolean; icon: typeof UserRound; label: string; detail: string; onSelect: () => void }) {
  return <button type="button" role="menuitem" aria-label={`${label}, ${detail}`} onClick={onSelect} className={`${styles.workspaceOption} ${active ? styles.workspaceOptionActive : ""}`}>
    <span className={styles.optionIcon}><Icon /></span>
    <span><strong>{label}</strong><small>{detail}</small></span>
    {active ? <Check className={styles.optionCheck} /> : null}
  </button>;
}

function humanizeRole(role: string) {
  return role.toLowerCase().replace(/(^|_)\w/g, (value) => value.replace("_", " ").toUpperCase());
}

function NavGroup({ label, links, pathname }: { label: string; links: typeof professionalLinks; pathname: string }) {
  return (
    <section className={styles.navGroup}>
      <p>{label}</p>
      <nav>
        {links.map(({ href, label: itemLabel, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} className={active ? styles.active : ""} aria-current={active ? "page" : undefined}><Icon />{itemLabel}</Link>;
        })}
      </nav>
    </section>
  );
}
