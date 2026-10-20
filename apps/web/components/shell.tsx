'use client';
/**
 * CP-6 B80 §SH — THE APPLICATION SHELL (F-P7-E-01: UX-09-001…005, UX-11-001…005, UX-15-001…005, CMP-009/011/012/013/014/015/016, PAT-25/26).
 * One shell for the eight workspaces (the seven layouts are thin wrappers that keep their own `useShell()` and role flags):
 *
 *   AppShell          session check → the server's answer about who this is (whoAmI) → the working domain (B18) → the health poll and the
 *                     DegradedBanner → the banner (tenant, domain, roles, Sign out) → the context bar slot (§CB) → the rail → main. FAIL
 *                     CLOSED: nothing of a workspace renders until the server has said which scope this is; an unverifiable state offers the
 *                     last verified location and the way back to sign-in. The admin workspace is PLATFORM (no whoAmI, as before).
 *   WorkspaceRail     ONE rail per shell from the registry's spec; its accessible name is the hosted suites' contract (WORKSPACE_NAV_NAMES);
 *                     exactly one item is current; it collapses to its glyphs below 1024px (globals.css), labels kept for screen readers.
 *   WorkspaceHeader   a page's own header (its one h1, its scope, its status and its actions) — beside B107's LoopStageHeader, not in it.
 *   Breadcrumb        nav "Breadcrumb", the current page aria-current (never a link); names where a page is, never what may be done there.
 *   TabSet            ARIA tabs with roving focus (mirrored under RTL).
 *   HistoryNavigator  the tab's own back stack, the recent places, the last verified location, the person's SAVED place (the server's —
 *                     read when the panel opens, saved only when the person asks: `shell.navigation.save`), a copyable link. Rendered only
 *                     while open, so nothing of it competes with a page's own names.
 *   CommandPalette    Ctrl/⌘+K: B81 §SI's modes — Go to · Search · Ask · Command; it navigates or hands a command off to its page's Command
 *                     Review — it executes nothing (the page's governed control acts).
 *
 * THE BOUNDARY (PR-05-003, UX-09-004, UX-11-004, UX-15-004): the shell READS (identity.self.read, shell.navigation.read, prediction.read) and
 * writes nothing but the person's own navigation state when asked; navigation, dismissal and a link change presentation and focus only.
 * Rendering is proven by the walks; the contract is lib/shell-b80.ts (tested). THREE CLAIMS: construction (here); demonstrated operation
 * (the act, SYNTHETIC); real acceptance (H3) — never claimed.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSession, health, setSession } from '../lib/api';
import { whoAmI, type Me } from '../lib/observation';
import { clearWorkingDomain, readWorkingDomain, workingDomainFor, type WorkingDomain } from '../lib/working-domain';
import { t, defaultLocale } from '../lib/i18n';
import type { NavItem, ShellBase, /* B81 si */ ShellScope, /* end B81 si */ WorkspaceKey, WorkspaceSpec } from '../lib/b80-seams';
/* B81 si: the palette's modes and the deterministic interpreter's reading (pure — it calls nothing) */
import { MODE_SPEC, PALETTE_MODES, interpret, modeItems, parseModePrefix, previewLine, type PaletteMode } from '../lib/intent-b81';
/* end B81 si */
import {
  EMPTY_HISTORY, activeHref, assertNavigationOnly, breadcrumbOf, decodeReturnToken, filterPalette, historyBack, historyForward, historyVerify,
  historyVisit, lastVerifiedLocation, movePaletteIndex, nextTabIndex, paletteEntries, parseHistory, readNavigation, safeLocation, saveNavigation,
  shellOfPath, shellSpec, shellStatus, themeScopeOf, withReturn, withoutShellParams,
  type Crumb, type HistoryEntry, type HistoryState, type NavigationRead, type PaletteEntry, type ReturnToken, type ShellStatus,
} from '../lib/shell-b80';
import { DegradedBanner, ErrorNote, Receipt } from './ui';
import { WorkingDomainChooser, WorkingDomainMark } from './working-domain';
import { GlobalContextBar } from './context-bar';
import { ThemeScope } from './theme';
/* B81 integration (§LY-G): the person's density and rail, the compact navigation below 640 px */ import { BottomNavigation, DensitySwitch, PreferencesScope, RailToggle } from './layout'; /* end B81 integration */
import { Dialog } from './layers';
/* B81 re: the sign-in / deep-link return (UX-11-005) */
import { loginHref } from '../lib/signin-return-b81';
import { carriedViews } from '../lib/tableview-b81';
import { ShellStatusContext } from '../lib/shell-status-b81';
/* end B81 re */

