"use client";

import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  PawPrint,
  Check,
  ChevronsUpDown,
  ClipboardCheck,
  FileBadge2,
  HelpCircle,
  Home,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Settings,
  Bell,
  Activity,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
  owner?: { displayName: string } | null;
  organizations?: ApiOrganizationMembershipSummary[];
}

interface AppShellProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  scope?: "professional" | "employer" | "review" | "owner";
}

const professionalLinks = [
  { href: "/professional", label: "Home", icon: Home },
  { href: "/onboarding", label: "Professional profile", icon: UserRound },
  { href: "/credentials", label: "Credentials", icon: WalletCards },
  { href: "/portfolio", label: "Portfolio & CV", icon: FileBadge2 },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/applications", label: "My applications", icon: ClipboardCheck },
];

const employerLinks = [
  { href: "/employer", label: "Organization", icon: Building2 },
  { href: "/employer/jobs", label: "Recruitment", icon: BriefcaseBusiness },
];

const reviewLinks = [
  { href: "/review", label: "Professional reviews", icon: ClipboardCheck },
  { href: "/review/credentials", label: "Credential validity", icon: WalletCards },
  { href: "/review/organizations", label: "Organization reviews", icon: ShieldCheck },
];

const ownerLinks = [
  { href: "/owner", label: "My pets & appointments", icon: PawPrint },
  { href: "/clinics", label: "Find a clinic", icon: Building2 },
  { href: "/owner/onboarding", label: "Owner profile", icon: UserRound },
];

const mobileQuery = "(max-width: 860px)";
function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function subscribeToNavigation(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("vetlinx:navigation-changed", onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener("vetlinx:navigation-changed", onChange); };
}
function readCollapsedNavigation() {
  try { return window.localStorage.getItem("vetlinx:navigation-collapsed") === "true"; } catch { return false; }
}
function setCollapsedNavigation(value: boolean) {
  try { window.localStorage.setItem("vetlinx:navigation-collapsed", String(value)); } catch { return; }
  window.dispatchEvent(new Event("vetlinx:navigation-changed"));
}

