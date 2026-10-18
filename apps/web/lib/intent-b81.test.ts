/**
 * CP-6 B81 §SI — the DETERMINISTIC interpreter and the palette's modes (UX-13-001, UX-13-003, UX-13-004, UX-13-005, PAT-15; the fixtures of
 * UX-13-006: mode confusion, ambiguous intent, interpreter disagreement, preview, cancellation — permission trimming is search-b81's and the
 * harness's). Every record here is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoExecution, reviewRequested } from './authority-b81';
import {
  COMMANDS, INTERPRETER_VERSION, LITERAL_INTERPRETER, MODE_SPEC, PALETTE_MODES, commandEntries, disagreement, intentRecordOf, interpret, modeItems, parseModePrefix, previewLine, wordsOf,
  type IntentHit,
} from './intent-b81';

const WEB = join(__dirname, '..');
const OBJ = '0192a000-0000-7000-8000-00000000000a'; const CAP = '0192a000-0000-7000-8000-00000000000b'; const STK = '0192a000-0000-7000-8000-00000000000c';
const RSK = '0192a000-0000-7000-8000-00000000000d'; const ENT = '0192a000-0000-7000-8000-00000000000e'; const PKG = '0192a000-0000-7000-8000-00000000000f';
const PKG2 = '0192a000-0000-7000-8000-000000000010';
/** The NORDWERK-like hits (SYNTHETIC): "Regensburg" names an objective, a capability, a stakeholder and an exposure. */
const HITS: IntentHit[] = [
  { key: `ENT:${ENT}`, kind: 'entity', label: 'Bab el-Mandeb Strait', href: `/graph/entities?entity=${ENT}`, leg: 'graph', id: ENT },
  { key: `OBJ:${OBJ}`, kind: 'objective', label: 'Keep the Regensburg line supplied through Q1', href: '/graph/strategy', leg: 'strategy', id: OBJ },
  { key: `CAP:${CAP}`, kind: 'capability', label: 'Regensburg assembly', href: '/graph/strategy', leg: 'strategy', id: CAP },
  { key: `STK:${STK}`, kind: 'stakeholder', label: 'Regensburg line workforce', href: '/graph/strategy', leg: 'strategy', id: STK },
  { key: `RSK:${RSK}`, kind: 'exposure', label: 'Corridor closure — Regensburg line', href: '/prediction/exposures', leg: 'exposures', id: RSK },
  { key: `DPK:${PKG}`, kind: 'package', label: 'Corridor reroute via the Cape (SYNTHETIC)', href: `/decisions/packages/${PKG}`, leg: 'packages', id: PKG },
];

describe('the modes (UX-13-001, UX-13-003): four, distinct, chosen — never inferred silently', () => {
  it('Go to · Search · Ask · Command, each with its own label, input name and statement of what it does', () => {
    expect(PALETTE_MODES).toEqual(['goto', 'search', 'ask', 'command']);
    expect(PALETTE_MODES.map((m) => MODE_SPEC[m].label)).toEqual(['Go to', 'Search', 'Ask', 'Command']);
    expect(new Set(PALETTE_MODES.map((m) => MODE_SPEC[m].inputLabel)).size).toBe(4);
    expect(MODE_SPEC.command.says).toMatch(/Nothing runs from here/);
    expect(MODE_SPEC.ask.says).toMatch(/no model/);
    for (const m of PALETTE_MODES) expect(MODE_SPEC[m].says).not.toMatch(/\b(chat|copilot|assistant)\b/i);
  });
  it('a typed prefix switches the mode VISIBLY and leaves the text; no prefix keeps the mode', () => {
    expect(parseModePrefix('> approve corridor reroute', 'goto')).toEqual({ mode: 'command', text: 'approve corridor reroute', switched: true });
    expect(parseModePrefix('?Bab el-Mandeb', 'goto')).toEqual({ mode: 'ask', text: 'Bab el-Mandeb', switched: true });
    expect(parseModePrefix('/strait', 'search')).toEqual({ mode: 'search', text: 'strait', switched: false });
    expect(parseModePrefix('warnings', 'ask')).toEqual({ mode: 'ask', text: 'warnings', switched: false });
  });
});

