/**
 * CP-6 B81 §RE — THE SHELL STATUS CONTEXT as a leaf module (no component imports): the shell (components/shell.tsx) PROVIDES it, the
 * governed control (components/observation.tsx GovernedButton) READS it — kept out of shell.tsx so the library has no import cycle
 * (shell → context-bar / layers → observation → shell; `pnpm boundaries` no-circular). The status itself is lib/shell-b80.ts shellStatus.
 *
 * FreezeScope: a region that can only be MORE frozen than the shell, never less — every governed control inside reads `frozen` with the
 * scope's statement (a page whose own read is stale holds its controls; the catalogue shows the held state without a server).
 */
import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { ShellStatus } from './shell-b80';

export const ShellStatusContext = createContext<ShellStatus | null>(null);
/** What the shell can say about itself (phase, frozen, regions) — null outside a shell. */
export function useLeafShellStatus(): ShellStatus | null { return useContext(ShellStatusContext); }

/** The held status a FreezeScope provides: the shell's own when it is already frozen, else an unverified hold with the scope's words. */
export function freezeOf(outer: ShellStatus | null, statement: string): ShellStatus {
  return outer !== null && outer.frozen ? outer : { phase: 'unverified', frozen: true, regions: [...(outer?.regions ?? []), 'region'], statement };
}
export const FreezeScope = ({ statement, children }: { statement: string; children: ReactNode }) =>
  createElement(ShellStatusContext.Provider, { value: freezeOf(useContext(ShellStatusContext), statement) }, children);