/* ── THE SLOTS (b80-seams AppShellSlots): §CB's context bar under the banner, §TK's ThemeScope around the surface ── */
export interface ShellSlots {
  contextBar?: (base: ShellBase | null) => ReactNode;
  themeScope?: ComponentType<{ tenantId: string | null; domainId: string | null; children: ReactNode }>;
}
/** THE ONE PLACE the integrator wires §CB's GlobalContextBar and §TK's ThemeScope (not seven layouts). Empty until then. */
export const SHELL_SLOTS: ShellSlots = {
  /* B80 integration: §CB's bar on every workspace (UX-10-001, UX-ADR-003) — the PLATFORM workspace has no domain context (scope null) */
  contextBar: (base) => (base === null ? null : <GlobalContextBar workspace={base.workspace} me={base.me} scope={base.scope} roles={base.roles} />),
  /* B80 integration: §TK's activated tenant theme around the surface (UX-68; the core theme when none is in force) */
  themeScope: ThemeScope,
};

/* ── THE SHELL'S OWN CONTEXT (the per-layout `useShell()` wrappers stay the pages' API; these serve the library) ── */
const BaseCtx = createContext<ShellBase | null>(null);
/* B81 re: the status context lives in a leaf module (lib/shell-status-b81.ts) so the governed control can read it without an import cycle */
const StatusCtx = ShellStatusContext;
/* end B81 re */
/** The shell's base (workspace, me, scope, roles, context) — null in the PLATFORM workspace and outside a shell. */
export function useShellBase(): ShellBase | null { return useContext(BaseCtx); }
/** What the shell can say about itself (phase, frozen, regions) — for a library control that must not act on an unverified state. */
export function useShellStatus(): ShellStatus | null { return useContext(StatusCtx); }

/* B81 re — THE SHELL'S RECOVERY SEAMS (PR-05-005, UX-09-005, UX-11-005):
 *   · useShellRecovery(): what a page's own refusal offers (§DG's RecoveryPanel composes it) — the shell's LAST VERIFIED LOCATION and the
 *     sign-in href that RETURNS HERE (`/login?next=<this place>`); null outside a shell.
 *   · FreezeScope (lib/shell-status-b81.ts, re-exported here): a region that can only be MORE frozen than the shell, never less.
 *   · the RE-VERIFICATION: when the tab becomes visible again (at most once a minute) the shell asks the server again who this is; a session
 *     the server no longer confirms — or one that now names another principal — FREEZES the page in place (the last valid context kept on
 *     screen, consequential controls held, the way back to sign-in that returns here), never a silent continue. */
export interface ShellRecovery { lastVerified: { route: string; title: string } | null; signInHref: string }
const RecoveryCtx = createContext<ShellRecovery | null>(null);
export function useShellRecovery(): ShellRecovery | null { return useContext(RecoveryCtx); }
export { FreezeScope } from '../lib/shell-status-b81';
const REVERIFY_MS = 60_000;
/** The place the person is on, for the sign-in return (the as-of query and its return token kept). */
const hereHref = (pathname: string): string => (typeof window === 'undefined' ? loginHref(pathname).href : loginHref(window.location.pathname, window.location.search).href);
/* end B81 re */

const HISTORY_KEY = 'eye.shell.history';
const FOCUS_KEY = 'eye.shell.focus';
const store = {
  read(k: string): string | null { try { return typeof window === 'undefined' ? null : sessionStorage.getItem(k); } catch { return null; } },
  write(k: string, v: string | null): void { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* storage unavailable: the stack is lost, nothing else */ } },
};
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export interface AppShellAdapt { nav?: NavItem[]; gate?: ReactNode; banner?: ReactNode }
export interface AppShellProps {
  workspace: WorkspaceKey;
  children: ReactNode;
  /** The layout's own context provider around the shell (its `useShell()` value, computed from the base). */
  provide?: (base: ShellBase, inner: ReactNode) => ReactNode;
  /** A layout's adaptation from the base: a filtered rail, a gate screen in place of the workspace, an addition to the banner. */
  adapt?: (base: ShellBase, api: { signOut: () => void }) => AppShellAdapt;
  slots?: ShellSlots;
}

