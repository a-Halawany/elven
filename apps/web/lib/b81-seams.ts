/**
 * B81 §0 (the integrator's prelude) — THE SEAMS the parts code against (§HA human authority, §DG degraded / recovery, §OB object pages,
 * §CT content and terminology, §SI search and intent, §LY-G layout / density / regions, §LY-M multi-window, §RE B80's residues). Types and the
 * file / export contract only — no behaviour. The library stays in top-level `apps/web/components/*.tsx` (B107's inventory); pure contracts
 * in `apps/web/lib/*-b81.ts` with vitest. GovernedButton, DegradedBanner, TruthBadge, LifecycleBadge, ErrorNote and Receipt are B107
 * inventory keys: changed only through a contribution (§RE), composed otherwise. Nothing here executes a consequential act: a palette, an
 * interpretation, a saved search, a recovery path or a handoff hands off to the page's Command Review and its own governed port.
 */

/* ── §HA THE HUMAN-AUTHORITY PATTERNS ── */
export type ActionClass = 'read' | 'draft' | 'propose' | 'approve' | 'commit' | 'sign' | 'withdraw' | 'destroy';
export interface CommandReviewInput {
  action: string;                 // the governed action name (PDP)
  actionClass: ActionClass;
  object: { type: string; id: string; version: number | null; title: string };
  digest: string;                 // the exact version digest the act binds
  consequence: { summary: string; reversible: boolean; scope: string; affected?: string[] };
  eligibility: { can: boolean; reason: string | null; role: string | null };
  typedConfirmation?: string;     // destroy / irreversible acts
}
export interface SignatureReceiptView { signatureId: string; signer: string; role: string | null; digest: string; signedAt: string; boundAction: string }

/* ── §DG THE DEGRADED-STATE EXPERIENCE ── */
export type DependencyKind = 'audit' | 'partition' | 'source' | 'method' | 'agent' | 'model' | 'network';
export interface DependencyKey { kind: DependencyKind; key: string }
export interface DegradedContract {
  dependency: DependencyKey; available: string[]; unavailable: string[]; limitations: string[];
  maxDuration: string | null; owner: string | null; exitEvidence: string | null; version: number;
}

/* ── §OB OBJECT PAGES ── */
export type LifecycleState = 'LS-01' | 'LS-02' | 'LS-03' | 'LS-04' | 'LS-05' | 'LS-06' | 'LS-07' | 'LS-08' | 'LS-09' | 'LS-10' | 'LS-11' | 'LS-12';
export interface ObjectTypeSpec { type: string; label: string; route: (id: string) => string; getAction: string; lifecycle: Record<string, LifecycleState> }

/* ── §CT CONTENT AND TERMINOLOGY ── */
export type Audience = 'executive' | 'analyst' | 'operator';
export interface TermEntry { key: string; label: string; definition: string; explanations: Partial<Record<Audience, string>>; locale: string; version: number }
export const CONTENT_LINT_RULES = ['verb-object', 'destructive-scope', 'error-recovery', 'no-dilution', 'title-noun-phrase'] as const;

/* ── §SI SEARCH AND INTENT ── */
export type PaletteMode = 'goto' | 'search' | 'ask' | 'command';
export interface Interpretation { input: string; kind: 'navigate' | 'search' | 'command' | 'ambiguous' | 'none'; options: Array<{ label: string; target: string }>; chosen: string | null }

/* ── §LY LAYOUT, DENSITY, REGIONS, WINDOWS ── */
export type LayoutClass = 'BP-01' | 'BP-02' | 'BP-03' | 'BP-04' | 'BP-05';
export type Density = 'DEN-01' | 'DEN-02' | 'DEN-03';
export type RegionKey = 'context' | 'primary' | 'evidence' | 'inspector' | 'action' | 'status' | 'authority';
export interface HandoffOffer { handoffId: string; location: string; offeredAt: string; expiresAt: string }
export interface PresentationState { workspace: string; location: string; version: number; publishedAt: string }

/* ── THE LIBRARY'S NEW FILES AND EXPORTS (appended to B80's LIBRARY at the fold) ── */
export const LIBRARY_B81 = {
  authority: { part: '§HA',   files: ['components/authority.tsx'], exports: ['CommandReview', 'ConsequencePreview', 'AuthorityBanner', 'DecisionDigest', 'SignatureReceipt', 'GateStatus', 'TypedConfirmation', 'ReviewRecord', 'ContestPath'] },
  recovery:  { part: '§DG',   files: ['components/recovery.tsx'], exports: ['DegradedContractView', 'RecoveryPanel', 'StaleDeclaration', 'PartialResult', 'ResidualState', 'FailureState'] },
  object:    { part: '§OB',   files: ['components/object.tsx'], exports: ['ObjectHeader', 'IdentityChip', 'VersionBadge', 'LifecycleView'] },
  help:      { part: '§CT',   files: ['components/help.tsx'], exports: ['Term', 'HelpPanel'] },
  layout:    { part: '§LY-G', files: ['components/layout.tsx'], exports: ['Container', 'Stack', 'Cluster', 'Grid', 'GridItem', 'Region', 'Composition', 'DeferredContent', 'PreferencesScope', 'DensitySwitch', 'RailToggle', 'BottomNavigation'] },
  windows:   { part: '§LY-M', files: ['components/command-environment.tsx'], exports: ['CommandComposition', 'PresentationView', 'HandoffDialog'] },
} as const;
