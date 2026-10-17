/**
 * B80 §0 (the integrator's prelude) — THE SEAMS the five parts code against (§TK tokens/themes, §CL-F forms/actions/feedback, §CL-D data and
 * layers, §SH the shell and navigation, §CB the context bar). Types and the file/export contract only — no behaviour here.
 *
 * THE LIBRARY lives in top-level `apps/web/components/*.tsx` files (B107's design inventory reads exactly those — design-source.ts), each
 * exporting UpperCase components; its pure contracts live in `apps/web/lib/*-b80.ts` with vitest (the web has no DOM test environment and
 * B80 adds no dependency — rendering is proven by the catalogue walk). GovernedButton (observation.tsx), DegradedBanner, TruthBadge,
 * ErrorNote and Receipt (ui.tsx) STAY where they are (B107's inventory keys); a library component composes them, never moves them.
 * A part that needs a sibling's component before it exists uses today's ui.tsx primitive and names the swap in its report.
 */
import type { Me } from './observation';

/* ── THE WORKSPACES (§SH owns the registry's values; the names are CONTRACTS — the hosted browser suites select navigations by them) ── */
export type WorkspaceKey = 'admin' | 'home' | 'decisions' | 'graph' | 'intelligence' | 'observation' | 'prediction' | 'twins';
/** The navigation's accessible name per workspace as the hosted suites expect it today (aria-label of the rail). Never renamed by B80. */
export const WORKSPACE_NAV_NAMES: Readonly<Record<WorkspaceKey, string>> = {
  admin: 'workspace', home: 'Decisions', decisions: 'Decisions', graph: 'Graph', intelligence: 'Intelligence',
  observation: 'Observation Operations', prediction: 'Prediction', twins: 'Prediction',
};
export interface NavItem { href: string; label: string; glyph: string; /** a symbol id from packages/tokens symbols (§TK), when one exists */ symbol?: string }
export interface WorkspaceSpec {
  key: WorkspaceKey;
  /** the visible workspace title (the header) */ title: string;
  /** the rail's accessible name (WORKSPACE_NAV_NAMES) */ navName: string;
  homeHref: string;
  /** PLATFORM (the admin workspace) or DOMAIN (every other — fails closed until the server says which scope this is) */ scope: 'PLATFORM' | 'DOMAIN';
  nav: NavItem[];
}

/* ── THE SHELL CONTEXT (§SH) — every layout's `useShell()` keeps its own exported shape as a thin wrapper over this ── */
export interface ShellScope { tenantId: string; domainId: string }
export interface ShellBase {
  workspace: WorkspaceKey;
  me: Me;
  /** null for the PLATFORM workspace */ scope: ShellScope | null;
  /** the role codes bound in the working scope */ roles: string[];
  /** the current context dimensions (§CB) — null until read */ context: ContextDimensions | null;
}

/* ── THE CONTEXT BAR (§CB) — the dimensions over executive.contexts (0094) ── */
export interface ContextDimensions {
  tenantId: string; domainId: string; roles: string[];
  objective: { id: string; title: string } | null;
  horizon: string | null;
  scenario: { id: string; title: string } | null;
  classification: string | null;
  /** ISO instant; null = live */ effectiveAt: string | null;
  policyVersion: string | null;
  /** the version of the principal's context row (append-only) */ version: number | null;
}
/** What a page declares about the effective time (Q11): honoured, or stated as not applied — never silently ignored. */
export type EffectiveTimeSupport = 'honoured' | 'live_only';

/* ── THE LIBRARY'S FILES AND EXPORTS (the parts' contract; each part owns its files) ── */
export const LIBRARY = {
  tokens:   { part: '§TK',   files: ['components/symbols.tsx', 'components/theme.tsx'], exports: ['Symbol', 'Legend', 'ThemeScope', 'ThemePreview'] },
  forms:    { part: '§CL-F', files: ['components/forms.tsx'], exports: ['Field', 'TextArea', 'Select', 'Combobox', 'DateTimeInput', 'RangeInput', 'UnitInput', 'FileIntake', 'ErrorSummary', 'Stepper', 'FormDraft'] },
  actions:  { part: '§CL-F', files: ['components/actions.tsx'], exports: ['Button', 'SplitButton', 'ActionMenu'] },
  feedback: { part: '§CL-F', files: ['components/feedback.tsx'], exports: ['InlineMessage', 'Toast', 'ProgressIndicator', 'Skeleton', 'EmptyState'] },
  data:     { part: '§CL-D', files: ['components/data.tsx'], exports: ['DataTable', 'TreeGrid', 'StructuredList', 'DefinitionList', 'Metric', 'StatisticalSummary', 'ComparisonMatrix', 'DiffViewer', 'BulkSelection'] },
  layers:   { part: '§CL-D', files: ['components/layers.tsx'], exports: ['Surface', 'Divider', 'Panel', 'Drawer', 'Dialog', 'Popover', 'Disclosure'] },
  shell:    { part: '§SH',   files: ['components/shell.tsx'], exports: ['AppShell', 'WorkspaceRail', 'WorkspaceHeader', 'Breadcrumb', 'TabSet', 'HistoryNavigator', 'CommandPalette'] },
  context:  { part: '§CB',   files: ['components/context-bar.tsx'], exports: ['GlobalContextBar', 'ContextSwitchDialog'] },
} as const;

/* ── THE SLOTS (§SH renders them; the others fill them) ── */
export interface AppShellSlots {
  /** §CB's GlobalContextBar, under the header */ contextBar?: unknown;
  /** §TK's ThemeScope wraps the shell's surface */ themeScope?: unknown;
}