/** THE APPLICATION SHELL (CMP-009). */
export function AppShell({ workspace, children, provide, adapt, slots }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const spec = useMemo(() => shellSpec(workspace), [workspace]);
  const platform = spec.scope === 'PLATFORM';
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [working, setWorking] = useState<WorkingDomain | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [healthState, setHealthState] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryState>(EMPTY_HISTORY);
  const [arrival, setArrival] = useState<ReturnToken | null>(null);
  const [route, setRoute] = useState(pathname);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const slotSet = slots ?? SHELL_SLOTS;

  /* B81 re: ONE verification, run at entry and again on re-verification (the server is asked who this is; nothing else is called) */
  const [lapsed, setLapsed] = useState<string | null>(null);
  const verifiedAt = useRef(0);
  const meRef = useRef<Me | null>(null);
  useEffect(() => { meRef.current = me; }, [me]);
  const verify = useCallback(async (mode: 'entry' | 'recheck') => {
    if (getSession() === null) { router.replace(hereHref(pathname)); return; }
    const r = await whoAmI();
    verifiedAt.current = Date.now();
    if (!r.ok || r.data === undefined) {
      const why = r.error?.message ?? 'the server did not confirm this session’s scope';
      if (mode === 'entry') setProblem(why); else setLapsed(`the server no longer confirms this session (${why})`);
      return;
    }
    if (mode === 'entry') {
      // The stored choice is read once the server has said who this is (never in a state initialiser: the shell pre-renders on the server).
      setWorking(readWorkingDomain());
      setMe(r.data.me);
      return;
    }
    const opened = meRef.current;
    setLapsed(opened !== null && opened.principalId !== r.data.me.principalId ? 'this tab’s session now names another principal than the one this page was opened for' : null);
  }, [router, pathname]);
  /* end B81 re */
  useEffect(() => {
    /* B81 re: no session → the sign-in page, carrying the place asked for (`/login?next=…`; honoured there only as an in-app path) */
    if (getSession() === null) { router.replace(loginHref(window.location.pathname, window.location.search).href); return; }
    /* end B81 re */
    setReady(true);
    if (!platform) void verify('entry');
    const check = async () => { const h = await health(); setDegraded(h.status !== 'ok'); setHealthState(h.status); };
    void check();
    const id = setInterval(() => void check(), platform ? 10000 : 15000);
    return () => clearInterval(id);
  }, [router, platform]); // eslint-disable-line react-hooks/exhaustive-deps -- `verify` is read at entry only

  /* B81 re: RE-VERIFICATION when the tab is shown again (throttled); a lapse freezes the page in place */
  useEffect(() => {
    if (platform || me === null) return;
    const recheck = () => {
      if (document.visibilityState !== 'visible' || Date.now() - verifiedAt.current < REVERIFY_MS) return;
      void verify('recheck');
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => { document.removeEventListener('visibilitychange', recheck); window.removeEventListener('focus', recheck); };
  }, [platform, me, verify]);
  /* end B81 re */

  // THE HISTORY STACK and THE ARRIVAL: each location is recorded in the tab's own stack; a `from=` token names the route back (PAT-26).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const search = window.location.search;
    const here = `${pathname}${withoutShellParams(search)}`;
    setRoute(here);
    setArrival(decodeReturnToken(new URLSearchParams(search).get('from')));
    const crumbs = breadcrumbOf(spec, pathname);
    const entry: HistoryEntry = { route: here, title: crumbs[crumbs.length - 1]?.label ?? spec.title, workspace: shellOfPath(pathname), at: new Date().toISOString(), verified: false };
    setHistory((prev) => { const next = historyVisit(prev.index < 0 ? parseHistory(store.read(HISTORY_KEY)) : prev, entry); store.write(HISTORY_KEY, JSON.stringify(next)); return next; });
    // A return restores the focus it left from (or the main region): never a command, only where the person was.
    const pending = store.read(FOCUS_KEY);
    store.write(FOCUS_KEY, null);
    if (pending !== null) {
      let tries = 0;
      const tick = () => {
        const el = pending === '' ? null : document.getElementById(pending);
        if (el !== null) { el.focus(); return; }
        if ((tries += 1) < 30) { requestAnimationFrame(tick); return; }
        mainRef.current?.focus();
      };
      requestAnimationFrame(tick);
    }
  }, [pathname, spec]);

  // Ctrl/⌘+K opens the palette (navigation only).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (isMac() ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey) { e.preventDefault(); setPaletteOpen(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const signOut = useCallback(() => {
    clearWorkingDomain(); store.write(HISTORY_KEY, null); store.write(FOCUS_KEY, null); setSession(null); router.replace('/login');
  }, [router]);

  const domainId = me === null ? null : workingDomainFor(me, working);
  const verified = platform ? ready : me !== null && me.homeTenantId !== null && domainId !== null;
  // ONE base object per (principal, working domain): a page's effects keyed on its scope do not re-run on every shell render
  const base = useMemo<ShellBase | null>(() => (platform || me === null || me.homeTenantId === null || domainId === null ? null
    : { workspace, me, scope: { tenantId: me.homeTenantId, domainId }, roles: me.bindings.map((b) => b.roleCode), context: null }), [platform, me, domainId, workspace]);
  /* B81 re: a lapsed re-verification FREEZES (unverified) while the page stays on screen with its last valid context */
  const status = lapsed !== null ? shellStatus({ session: ready, verified: null, problem: lapsed, health: healthState })
    : shellStatus({ session: ready, verified: platform ? ready : (me === null ? null : verified), problem, health: healthState });
  /* end B81 re */
  useEffect(() => {
    if (!verified) return;
    setHistory((prev) => { const next = historyVerify(prev); store.write(HISTORY_KEY, JSON.stringify(next)); return next; });
  }, [verified, route]);

  if (problem !== null) {
    const back = lastVerifiedLocation(history, route);
    return (
      <main className="eye-shell-gate">
        <h1>{spec.title}</h1>
        <p role="alert" className="eye-shell-gate-alert">{problem}</p>
        <p className="eye-shell-meta">
          Nothing of this workspace is shown until the server confirms who this is.{' '}
          {back !== null && <>The last verified location was <Link href={back.route}>{back.title || back.route}</Link>. </>}
          {/* B81 re: signing in again returns here */}<Link href={hereHref(pathname)}>Sign in again</Link>{/* end B81 re */}.
        </p>
      </main>
    );
  }
  if (!ready) return null;   // FAIL CLOSED: nothing renders without a session
  let adapted: AppShellAdapt = {};
  if (!platform) {
    if (me === null) return null;   // FAIL CLOSED: nothing renders until the server has said which scope this is
    if (me.homeTenantId === null) {
      return (
        <main className="eye-shell-gate">
          <h1>{spec.title}</h1>
          <p role="alert">
            This workspace operates inside one Intelligence Domain. The signed-in principal is bound at{' '}
            <strong>{me.homeScope}</strong> scope and has no home domain, so there is no domain to open.
          </p>
        </main>
      );
    }
    // B18: a TENANT-homed principal chooses the domain to work in (the choice is the tab's and the principal's; the server decides what it may do there).
    if (domainId === null || base === null) return <WorkingDomainChooser workspace={spec.title} me={me} onChosen={setWorking} />;
    adapted = adapt?.(base, { signOut }) ?? {};
    if (adapted.gate !== undefined && adapted.gate !== null) return <>{adapted.gate}</>;
  }
  const nav = adapted.nav ?? spec.nav;
  const scope = base?.scope ?? null;

  const navigate = (e: PaletteEntry) => {
    const crossing = e.workspace !== shellOfPath(pathname);
    const focus = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement && document.activeElement.id !== '' ? document.activeElement.id : null;
    const crumbs = breadcrumbOf(spec, pathname);
    setPaletteOpen(false);
    router.push(crossing ? withReturn(e.href, { path: route, title: crumbs[crumbs.length - 1]?.label ?? spec.title, workspace: shellOfPath(pathname), focus }) : e.href);
  };

  const shell = (
    /* B81 integration (§LY-G): the person's own presentation preferences (density, rail) — presentation never changes meaning */
    <PreferencesScope scope={scope} roles={base?.roles ?? []}>
    <div className="eye-shell">
      <a className="eye-skip-link" href="#eye-main">Skip to main content</a>
      <DegradedBanner visible={degraded} detail={platform ? t('shell.degraded.api', defaultLocale) : 'the API reports degraded audit availability'} />
      <header role="banner" className="eye-shell-header">
        <strong className="eye-shell-title">{spec.title}</strong>
        {platform ? (
          <span className="eye-shell-meta">{t('shell.context.scope', defaultLocale)}: PLATFORM · {t('shell.context.deployment', defaultLocale)}: local-dev</span>
        ) : (
          <>
            <span className="eye-shell-meta">
              tenant <bdi className="eye-mono">{scope!.tenantId.slice(0, 8)}…</bdi>{' · '}domain <bdi className="eye-mono">{scope!.domainId.slice(0, 8)}…</bdi>
              {me!.homeDomainId === null && <WorkingDomainMark onChange={() => { clearWorkingDomain(); setWorking(null); }} />}
            </span>
            <span className="eye-shell-meta">{me!.bindings.map((b) => b.roleCode).join(' · ') || 'no role binding'}</span>
          </>
        )}
        {adapted.banner}
        <span className="eye-shell-end">
          {/* B81 integration (§LY-G) */}<DensitySwitch compact /><RailToggle />{/* end B81 integration */}
          {/* B81 si: the palette's four modes — nothing runs from it */}<button type="button" className="eye-link-button" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" title="Go to a place, search, ask or find a command (Ctrl+K / ⌘K) — nothing runs from the palette" onClick={() => setPaletteOpen(true)}>
            Go to or search…
          </button>{/* end B81 si */}
          <button type="button" className="eye-link-button" onClick={signOut}>{platform ? t('shell.logout', defaultLocale) : 'Sign out'}</button>
        </span>
      </header>
      {slotSet.contextBar?.(base)}
      {/* B81 re: the lapse, stated where the page is — its controls held, the way back that returns here */}
      {lapsed !== null && (
        <div role="alert" className="eye-shell-lapsed" id="eye-shell-lapsed">
          <strong>HELD — this session could not be re-verified.</strong> {lapsed}. What is shown is the last valid read; consequential controls on
          this page are held until the server confirms who this is. <Link href={hereHref(pathname)}>Sign in again and return here</Link>.
        </div>
      )}
      {/* end B81 re */}
      <div className="eye-shell-body">
        <WorkspaceRail spec={spec} nav={nav} pathname={pathname} caption={platform ? `WS-19 · ${t('app.workspace', defaultLocale)}` : undefined} />
        <main id="eye-main" ref={mainRef} tabIndex={-1} className="eye-shell-main">
          <div className="eye-shell-wayfinding">
            <Breadcrumb crumbs={breadcrumbOf(spec, pathname)} />
            {arrival !== null && (
              <span className="eye-shell-return">
                from {arrival.title || arrival.path} ·{' '}
                <Link href={arrival.path} onClick={() => store.write(FOCUS_KEY, arrival.focus ?? '')}>Return to {arrival.title || 'where you were'}</Link>
              </span>
            )}
            <HistoryNavigator history={history} current={route} scope={scope} workspace={shellOfPath(pathname) ?? workspace} onGo={(r) => router.push(r)} />
          </div>
          {children}
        </main>
      </div>
      {/* B81 integration (§LY-G): the compact navigation — a DIRECT child of .eye-shell (the rail yields to it only below 640 px) */}
      <BottomNavigation spec={spec} nav={nav} pathname={pathname} />
      {paletteOpen && <CommandPalette entries={paletteEntries()} current={pathname} onNavigate={navigate} onClose={() => setPaletteOpen(false)} /* B81 si */ scope={scope} /* end B81 si */ />}
    </div>
    </PreferencesScope>
  );
  const Theme = slotSet.themeScope;
  const surface = Theme === undefined ? shell : <Theme {...themeScopeOf(scope)}>{shell}</Theme>;
  /* B81 re: the recovery seam (the last verified location, the sign-in that returns here) beside the status */
  const lastOk = lastVerifiedLocation(history, route);
  const recovery: ShellRecovery = { lastVerified: lastOk === null ? null : { route: lastOk.route, title: lastOk.title }, signInHref: hereHref(pathname) };
  const inner = (
    <StatusCtx.Provider value={status}>
      <RecoveryCtx.Provider value={recovery}>
        <BaseCtx.Provider value={base}>{surface}</BaseCtx.Provider>
      </RecoveryCtx.Provider>
    </StatusCtx.Provider>
  );
  /* end B81 re */
  return base !== null && provide !== undefined ? <>{provide(base, inner)}</> : inner;
}

