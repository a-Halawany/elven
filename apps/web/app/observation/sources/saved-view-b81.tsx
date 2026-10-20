'use client';
/**
 * CP-6 B81 §RE — THE REGISTER'S VIEW, SAVED PER PERSON (UX-22-002): the person's own view of the source register (columns, sort, filter
 * text, grouping, density — never the selection) stored as a named value of THEIR navigation state (`shell.navigation_states`, B80 0118 —
 * versioned, append-only, read only by its own principal), restored on arrival reconciled by name against today's columns (what can no
 * longer be honoured is named), and saved only when the person asks (`shell.navigation.save`; a stale save is refused in the server's words
 * and nothing is overwritten). The contract is lib/tableview-b81.ts (tested). PRESENTATION ONLY: a view never filters what the server
 * authorizes, never selects, never acts.
 */
import { useEffect, useRef, useState } from 'react';
import { readNavigation, saveNavigation, type NavigationRead } from '../../../lib/shell-b80';
import { savedViewOf, viewMatches, viewSaveIntake, type SavedView } from '../../../lib/tableview-b81';
import { defaultView, type TableView } from '../../../lib/table-b80';
import { Button } from '../../../components/actions';
import { ErrorNote, Receipt } from '../../../components/ui';
import type { WorkspaceKey } from '../../../lib/b80-seams';

type Err = { code: string; message: string; correlationId: string } | null;

export function SavedViewControl({ scope, workspace, route, title, tableKey, columnKeys, view, onRestore }: {
  scope: { tenantId: string; domainId: string }; workspace: WorkspaceKey; route: string; title: string; tableKey: string; columnKeys: readonly string[];
  view: TableView; onRestore: (v: TableView) => void;
}) {
  const [read, setRead] = useState<NavigationRead | null>(null);
  const [readErr, setReadErr] = useState<Err>(null);
  const [saveErr, setSaveErr] = useState<Err>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const applied = useRef(false);
  const saved: SavedView = savedViewOf(read, workspace, tableKey, columnKeys);

  const load = async (): Promise<SavedView | null> => {
    const r = await readNavigation(scope, workspace);
    if (!r.ok || r.data === undefined) { setReadErr(r.error ?? null); return null; }
    setReadErr(null); setRead(r.data.navigation);
    return savedViewOf(r.data.navigation, workspace, tableKey, columnKeys);
  };
  useEffect(() => {
    void (async () => {
      const s = await load();
      // the person's own view is restored ONCE on arrival (presentation); later reads only report it
      if (s !== null && s.state === 'saved' && !applied.current) { applied.current = true; onRestore(s.reconciled.view); }
    })();
  }, [scope.tenantId, scope.domainId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaveErr(null); setProblem(null); setReceipt(null);
    const mine = read?.workspaces.find((w) => w.workspace === workspace)?.current ?? null;
    const i = viewSaveIntake({ current: mine, workspace, route, title, tableKey, view });
    if (!i.ok) { setProblem(i.reason); return; }
    const r = await saveNavigation(scope, i.intake);
    if (!r.ok || r.data === undefined) { setSaveErr(r.error ?? null); return; }
    setReceipt(r.data.receipt);
    await load();
  };
  const onScreen = saved.state !== 'saved' ? null : viewMatches(saved, view) ? 'on screen: your saved view' : 'on screen: changed since your saved view (not saved)';
  return (
    <div className="eye-saved-view" role="group" aria-label={`Your saved view of ${title}`}>
      <p className="eye-help" id={`saved-view-${tableKey}`} data-saved-view={saved.state} data-saved-version={saved.version ?? ''}>
        {read === null && readErr === null ? 'reading your saved view…' : saved.words}{onScreen !== null ? ` · ${onScreen}` : ''}
      </p>
      <Button label="Save this view" pendingLabel="Saving this view" variant="secondary" size="sm" onClick={save}
        disabledReason={read === null ? (readErr === null ? 'your saved view is read first' : 'saving waits for your saved view to be read (the read was refused)') : null} />{' '}
      <Button label="Show the default view" variant="quiet" size="sm" onClick={() => onRestore(defaultView())} />
      {problem !== null && <p role="alert" className="eye-field-error">✕ {problem}</p>}
      <ErrorNote error={readErr} />
      <ErrorNote error={saveErr} />
      <Receipt receipt={receipt} />
    </div>
  );
}