describe('the interpreter is DETERMINISTIC and has no model (D4 / Q2)', () => {
  it('the same words and hits give the same reading, whatever order the hits arrive in', () => {
    const a = interpret('Bab el-Mandeb exposure Regensburg', { mode: 'ask', hits: HITS });
    const b = interpret('Bab el-Mandeb exposure Regensburg', { mode: 'ask', hits: [...HITS].reverse() });
    expect(b).toEqual(a);
    expect(a.interpreter).toBe(INTERPRETER_VERSION);
  });
  it('THE SOURCE: no network, no model, no randomness, no clock — it imports only the seams and §HA\'s pure hand-off', () => {
    const src = readFileSync(join(WEB, 'lib/intent-b81.ts'), 'utf8');
    expect([...new Set([...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]))]).toEqual(['./b81-seams', './authority-b81']);
    expect(src).not.toMatch(/\bfetch\(|\bcall\(|Math\.random|Date\.now|new Date\(/);
  });
  it('the words: kind words scope (never searched), stop words split, the phrases are the rest', () => {
    expect(wordsOf('Bab el-Mandeb exposure Regensburg')).toEqual({ verb: null, kinds: ['exposure'], phrases: ['Bab el-Mandeb', 'Regensburg'] });
    expect(wordsOf('exposures of Bab el-Mandeb at Regensburg')).toEqual({ verb: null, kinds: ['exposure'], phrases: ['Bab el-Mandeb', 'Regensburg'] });
    expect(wordsOf('approve corridor reroute')).toEqual({ verb: 'approve', kinds: [], phrases: ['corridor reroute'] });
  });
});

describe('UX-13-005 / PAT-15 — AMBIGUOUS INTENT: a bounded clarification, the input kept, NOTHING preselected, no silent guess', () => {
  const r = interpret('Bab el-Mandeb exposure Regensburg', { mode: 'ask', hits: HITS });
  it('"Regensburg" names an objective, a capability, a stakeholder and an exposure — the reading asks which', () => {
    expect(r.kind).toBe('ambiguous');
    expect(r.input).toBe('Bab el-Mandeb exposure Regensburg');
    expect(r.kinds).toEqual(['exposure']);
    expect(r.phrases).toEqual(['Bab el-Mandeb', 'Regensburg']);
    expect(r.ambiguousPhrase).toBe('Regensburg');
    expect(r.alternatives.map((a) => a.kind)).toEqual(['capability', 'exposure', 'objective', 'stakeholder']);
    expect(r.clarification).toMatch(/^Which “Regensburg” do you mean — the capability “Regensburg assembly”, .* or the stakeholder “Regensburg line workforce”\?$/);
    expect(r.chosen).toBeNull();
    for (const a of r.alternatives) expect(Object.keys(a).sort()).toEqual(['detail', 'key', 'kind', 'label', 'target']);
    expect(r.options).toEqual(r.alternatives.map(({ label, target }) => ({ label, target })));
  });
  it('a phrase naming ONE record is no ambiguity; a phrase naming none is said ("matches nothing you may see")', () => {
    const one = interpret('Bab el-Mandeb', { mode: 'ask', hits: HITS });
    expect(one.kind).toBe('search');
    const none = interpret('Hormuz exposure', { mode: 'ask', hits: HITS });
    expect(none).toMatchObject({ kind: 'search', kinds: ['exposure'], phrases: ['Hormuz'] });
    expect(none.uncertainty).toContain('“Hormuz” matches nothing you may see');
  });
  it('PREVIEW: before any read the reading says it is not yet checked — and is shown in words before results or a review', () => {
    const p = interpret('Bab el-Mandeb exposure Regensburg', { mode: 'ask' });
    expect(p.kind).toBe('search');
    expect(p.uncertainty[0]).toMatch(/not yet checked against what you may see/);
    expect(previewLine(p)).toBe('Search exposure of “Bab el-Mandeb” and “Regensburg”.');
    expect(previewLine(r)).toBe(r.clarification);
  });
  it('the intent record: the choice must be one offered; CANCELLATION records no choice; an ambiguous reading leads nowhere until the person chooses', () => {
    const chosen = intentRecordOf(r, { outcome: 'chosen', choice: `OBJ:${OBJ}` });
    expect(chosen).toMatchObject({ mode: 'ask', input: 'Bab el-Mandeb exposure Regensburg', interpreter: INTERPRETER_VERSION, outcome: 'chosen', choice: `OBJ:${OBJ}`, commandAction: null,
      interpretation: { kind: 'ambiguous', kinds: ['exposure'], terms: ['Bab el-Mandeb', 'Regensburg'] } });
    expect(intentRecordOf(r, { outcome: 'chosen', choice: 'OBJ:somewhere-else' })).toMatch(/not one of the alternatives offered/);
    expect(intentRecordOf(r, { outcome: 'cancelled', choice: null })).toMatchObject({ outcome: 'cancelled', choice: null });
    expect(intentRecordOf(r, { outcome: 'navigated', choice: null })).toMatch(/leads nowhere until you choose/);
  });
});

describe('UX-13-004 — a COMMAND is proposed and handed off to its Command Review; nothing executes', () => {
  it('"approve corridor reroute" (Command mode) with the package found: ONE hand-off to the decisions page\'s review of decision.approve — not chosen, not run', () => {
    const r = interpret('approve corridor reroute', { mode: 'command', hits: HITS });
    expect(r.kind).toBe('command');
    expect(r.command?.action).toBe('decision.approve');
    expect(r.handoffs.map((h) => h.href)).toEqual([`/decisions?package=${PKG}&review=decision.approve`]);
    expect(reviewRequested(r.handoffs[0]!.href.slice(r.handoffs[0]!.href.indexOf('?')))).toBe('decision.approve');
    expect(() => assertNoExecution(r.handoffs as unknown as Array<Record<string, unknown>>)).not.toThrow();
    expect(r.chosen).toBeNull();
    expect(intentRecordOf(r, { outcome: 'command_review', choice: `DPK:${PKG}` })).toMatchObject({ outcome: 'command_review', commandAction: 'decision.approve', choice: `DPK:${PKG}` });
  });
  it('two matching packages — a clarification, nothing preselected; none matching — the page that lists them, said so', () => {
    const two = interpret('approve corridor', { mode: 'command', hits: [...HITS, { ...HITS[5]!, key: `DPK:${PKG2}`, id: PKG2, label: 'Corridor insurance programme (SYNTHETIC)' }] });
    expect(two.kind).toBe('ambiguous');
    expect(two.handoffs).toHaveLength(2);
    expect(two.clarification).toMatch(/^Which package do you mean/);
    const none = interpret('approve hormuz bypass', { mode: 'command', hits: HITS });
    expect(none.handoffs.map((h) => h.href)).toEqual(['/decisions?review=decision.approve']);
    expect(none.uncertainty).toContain('no package you may see matches “hormuz bypass” — the page lists them');
  });
  it('a qualifier selects among commands sharing a verb (board); Ask with a command verb proposes the command too', () => {
    expect(interpret('approve board corridor reroute', { mode: 'command', hits: HITS }).command?.action).toBe('decision.board.approve');
    expect(interpret('approve corridor reroute', { mode: 'ask', hits: HITS }).kind).toBe('command');
  });
  it('MODE CONFUSION: the same words in Search mode are SEARCHED as typed (and the reading says Command mode would open its review)', () => {
    const s = interpret('approve corridor reroute', { mode: 'search', hits: HITS });
    expect(s).toMatchObject({ kind: 'search', command: null, phrases: ['approve corridor reroute'], handoffs: [] });
    expect(s.uncertainty[0]).toMatch(/reads like a command — Search only searches the words; Command mode opens its review/);
  });
  it('UNSUPPORTED: a destructive or unknown verb is said to be unsupported — never mapped to the nearest act', () => {
    const d = interpret('delete all warnings', { mode: 'command' });
    expect(d).toMatchObject({ kind: 'none', handoffs: [], alternatives: [] });
    expect(d.reason).toMatch(/^unsupported: the palette offers no command to “delete”/);
    expect(intentRecordOf(d, { outcome: 'unsupported' })).toMatchObject({ outcome: 'unsupported', choice: null, commandAction: null });
  });
  it('the Command mode\'s catalogue entries are hand-offs only, each to a page that renders its Command Review', () => {
    const all = commandEntries('');
    expect(all.map((c) => c.action)).toEqual(COMMANDS.map((c) => c.action));
    expect(() => assertNoExecution(all as unknown as Array<Record<string, unknown>>)).not.toThrow();
    expect(commandEntries('approve').map((c) => c.action)).toEqual(['decision.approve', 'decision.board.approve']);
    for (const c of COMMANDS) {
      const page = readFileSync(join(WEB, 'app', ...c.page.split('/').filter((x) => x !== ''), 'page.tsx'), 'utf8');
      const reviewed = page.includes('<CommandReview') || page.includes('<GateCompletion');
      expect(reviewed, `${c.page} renders the review of ${c.action}`).toBe(true);
    }
  });
});

describe('UX-13-005 — INTERPRETER DISAGREEMENT: two versions reading the same words differently become a question', () => {
  it('the literal reading and this one differ on "Bab el-Mandeb exposure Regensburg" — two alternatives, nothing chosen', () => {
    const lit = interpret('Bab el-Mandeb exposure Regensburg', { mode: 'ask', version: LITERAL_INTERPRETER });
    const cur = interpret('Bab el-Mandeb exposure Regensburg', { mode: 'ask' });
    const d = disagreement(lit, cur)!;
    expect(d.kind).toBe('ambiguous');
    expect(d.alternatives.map((a) => a.key)).toEqual([LITERAL_INTERPRETER, INTERPRETER_VERSION]);
    expect(d.clarification).toMatch(/^Two readings of your words differ: “Bab el-Mandeb exposure Regensburg” as typed \(b81-si-literal-1\) or exposure of “Bab el-Mandeb Regensburg” \(b81-si-intent-1\)/);
    expect(d.chosen).toBeNull();
    expect(disagreement(cur, interpret('Bab el-Mandeb exposure Regensburg', { mode: 'ask' }))).toBeNull();
  });
});

describe('the palette\'s items per mode — each passes the guard: it navigates or hands off; nothing runs', () => {
  it('Search hands the words as typed to the search page; Ask hands the reading; Command hands each matching command to its review', () => {
    const s = modeItems('search', 'Bab el-Mandeb', true);
    expect(s.items.map((i) => [i.kind, i.href])).toEqual([['search', '/graph/search/all?q=Bab%20el-Mandeb&mode=search']]);
    const a = modeItems('ask', 'Bab el-Mandeb exposure Regensburg', true);
    expect(a.items.map((i) => [i.kind, i.href, i.detail])).toEqual([['ask', '/graph/search/all?q=Bab%20el-Mandeb%20exposure%20Regensburg&mode=ask', 'Search exposure of “Bab el-Mandeb” and “Regensburg”.']]);
    const c = modeItems('command', 'approve corridor reroute', true);
    expect(c.items.map((i) => [i.action, i.href])).toEqual([
      ['decision.approve', '/graph/search/all?q=approve%20corridor%20reroute&mode=command&review=decision.approve'],
      ['decision.board.approve', '/graph/search/all?q=approve%20corridor%20reroute&mode=command&review=decision.board.approve']]);
    const bare = modeItems('command', 'approve', true);
    expect(bare.items.map((i) => i.href)).toEqual(['/decisions?review=decision.approve', '/decisions/board?review=decision.board.approve']);
    for (const items of [s.items, a.items, c.items, bare.items, modeItems('command', '', true).items]) expect(() => assertNoExecution(items as unknown as Array<Record<string, unknown>>)).not.toThrow();
  });
  it('the admin workspace has no domain to search — the reason is said, nothing is offered; an unsupported verb offers the search instead', () => {
    expect(modeItems('search', 'x', false)).toEqual({ items: [], reason: 'Search runs in a domain workspace — this workspace has no domain to search. Open a domain workspace first.' });
    const d = modeItems('command', 'delete all warnings', true);
    expect(d.reason).toMatch(/^Unsupported: the palette offers no command to “delete”/);
    expect(d.items.map((i) => i.kind)).toEqual(['search']);
  });
});