/** THE WORKSPACE RAIL (CMP-011): one per shell; exactly one current item; its name is the hosted contract. */
export function WorkspaceRail({ spec, nav, pathname, caption }: { spec: WorkspaceSpec; nav: readonly NavItem[]; pathname: string; caption?: string }) {
  const active = activeHref(nav, pathname);
  const glyphs = nav.some((n) => n.glyph !== '');
  return (
    <nav aria-label={spec.navName} className={glyphs ? 'eye-rail' : 'eye-rail eye-rail-wide'}>
      {caption !== undefined && <div className="eye-rail-caption">{caption}</div>}
      <ul className="eye-rail-list">
        {nav.map((n) => (
          <li key={n.href}>
            <Link href={n.href} aria-current={n.href === active ? 'page' : undefined} className="eye-rail-link">
              {n.glyph !== '' && <span aria-hidden="true">{n.glyph}</span>}
              <span className={n.glyph !== '' ? 'eye-nav-label' : undefined}>{n.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** THE WORKSPACE HEADER (CMP-012): a page's one h1, its scope, its status and its actions. */
export function WorkspaceHeader({ title, scope, status, actions, id }: { title: string; scope?: ReactNode; status?: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <div className="eye-ws-header">
      <div>
        <h1 id={id} className="eye-ws-title">{title}</h1>
        {scope !== undefined && <p className="eye-shell-meta">{scope}</p>}
        {status}
      </div>
      {actions !== undefined && <div className="eye-ws-actions">{actions}</div>}
    </div>
  );
}

/** THE BREADCRUMB (CMP-013). */
export function Breadcrumb({ crumbs }: { crumbs: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="eye-crumbs">
      <ol>
        {crumbs.map((c, i) => (
          <li key={`${i}-${c.label}`}>
            {c.current || c.href === null ? <span aria-current={c.current ? 'page' : undefined}>{c.label}</span> : <Link href={c.href}>{c.label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** THE TAB SET (CMP-014): ARIA tabs, roving tabindex, arrows mirrored under RTL, Home/End; a disabled tab says why in its title. */
export function TabSet({ label, tabs, selected, onSelect, idBase }: {
  label: string; idBase: string; tabs: ReadonlyArray<{ id: string; label: string; panel: ReactNode; disabled?: boolean; reason?: string }>; selected?: string; onSelect?: (id: string) => void;
}) {
  const [own, setOwn] = useState(tabs.find((x) => !x.disabled)?.id ?? '');
  const current = selected ?? own;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const choose = (id: string) => { setOwn(id); onSelect?.(id); };
  const onKey = (e: ReactKeyboardEvent<HTMLButtonElement>, i: number) => {
    const rtl = typeof document !== 'undefined' && getComputedStyle(e.currentTarget).direction === 'rtl';
    const next = nextTabIndex(i, e.key, tabs.map((x) => x.disabled === true), { rtl });
    if (next !== i && next >= 0) { e.preventDefault(); choose(tabs[next]!.id); refs.current[next]?.focus(); }
  };
  return (
    <div className="eye-tabs">
      <div role="tablist" aria-label={label} className="eye-tablist">
        {tabs.map((x, i) => (
          <button key={x.id} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`${idBase}-tab-${x.id}`} aria-controls={`${idBase}-panel-${x.id}`}
            aria-selected={x.id === current} tabIndex={x.id === current ? 0 : -1} disabled={x.disabled} title={x.disabled ? x.reason : undefined}
            className="eye-tab" onClick={() => choose(x.id)} onKeyDown={(e) => onKey(e, i)}>
            {x.label}
          </button>
        ))}
      </div>
      {tabs.map((x) => (
        <div key={x.id} role="tabpanel" id={`${idBase}-panel-${x.id}`} aria-labelledby={`${idBase}-tab-${x.id}`} hidden={x.id !== current} tabIndex={0} className="eye-tabpanel">
          {x.id === current ? x.panel : null}
        </div>
      ))}
    </div>
  );
}

type Err = { code: string; message: string; correlationId: string } | null;
/** THE HISTORY NAVIGATOR (CMP-016): back / forward, recent places, the last verified location, the saved place, a copyable link. */
export function HistoryNavigator({ history, current, scope, workspace, onGo }: {
  history: HistoryState; current: string; scope: { tenantId: string; domainId: string } | null; workspace: WorkspaceKey; onGo: (route: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<NavigationRead | null>(null);
  const [readErr, setReadErr] = useState<Err>(null);
  const [saveErr, setSaveErr] = useState<Err>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const back = historyBack(history); const forward = historyForward(history);
  const recent = history.entries.filter((e) => e.route !== current).slice(-8).reverse();
  const verified = lastVerifiedLocation(history, current);
  const mine = saved?.workspaces.find((w) => w.workspace === workspace) ?? null;
  const load = useCallback(async () => {
    const r = await readNavigation(scope, workspace);
    if (r.ok && r.data !== undefined) { setSaved(r.data.navigation); setReadErr(null); } else setReadErr(r.error ?? null);
  }, [scope, workspace]);
  useEffect(() => { if (open) void load(); }, [open, load]);
  const save = async () => {
    setPending(true); setSaveErr(null); setReceipt(null);
    const [path, query] = current.split('?');
    const r = await saveNavigation(scope, {
      workspace, expectedVersion: mine?.current.version ?? 0,
      location: { route: path ?? current, ...(query ? { query } : {}), title: (history.entries[history.index]?.title ?? '').slice(0, 160) || undefined,
        /* B81 re: saving a place keeps the person's saved table views (UX-22-002 — lib/tableview-b81.ts) */
        ...(Object.keys(carriedViews(mine?.current)).length > 0 ? { filters: carriedViews(mine?.current) } : {}) },
      returnPath: back !== null && safeLocation(back.route) !== null ? back.route : null, focus: null,
      recent: history.entries.filter((e) => safeLocation(e.route) !== null).slice(-20).map((e) => ({ route: e.route, ...(e.title ? { title: e.title.slice(0, 160) } : {}) })),
      favorites: mine?.current.favorites ?? [],
    });
    setPending(false);
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); await load(); } else setSaveErr(r.error ?? null);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}${current}`); setCopied('Copied. The link opens this place; it carries no command and acknowledges nothing.'); }
    catch { setCopied(`Copy this link: ${current}`); }
  };
  const toggle = useRef<HTMLButtonElement | null>(null);
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => { if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); toggle.current?.focus(); } };
  return (
    <div className="eye-history" onKeyDown={onKey}>
      <button ref={toggle} type="button" className="eye-link-button" aria-expanded={open} aria-controls="eye-history-panel" onClick={() => setOpen((o) => !o)}>History</button>
      {open && (
        <div id="eye-history-panel" className="eye-history-panel">
          <p className="eye-shell-meta">This tab&apos;s own places — kept in this tab only, cleared at sign-out. Going back opens a place; it repeats nothing.</p>
          <div className="eye-history-row">
            <button type="button" className="eye-link-button" disabled={back === null} onClick={() => back !== null && onGo(back.route)}>
              {back === null ? 'Back (nothing earlier in this tab)' : `Back to ${back.title || back.route}`}
            </button>
            <button type="button" className="eye-link-button" disabled={forward === null} onClick={() => forward !== null && onGo(forward.route)}>
              {forward === null ? 'Forward (nothing later)' : `Forward to ${forward.title || forward.route}`}
            </button>
          </div>
          {verified !== null && <p className="eye-shell-meta">Last verified location: <Link href={verified.route}>{verified.title || verified.route}</Link></p>}
          {recent.length > 0 && (
            <ul aria-label="Recent places" className="eye-history-list">
              {recent.map((e) => <li key={`${e.route}-${e.at}`}><Link href={e.route}>{e.title || e.route}</Link> <span className="eye-shell-meta eye-mono">{e.route}</span></li>)}
            </ul>
          )}
          <div className="eye-history-saved">
            <strong>Your saved place in this workspace</strong>
            {readErr !== null && <ErrorNote error={readErr} />}
            {saved !== null && mine === null && <p className="eye-shell-meta">none saved yet</p>}
            {mine !== null && (
              <p className="eye-shell-meta">
                version {mine.current.version} of {mine.versions}, saved {mine.current.saved_at}:{' '}
                <Link href={`${mine.current.location.route}${mine.current.location.query ? `?${mine.current.location.query}` : ''}`}>{mine.current.location.title ?? mine.current.location.route}</Link>
              </p>
            )}
            <button type="button" className="eye-link-button" disabled={pending || saved === null} onClick={() => void save()}>
              {pending ? 'Saving this place…' : 'Save this place'}
            </button>
            {saved === null && readErr === null && <span className="eye-shell-meta"> reading your saved place first…</span>}
            {saved === null && readErr !== null && <span className="eye-shell-meta"> saving waits for your saved place to be read (the read above was refused)</span>}
            <ErrorNote error={saveErr} />
            <Receipt receipt={receipt} />
          </div>
          <button type="button" className="eye-link-button" onClick={() => void copy()}>Copy a link to this place</button>
          {copied !== null && <p aria-live="polite" className="eye-shell-meta">{copied}</p>}
        </div>
      )}
    </div>
  );
}

/* B81 si — THE COMMAND PALETTE'S MODES (F-P7-E-02: UX-13-001, UX-13-003, UX-13-004, UX-13-005; B80's CMP-015 kept): Go to · Search · Ask ·
   Command — four visibly and behaviourally distinct modes, chosen by the person (the tabs, or a typed prefix — `/` Search, `?` Ask, `>`
   Command — said as the switch it is, never inferred silently). Go to navigates (B80's entries); Search hands the words as typed to the
   federated search page (the governed reads run THERE, each its own audited read); Ask shows the deterministic interpreter's reading FIRST
   (lib/intent-b81 — no model) and hands it to that page, where the reading is checked against what the person may see and an ambiguity
   asks with nothing preselected; Command finds a command and HANDS IT OFF to its page's Command Review (§HA, `review=`). The palette
   EXECUTES NOTHING and calls nothing: every item is checked by the evolved guard (lib/shell-b80 assertNavigationOnly → §HA's
   assertNoExecution) and every pick is a navigation. The props contract is B80's, the additions optional (the compatibility gate). */
type PaletteScope = ShellScope | null;
type PaletteRow = { kind: string; href: string; label: string; detail: string; current: boolean };
const KIND_WORD: Readonly<Record<string, string>> = { navigate: 'Go to', search: 'Search', ask: 'Ask', command: 'Command review' };
/** THE COMMAND PALETTE (CMP-015; B81 §SI's modes): it navigates or hands off — nothing runs here; Escape closes (the library's Dialog, §CL-D). */
export function CommandPalette({ entries, current, onNavigate, onClose, scope, initialMode }: { entries: PaletteEntry[]; current: string; onNavigate: (e: PaletteEntry) => void; onClose: () => void; scope?: PaletteScope; initialMode?: PaletteMode }) {
  assertNavigationOnly(entries);
  const [mode, setMode] = useState<PaletteMode>(initialMode ?? 'goto');
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(0);
  const [switched, setSwitched] = useState<string | null>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const inDomain = scope !== undefined && scope !== null;
  const modal = mode === 'goto' ? null : modeItems(mode, q, inDomain);
  const rows: PaletteRow[] = mode === 'goto'
    ? filterPalette(entries, q).map((e) => ({ kind: 'navigate', href: e.href, label: e.label, detail: e.detail, current: e.href === current }))
    : (modal?.items ?? []).map((x) => ({ kind: x.kind, href: x.href, label: x.label, detail: x.detail, current: false }));
  assertNavigationOnly([...rows.map((r) => ({ kind: r.kind, href: r.href, label: r.label, detail: r.detail, ...(r.kind === 'command' ? { action: modal?.items.find((i) => i.href === r.href)?.action ?? '' } : {}) }))]);
  const reading = mode === 'ask' || mode === 'command' ? interpret(q, { mode }) : null;
  const preview = reading !== null && q.trim() !== '' ? previewLine(reading) : null;
  const pick = (r: PaletteRow) => onNavigate({ kind: 'navigate', href: r.href, label: r.label, detail: r.detail, workspace: shellOfPath(r.href), registry: null });
  const choose = (m: PaletteMode, said: string | null = null) => { setMode(m); setIndex(0); setSwitched(said); };
  const onChange = (raw: string) => {
    const p = parseModePrefix(raw, mode);
    if (p.switched) choose(p.mode, `Switched to ${MODE_SPEC[p.mode].label} (you typed “${MODE_SPEC[p.mode].prefix}”).`);
    setQ(p.text); setIndex(0);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) { e.preventDefault(); setIndex((i) => movePaletteIndex(i, e.key, rows.length)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = rows[Math.min(index, rows.length - 1)]; if (r !== undefined) pick(r); }
  };
  const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>, i: number) => {
    const rtl = typeof document !== 'undefined' && getComputedStyle(e.currentTarget).direction === 'rtl';
    const next = nextTabIndex(i, e.key, PALETTE_MODES.map(() => false), { rtl });
    if (next !== i && next >= 0) { e.preventDefault(); choose(PALETTE_MODES[next]!); tabs.current[next]?.focus(); }
  };
  const activeId = rows.length > 0 ? `eye-palette-opt-${Math.min(index, rows.length - 1)}` : undefined;
  const spec = MODE_SPEC[mode];
  return (
    <Dialog open title="Go to, search, ask or find a command" onClose={() => onClose()} initialFocusId="eye-palette-input">
      <div className="eye-palette" data-mode={mode}>
      <div role="tablist" aria-label="Palette mode" className="eye-palette-modes">
        {PALETTE_MODES.map((m, i) => (
          <button key={m} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`eye-palette-mode-${m}`} aria-controls="eye-palette-panel" aria-selected={m === mode}
            tabIndex={m === mode ? 0 : -1} className="eye-palette-mode" data-mode={m} onClick={() => choose(m)} onKeyDown={(e) => onTabKey(e, i)}
            title={MODE_SPEC[m].prefix === '' ? MODE_SPEC[m].says : `${MODE_SPEC[m].says} (type “${MODE_SPEC[m].prefix}” to switch)`}>
            {MODE_SPEC[m].label}{MODE_SPEC[m].prefix === '' ? null : <span className="eye-palette-prefix" aria-hidden="true"> {MODE_SPEC[m].prefix}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="eye-palette-panel" aria-labelledby={`eye-palette-mode-${mode}`} className="eye-palette-panel">
      <input
        role="combobox" aria-label={spec.inputLabel} aria-expanded="true" aria-controls="eye-palette-list" aria-autocomplete="list"
        id="eye-palette-input" aria-activedescendant={activeId} className="eye-palette-input" value={q}
        onChange={(e) => onChange(e.target.value)} onKeyDown={onKey}
      />
      <p className="eye-shell-meta">{spec.says}</p>
      <p role="status" aria-live="polite" className="eye-palette-reading">
        {switched === null ? null : <>{switched} </>}
        {preview === null ? null : <><strong>The reading:</strong> {preview}</>}
        {reading !== null && q.trim() !== '' && reading.uncertainty.length > 0 ? <span className="eye-shell-meta"> — {reading.uncertainty.join('; ')}</span> : null}
      </p>
      {modal?.reason ? <p className="eye-palette-reason">{modal.reason}</p> : null}
      <ul role="listbox" id="eye-palette-list" aria-label={mode === 'goto' ? 'Places' : mode === 'command' ? 'Commands — each opens its Command Review' : 'Searches'} className="eye-palette-list">
        {rows.length === 0 && <li role="option" aria-selected={false} aria-disabled="true" className="eye-shell-meta">{mode === 'goto' ? 'no place matches' : 'nothing to offer yet'}</li>}
        {rows.map((r, i) => (
          <li key={`${r.kind}:${r.href}`} id={`eye-palette-opt-${i}`} role="option" aria-selected={i === Math.min(index, rows.length - 1)} aria-current={r.current ? 'page' : undefined}
            className="eye-palette-option" data-kind={r.kind} onClick={() => pick(r)} onMouseEnter={() => setIndex(i)}>
            <span className="eye-palette-kind">{KIND_WORD[r.kind] ?? r.kind}</span> <span>{r.label}</span> <span className="eye-shell-meta">{r.detail} · <bdi className="eye-mono">{r.href}</bdi></span>
          </li>
        ))}
      </ul>
      </div>
      </div>
    </Dialog>
  );
}
/* end B81 si */
