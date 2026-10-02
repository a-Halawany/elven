'use client';
/**
 * The EXECUTIVE HOME lives in the Decisions shell (CP-6 B36, 0094 §H; WS-01): the same session, scope, working-domain choice and nav —
 * `/home` is the first entry of that nav. Nothing is added to the shell's authority: every act on the home is its own governed write.
 */
import type { ReactNode } from 'react';
import DecisionsLayout from '../decisions/layout';

export default function HomeLayout({ children }: { children: ReactNode }) {
  return <DecisionsLayout>{children}</DecisionsLayout>;
}
