'use client';
/**
 * B34 (0090) attention — THE ACT (F-P6-07; PR-44-*, CAP-EO-06): a registered governed action launched from the selected item, under the
 * human gate. The server decides everything: whether the class has an act (health.change never — a score change triggers review, never
 * action), whether this person may act on the item, and — as its OWN governed write with its own rule — whether the governed action
 * itself is allowed (a refusal there is RECORDED on the item, item.act_refused, and shown in the server's words). The panel offers the
 * registered acts of the item's class and shows every act of the item with its outcome.
 */
import { useEffect, useState } from 'react';
import { acts as api, actLine, actOptions, B34_CLASS_WORDS, canAct, sponsorParams, type ActRegistryRow, type AttentionAct } from '../../../lib/attention';
import type { Scope } from '../../../lib/observation';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td } from '../../../components/ui';

const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)', marginBlockEnd: 'var(--eye-space-2)' } as const;
const rowStyle = { display: 'flex', gap: 'var(--eye-space-2)', flexWrap: 'wrap', alignItems: 'flex-end' } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  r.error === undefined ? `${fallback} (HTTP ${r.status})` : `${r.error.code}: ${r.error.message}`;

export function ActPanel({ scope, item, onActed }: { scope: Scope; item: { item_id: string; signal_class: string; state: string; title: string; subject_id: string }; onActed?: () => void }) {
  const [registry, setRegistry] = useState<ActRegistryRow[]>([]);
  const [noAct, setNoAct] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<AttentionAct[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [rationale, setRationale] = useState('');
  const [version, setVersion] = useState('1'); const [digest, setDigest] = useState(''); const [option, setOption] = useState('');
  const [terms, setTerms] = useState(''); const [conditions, setConditions] = useState(''); const [note, setNote] = useState('');

  const load = async () => {
    const r = await api.list(scope, item.item_id);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the acts could not be read')); return; }
    setProblem(null); setRegistry(r.data.acts); setNoAct(r.data.no_act ?? {}); setHistory(r.data.items);
  };
  useEffect(() => { setSaid(null); setKey(''); void load(); }, [scope, item.item_id]);
  const options = actOptions(item.signal_class, registry, noAct);
  const chosen = options.acts.find((a) => a.action_key === key) ?? options.acts[0] ?? null;
  const params = (): Record<string, unknown> =>
    chosen?.action_key === 'sponsor' ? sponsorParams({ version, digest, optionKey: option, rationale: terms, conditions }) : note.trim() === '' ? {} : { note: note.trim() };

  return (
    <section aria-labelledby="act-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-3)' }}>
      <h3 id="act-h" style={h3}>Act on this item</h3>
      {B34_CLASS_WORDS[item.signal_class] !== undefined && <p style={muted}>{B34_CLASS_WORDS[item.signal_class]}.</p>}
      {problem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not read — {problem}</span></LiveStatus>}
      {options.none !== null ? <Empty>{options.none}.</Empty> : !canAct(item.state) ? <Empty>An {item.state} item launches no act.</Empty> : chosen !== null && (
        <>
          <p style={muted}>
            The act is a named member&apos;s, human-gated; the governed action (<Mono>{chosen.governed_action}</Mono>) is performed as its own write under
            its own rule — a refusal there is recorded on the item and shown here.
          </p>
          <div style={rowStyle}>
            <label>Act{' '}
              <select style={inputStyle} value={chosen.action_key} onChange={(e) => setKey(e.target.value)}>
                {options.acts.map((a) => <option key={a.action_key} value={a.action_key}>{a.action_key} — {a.description}</option>)}
              </select>
            </label>
            <label>Rationale <input style={inputStyle} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="why (8+ characters)" /></label>
          </div>
          {chosen.action_key === 'sponsor' ? (
            <div style={rowStyle}>
              <label>Version <input style={{ ...inputStyle, width: '5em' }} value={version} onChange={(e) => setVersion(e.target.value)} /></label>
              <label>Digest <input style={inputStyle} value={digest} onChange={(e) => setDigest(e.target.value)} placeholder="the exact version's digest" /></label>
              <label>Option <input style={inputStyle} value={option} onChange={(e) => setOption(e.target.value)} placeholder="option key" /></label>
              <label>Terms rationale <input style={inputStyle} value={terms} onChange={(e) => setTerms(e.target.value)} /></label>
              <label>Conditions (one per line) <textarea style={inputStyle} value={conditions} onChange={(e) => setConditions(e.target.value)} rows={2} /></label>
            </div>
          ) : (
            <div style={rowStyle}><label>Note <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="the note the governed action records" /></label></div>
          )}
          <GovernedButton label={`Launch: ${chosen.action_key}`} pendingLabel="acting" disabled={rationale.trim().length < 8}
            onRun={async () => {
              setSaid(null);
              const r = await api.act(scope, item.item_id, chosen.action_key, rationale, params());
              await load();
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the act was refused'); setSaid(m); throw new Error(m); }
              setSaid(actLine(r.data.act)); onActed?.();
            }} />
          {said !== null && <p role="status">{said}</p>}
        </>
      )}
      {history.length === 0 ? <p style={muted}>No act was launched from this item.</p> : (
        <ScrollBox label="acts of this item">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Act</Th><Th>By</Th><Th>Launched</Th><Th>Outcome</Th><Th>Rationale</Th></tr></thead>
            <tbody>{history.map((a) => (
              <tr key={a.act_id}><Td mono>{a.action_key}</Td><Td mono>{a.launched_by.slice(0, 8)}…</Td><Td>{fmtInstant(a.launched_at)}</Td><Td>{actLine(a)}</Td><Td>{a.rationale}</Td></tr>
            ))}</tbody>
          </table>
        </ScrollBox>
      )}
    </section>
  );
}