export function AppShell({ title, description, actions, children, scope = "professional" }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [session, setSession] = useState<SessionSummary>({});
  const [organizations, setOrganizations] = useState<ApiOrganizationMembershipSummary[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspacePreference>("personal");
  const isMobile = useSyncExternalStore(subscribeToViewport, () => window.matchMedia(mobileQuery).matches, () => false);
  const collapsed = useSyncExternalStore(subscribeToNavigation, readCollapsedNavigation, () => false);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawerTrigger = useRef<HTMLButtonElement | null>(null);
  const workspaceButton = useRef<HTMLButtonElement>(null);
  const mobileWorkspaceButton = useRef<HTMLButtonElement>(null);
  const workspaceMenu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia(mobileQuery);
    function resetDrawer() { setMenuOpen(false); setWorkspaceOpen(false); }
    query.addEventListener("change", resetDrawer);
    return () => query.removeEventListener("change", resetDrawer);
  }, []);

  useEffect(() => {
    if (!isMobile || !menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      if (!sidebar.current?.contains(document.activeElement)) (workspaceMenu.current?.querySelector<HTMLButtonElement>("button") ?? sidebar.current?.querySelector<HTMLButtonElement>("button"))?.focus();
    });
    function drawerKeys(event: KeyboardEvent) {
      if (event.key === "Escape") { setMenuOpen(false); setWorkspaceOpen(false); return; }
      if (event.key !== "Tab") return;
      const items = Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []).filter(item => item.getClientRects().length > 0);
      const first = items[0]; const last = items.at(-1);
      if (!sidebar.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", drawerKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", drawerKeys);
      // A desktop resize makes the mobile trigger invisible; leave focus in the visible rail.
      const trigger = drawerTrigger.current;
      window.requestAnimationFrame(() => { if (trigger?.getClientRects().length) trigger.focus(); });
    };
  }, [isMobile, menuOpen]);

  useEffect(() => {
    if (!workspaceOpen) return;
    workspaceMenu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setWorkspaceOpen(false);
      if (window.matchMedia("(max-width: 860px)").matches) {
        setMenuOpen(false);
        mobileWorkspaceButton.current?.focus();
      } else workspaceButton.current?.focus();
    }
    document.addEventListener("keydown", closeOnEscape);
    function closeOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (workspaceMenu.current?.contains(target) || workspaceButton.current?.contains(target) || mobileWorkspaceButton.current?.contains(target)) return;
      setWorkspaceOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => { document.removeEventListener("keydown", closeOnEscape); document.removeEventListener("pointerdown", closeOutside); };
  }, [workspaceOpen]);

  useEffect(() => {
    let active = true;
    function loadSession() {
      fetch("/api/session/me", { cache: "no-store" })
        .then(async (sessionResponse) => {
          if (!sessionResponse.ok) return;
          const body = (await sessionResponse.json()) as SessionSummary;
          if (!active) return;
          const memberships = body.organizations ?? [];
          setSession(body);
          setOrganizations(memberships);
          const stored = readWorkspacePreference();
          const storedOrganizationId = organizationIdFromWorkspace(stored);
          if (scope === "owner") setActiveWorkspace("owner");
          else if (scope === "review") setActiveWorkspace("trust");
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
    const source = (scope === "owner" ? session.owner?.displayName : session.profile?.displayName) ?? session.account?.email ?? "VetLinX";
    return source.replace(/^dr\.?\s*/i, "").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VL";
  }, [session, scope]);
  const roles = session.account?.roles ?? [];
  const canReview = roles.some((role) => ["REVIEWER", "OPERATIONS_ADMIN", "PLATFORM_ADMIN"].includes(role));
  const canOperate = roles.some((role) => ["OPERATIONS_ADMIN", "PLATFORM_ADMIN"].includes(role));
  const activeOrganizationId = organizationIdFromWorkspace(activeWorkspace);
  const activeOrganization = organizations.find((item) => item.organization.id === activeOrganizationId);
  const currentWorkspace = scope === "owner"
    ? { label: "Pet owner", detail: session.owner?.displayName ?? "Set up your profile", icon: PawPrint }
    : scope === "review"
    ? { label: "Trust operations", detail: "Reviewer", icon: ShieldCheck }
    : scope === "employer"
      ? { label: activeOrganization ? activeOrganization.organization.publicName ?? activeOrganization.organization.legalName : "Organization workspace", detail: activeOrganization ? humanizeRole(activeOrganization.role) : "Create or join", icon: Building2 }
      : { label: "Professional", detail: session.profile?.displayName ?? "Set up your profile", icon: UserRound };
  const CurrentWorkspaceIcon = currentWorkspace.icon;
  const canRecruit = Boolean(activeOrganization && ["OWNER", "ADMIN", "RECRUITER"].includes(activeOrganization.role));
  const canCare = Boolean(activeOrganization && ["CLINIC", "HOSPITAL"].includes(activeOrganization.organization.type) && ["OWNER", "ADMIN", "STAFF"].includes(activeOrganization.role));
  const organizationLinks = [employerLinks[0], ...(canRecruit ? [employerLinks[1]] : []), ...(canCare ? [{ href: "/employer/appointments", label: "Appointments", icon: CalendarDays }] : [])];

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

  function closeNavigation() { setMenuOpen(false); setWorkspaceOpen(false); }

  return (
    <div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ""}`}>
      <a className="vl-skip-link" href="#workspace-content" inert={isMobile && menuOpen}>Skip to main content</a>
      <aside ref={sidebar} id="primary-navigation" className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`} inert={isMobile && !menuOpen} role={isMobile && menuOpen ? "dialog" : undefined} aria-modal={isMobile && menuOpen ? true : undefined} aria-label="Primary navigation" onClick={(event) => { if ((event.target as HTMLElement).closest("a[href]")) closeNavigation(); }}>
        <div className={styles.brandRow}><BrandMark inverse /><button onClick={closeNavigation} aria-label="Close navigation"><X /></button></div>
        <div className={styles.workspacePicker}>
          <button ref={workspaceButton} className={styles.workspaceButton} type="button" title={`Switch workspace: ${currentWorkspace.label}`} aria-label={`Switch workspace: ${currentWorkspace.label}`} aria-controls="workspace-switcher" aria-expanded={workspaceOpen} onClick={() => { if (!isMobile && collapsed) setCollapsedNavigation(false); setWorkspaceOpen((open) => !open); }}>
            <span className={styles.workspaceIcon}><CurrentWorkspaceIcon /></span>
            <span><strong>{currentWorkspace.label}</strong><small>{currentWorkspace.detail}</small></span>
            <ChevronsUpDown />
          </button>
          {workspaceOpen ? <div id="workspace-switcher" ref={workspaceMenu} className={styles.workspaceMenu} role="menu" aria-label="Switch workspace" onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }}>
            <WorkspaceOption active={scope === "professional"} icon={UserRound} label="Professional" detail={session.profile?.displayName ?? "Set up"} onSelect={() => selectWorkspace("personal", session.profile ? "/professional" : "/onboarding")} />
            <WorkspaceOption active={scope === "owner"} icon={PawPrint} label="Pet owner" detail={session.owner?.displayName ?? "Set up"} onSelect={() => selectWorkspace("owner", session.owner ? "/owner" : "/owner/onboarding")} />
            {organizations.map((membership) => {
              const label = membership.organization.publicName ?? membership.organization.legalName;
              return <WorkspaceOption key={membership.organization.id} active={scope === "employer" && membership.organization.id === activeOrganizationId} icon={Building2} label={label} detail={humanizeRole(membership.role)} onSelect={() => selectWorkspace(organizationWorkspace(membership.organization.id), "/employer")} />;
            })}
            <WorkspaceOption active={false} icon={Building2} label="Add or join an organization" detail="Organization workspace" onSelect={() => selectWorkspace("personal", "/employer")} />
            {canReview ? <WorkspaceOption active={scope === "review"} icon={ShieldCheck} label="Trust operations" detail="Reviewer" onSelect={() => selectWorkspace("trust", "/review")} /> : null}
          </div> : null}
        </div>
        {scope === "professional" ? <NavGroup label="Professional" links={professionalLinks} pathname={pathname} /> : null}
        {scope === "owner" ? <NavGroup label="Pet care" links={ownerLinks} pathname={pathname} /> : null}
        {scope === "employer" ? <NavGroup label="Organization" links={organizationLinks} pathname={pathname} /> : null}
        {scope === "review" && canReview ? <NavGroup label="Trust operations" links={reviewLinks} pathname={pathname} /> : null}
        <div className={styles.sidebarFoot}>
          <Link href="/settings/security" aria-label="Settings & security" title="Settings & security"><Settings /><span>Settings & security</span></Link>
          <Link href="/settings/notifications" aria-label="Notification preferences" title="Notification preferences"><Bell /><span>Notification preferences</span></Link>
          {canOperate ? <Link href="/operations/delivery" aria-label="Delivery operations" title="Delivery operations"><Activity /><span>Delivery operations</span></Link> : null}
          <a href="mailto:support@vetlinx.com" aria-label="Help & support" title="Help & support"><HelpCircle /><span>Help & support</span></a>
          <button onClick={logout} aria-label="Sign out" title="Sign out"><LogOut /><span>Sign out</span></button>
          <div className={styles.identity}><span>{initials}</span><div><strong>{(scope === "owner" ? session.owner?.displayName : session.profile?.displayName) ?? session.owner?.displayName ?? "VetLinX member"}</strong><small>{session.account?.email ?? "Secure workspace"}</small></div></div>
        </div>
      </aside>
      {menuOpen ? <button className={styles.scrim} onClick={closeNavigation} tabIndex={-1} aria-hidden="true" /> : null}
      <div className={styles.stage} inert={isMobile && menuOpen}>
        <header className={styles.topbar}>
          <button ref={menuButton} className={styles.menuButton} onClick={() => { drawerTrigger.current = menuButton.current; setMenuOpen(true); }} aria-label="Open navigation" aria-expanded={isMobile && menuOpen} aria-controls="primary-navigation"><Menu /></button>
          <button className={styles.collapseButton} onClick={() => { setWorkspaceOpen(false); setCollapsedNavigation(!collapsed); }} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} title={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} aria-controls="primary-navigation">{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
          <button ref={mobileWorkspaceButton} className={styles.mobileWorkspaceButton} aria-label={`Switch workspace: ${currentWorkspace.label}`} aria-expanded={workspaceOpen} aria-controls="workspace-switcher" onClick={() => { drawerTrigger.current = mobileWorkspaceButton.current; setMenuOpen(true); setWorkspaceOpen(true); }}><CurrentWorkspaceIcon /><span>{currentWorkspace.label}</span><ChevronsUpDown /></button>
          <div className={styles.titleBlock}><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>
          <div className={styles.topActions}><div className={styles.desktopActions}>{actions}</div><NotificationCenter /><span className={styles.topIdentity} aria-label="Current account">{initials}</span></div>
        </header>
        <main id="workspace-content" tabIndex={-1} className={styles.content}>
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
          const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`) && !links.some((link) => link.href !== href && (pathname === link.href || pathname.startsWith(`${link.href}/`))));
          return <Link key={href} href={href} className={active ? styles.active : ""} aria-label={itemLabel} title={itemLabel} aria-current={active ? "page" : undefined}><Icon /><span>{itemLabel}</span></Link>;
        })}
      </nav>
    </section>
  );
}
