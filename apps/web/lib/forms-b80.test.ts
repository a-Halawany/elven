import { describe, expect, it } from 'vitest';
import {
  COMBO_CLOSED, DRAFT_LABELS, NO_DRAFT, applyImport, charCount, comboAnnouncement, comboKey, confirm, confirmStepDefaults, dayText, describedBy,
  draftLabelOk, draftStatusText, draftViewOf, edit, errorSummary, fieldId, filterOptions, fromCanonical, instantToLocal, intakeCheck, isProposal,
  localToInstant, parseImport, proposedDefault, resolveConflict, reviewDigest, sourceText, stepperState, submitHolds, toCanonical, typed,
  validateField, validateForm, validateRange, zoneChoices, zoneText, type FieldSpec, type FieldValue,
} from './forms-b80';
import { contentDigest } from './jcs';

/** CP-6 B80 §CL-F — the form contract (UX-21-001..005, CMP-033..040, CMP-070, PAT-03). Every value here is SYNTHETIC. */
const SPECS: FieldSpec[] = [
  { key: 'source_key', label: 'Source key', step: 0, rules: [{ kind: 'required' }, { kind: 'pattern', re: /^[a-z0-9][a-z0-9-]{2,63}$/, message: 'lower-case letters, digits and dashes' }] },
  { key: 'name', label: 'Name', step: 0, rules: [{ kind: 'required' }, { kind: 'maxLength', n: 20 }] },
  { key: 'endpoints', label: 'Endpoints', step: 0, rules: [{ kind: 'httpsList' }] },
  { key: 'cadence', label: 'Cadence', step: 0, rules: [{ kind: 'integer', min: 60 }] },
  { key: 'rights', label: 'Rights state', step: 1, rules: [{ kind: 'required' }] },
  { key: 'owner', label: 'Owner', step: 1, rules: [{ kind: 'uuid' }] },
];
const V = (o: Record<string, FieldValue>) => o;

describe('fields: validation in the product\'s words, in the form\'s order (UX-21-001, CMP-033)', () => {
  it('each rule names the field and says what is wrong', () => {
    const all = V({ source_key: typed('X!'), name: typed(''), endpoints: typed('https://a.example, http://b'), cadence: typed('30'), rights: proposedDefault('pending'), owner: typed('nope') });
    expect(validateForm(SPECS, all).map((e) => e.message)).toEqual([
      'Source key: lower-case letters, digits and dashes', 'Name is required', 'Endpoints: every endpoint is an https:// address (1 is not)',
      'Cadence is at least 60', 'Owner is an identifier (a UUID)']);
    expect(validateForm(SPECS, all, 1).map((e) => e.key)).toEqual(['owner']);
    expect(validateField(SPECS[1]!, typed('ü'.repeat(21)), all)).toBe('Name is at most 20 characters (it has 21)');
    expect(validateField(SPECS[3]!, typed('1.5'), all)).toBe('Cadence is a whole number');
  });
  it('ids and aria-describedby are stable and list only what is present (help, proposal, count, error)', () => {
    expect(fieldId('observation.source.register', 'source_key')).toBe('fld-observation-source-register-source-key');
    expect(describedBy('x', { help: true, error: true })).toBe('x-help x-error');
    expect(describedBy('x', { proposal: true, count: true })).toBe('x-source x-count');
    expect(describedBy('x', {})).toBeUndefined();
  });
  it('the TextArea count is in characters and an over-length is said, never cut (CMP-034)', () => {
    expect(charCount('abc', 5)).toEqual({ count: 3, remaining: 2, over: false, text: '3 of 5 characters' });
    expect(charCount('😀😀😀😀😀😀', 5)).toMatchObject({ count: 6, over: true, text: '6 of 5 characters — 1 over' });
  });
});

describe('proposals stay proposals until the person confirms them (UX-21-004)', () => {
  it('defaults, autocomplete, imported and AI values are proposals; typing makes a value the person\'s own', () => {
    expect(isProposal(proposedDefault('internal'))).toBe(true);
    expect(isProposal({ value: 'x', source: 'ai', confirmed: false, origin: 'corridor-model v3' })).toBe(true);
    expect(isProposal(typed('x'))).toBe(false);
    expect(isProposal(edit('mine'))).toBe(false);
    expect(sourceText(proposedDefault('internal'))).toMatch(/^PROPOSED — a default/);
    expect(sourceText({ value: 'x', source: 'imported', confirmed: false, origin: 'contract.json' })).toBe('PROPOSED — imported from contract.json; confirm it or change it');
    expect(sourceText({ value: 'x', source: 'ai', confirmed: false, origin: 'model m@1' })).toMatch(/never your answer until you confirm it/);
    expect(sourceText(typed('x'))).toBeNull();
  });
  it('an outside value WITHOUT provenance cannot be confirmed; with provenance it can', () => {
    expect(confirm({ value: 'x', source: 'imported', confirmed: false }).confirmed).toBe(false);
    expect(confirm({ value: 'x', source: 'ai', confirmed: false, origin: '' }).confirmed).toBe(false);
    expect(confirm({ value: 'x', source: 'imported', confirmed: false, origin: 'f.csv' }).confirmed).toBe(true);
  });
  it('continuing past a step confirms the DEFAULTS on that step only — never an imported or AI value, never another step\'s', () => {
    const all = V({ name: proposedDefault('n'), rights: proposedDefault('pending'), cadence: { value: '60', source: 'imported', confirmed: false, origin: 'f.csv' } });
    const after = confirmStepDefaults(SPECS, all, 0);
    expect(after['name']!.confirmed).toBe(true);
    expect(after['cadence']!.confirmed).toBe(false);
    expect(after['rights']!.confirmed).toBe(false);
  });
});

describe('the submit is HELD, each reason named in context and in the summary (UX-21-005, CMP-070)', () => {
  const clean = V({ source_key: typed('imf-portwatch'), name: typed('PortWatch'), endpoints: typed(''), cadence: typed('86400'), rights: typed('pending'), owner: typed('') });
  it('a clean, reviewed body is not held', () => {
    expect(submitHolds({ specs: SPECS, values: clean, reviewedDigest: 'd', currentDigest: 'd' })).toEqual([]);
  });
  it('invalid fields, validation unavailable, a conflict, a value with no provenance, an unconfirmed proposal, an unacknowledged irreversible effect, a body changed since review', () => {
    const v = V({ ...clean, name: typed(''), cadence: { value: '60', source: 'ai', confirmed: false, origin: 'm@1' }, owner: { value: '0190a0b0-0000-7000-8000-000000000001', source: 'imported', confirmed: false } });
    const holds = submitHolds({ specs: SPECS, values: v, validationUnavailable: 'the publisher list could not be read',
      conflicts: [{ key: 'source_key', label: 'Source key', current: 'imf-portwatch', imported: 'imf-pw', origin: 'contract.json' }],
      irreversible: { statement: 'the key is permanent', acknowledged: false }, reviewedDigest: 'aaa', currentDigest: 'bbb' });
    expect(holds.map((h) => h.kind)).toEqual(['invalid', 'validation_unavailable', 'conflict', 'unconfirmed_proposal', 'missing_provenance', 'irreversible_unacknowledged', 'changed_since_review']);
    expect(holds.find((h) => h.kind === 'conflict')!.message).toBe('Source key: you typed “imf-portwatch” and contract.json says “imf-pw” — choose one');
    expect(holds.find((h) => h.kind === 'missing_provenance')!.field).toBe('owner');
    expect(submitHolds({ specs: SPECS, values: clean, reviewedDigest: null, currentDigest: 'x' }).map((h) => h.kind)).toEqual(['not_reviewed']);
  });
  it('the Error Summary counts the holds and links each field-bound hold to its field', () => {
    const s = errorSummary('f', [{ kind: 'invalid', field: 'name', message: 'Name is required' }, { kind: 'validation_unavailable', message: 'Validation could not run' }])!;
    expect(s.title).toBe('There are 2 problems to resolve before this can be submitted');
    expect(s.items).toEqual([{ href: '#fld-f-name', text: 'Name is required' }, { href: null, text: 'Validation could not run' }]);
    expect(errorSummary('f', [])).toBeNull();
  });
  it('the review digest IS the envelope payload digest (JCS SHA-256 of the exact body); any change moves it', async () => {
    const body = { contract: { source_key: 'imf-portwatch', lifecycle: { effective_from: '2026-10-17T10:00:00.000Z' } } };
    expect(await reviewDigest(body)).toBe(await contentDigest(body));
    expect(await reviewDigest({ contract: { ...body.contract, source_key: 'imf-portwatch-2' } })).not.toBe(await reviewDigest(body));
    expect(await reviewDigest({ b: 1, a: 2 })).toBe(await reviewDigest({ a: 2, b: 1 }));
  });
});

describe('import: JSON or CSV into the form, conflicts never silently resolved (UX-21-003)', () => {
  it('JSON objects are flattened to dotted keys (lists joined); CSV is field,value rows (a header skipped); bad input is said', () => {
    expect(parseImport('{"name":"PortWatch","identity":{"endpoints":["https://a","https://b"]}}', 'c.json')).toEqual({ ok: true, format: 'json', values: { name: 'PortWatch', 'identity.endpoints': 'https://a, https://b' }, error: null });
    expect(parseImport('field,value\nname,"Port, Watch"\ncadence,86400\n', 'c.csv')).toEqual({ ok: true, format: 'csv', values: { name: 'Port, Watch', cadence: '86400' }, error: null });
    expect(parseImport('[1,2]', 'c.json').error).toBe('c.json is not a JSON object');
    expect(parseImport('{nope', 'c.json').ok).toBe(false);
    expect(parseImport('', 'c.csv').error).toBe('c.csv is empty');
    expect(parseImport('only-one-cell', 'c.csv').error).toMatch(/line 1 is not a "field,value" row/);
  });
  it('empty fields and unconfirmed proposals take the import as a PROPOSAL with its origin; a typed value that differs is a CONFLICT; unknown keys are reported', () => {
    const r = applyImport(SPECS, V({ name: typed('Mine'), source_key: typed('same'), rights: proposedDefault('pending') }),
      { name: 'Theirs', source_key: 'same', rights: 'confirmed', cadence: '3600', 'identity.endpoints': 'https://x', bogus: '1' }, 'contract.json', { 'identity.endpoints': 'endpoints' });
    expect(r.conflicts).toEqual([{ key: 'name', label: 'Name', current: 'Mine', imported: 'Theirs', origin: 'contract.json' }]);
    expect(r.applied.sort()).toEqual(['cadence', 'endpoints', 'rights']);
    expect(r.values['rights']).toEqual({ value: 'confirmed', source: 'imported', confirmed: false, origin: 'contract.json' });
    expect(r.values['name']).toEqual(typed('Mine'));
    expect(r.values['source_key']).toEqual(typed('same'));
    expect(r.unknown).toEqual(['bogus']);
    const keep = resolveConflict(r.values, r.conflicts, 'name', 'current');
    expect(keep.values['name']).toEqual(typed('Mine')); expect(keep.conflicts).toEqual([]);
    const take = resolveConflict(r.values, r.conflicts, 'name', 'imported');
    expect(take.values['name']).toEqual({ value: 'Theirs', source: 'imported', confirmed: true, origin: 'contract.json' });
  });
});

describe('the stepper (UX-21-003): current, visited, with problems — in words', () => {
  it('a visited step with an error is invalid; the current step is current; the rest upcoming', () => {
    const st = stepperState(['Identity', 'Authority', 'Review'], 2, new Set([0, 1]), [{ key: 'name', label: 'Name', step: 0, message: 'x' }]);
    expect(st.map((s) => s.state)).toEqual(['invalid', 'complete', 'current']);
    expect(st[0]!.label).toBe('1. Identity (has problems)');
  });
});

describe('the draft (PAT-03): never a submission, never labelled approval', () => {
  it('the server read becomes the view; the status says what is kept and that nothing was sent', () => {
    const v = draftViewOf({ state: 'live', draft: { draft_id: 'd1', version: 3, saved_at: '2026-10-17T10:00:00.000Z', expires_at: '2026-10-24T10:00:00.000Z', payload_digest: 'a'.repeat(64) } });
    expect(v).toMatchObject({ state: 'live', draftId: 'd1', version: 3 });
    expect(draftStatusText(v, false)).toBe('draft v3 saved 2026-10-17 10:00 UTC — kept until 2026-10-24 10:00 UTC; a draft is not sent to anyone');
    expect(draftStatusText(v, true)).toMatch(/^Unsaved changes since draft v3/);
    expect(draftStatusText({ ...v, state: 'expired' }, false)).toMatch(/expired 2026-10-24 10:00 UTC — its content is no longer offered/);
    expect(draftStatusText(draftViewOf(null, 'no qualifying role binding'), false)).toMatch(/^Drafts are unavailable: no qualifying role binding — the form still works/);
    expect(draftStatusText(NO_DRAFT, false)).toBe('No saved draft');
    for (const t of [draftStatusText(v, false), draftStatusText(NO_DRAFT, true)]) expect(t).not.toMatch(/submitted|approved/i);
  });
  it('the draft labels are draft labels; an approval-like label is refused', () => {
    for (const l of Object.values(DRAFT_LABELS)) expect(draftLabelOk(l)).toBe(true);
    expect(draftLabelOk('Submit draft')).toBe(false);
    expect(draftLabelOk('Approve draft')).toBe(false);
    expect(draftLabelOk('Save')).toBe(false);
  });
});

describe('date and time: a DATE is the day it names; an instant is entered in an explicit zone (CMP-037)', () => {
  it('a date string is cut, never parsed through a local midnight', () => {
    expect(dayText('2024-01-17')).toBe('2024-01-17');
    expect(dayText('2024-01-17T00:00:00.000Z')).toBe('2024-01-17');
    expect(dayText(null)).toBe('none recorded');
  });
  it('a wall clock in a zone ↔ the UTC instant, across DST; a skipped hour is refused, not shifted', () => {
    expect(localToInstant('2026-01-15T09:30', 'Europe/Berlin')).toBe('2026-01-15T08:30:00.000Z');
    expect(localToInstant('2026-07-15T09:30', 'Europe/Berlin')).toBe('2026-07-15T07:30:00.000Z');
    expect(localToInstant('2026-03-29T02:30', 'Europe/Berlin')).toBeNull();
    expect(localToInstant('2026-01-15T09:30', 'UTC')).toBe('2026-01-15T09:30:00.000Z');
    expect(localToInstant('2026-01-15T09:30', 'Not/AZone')).toBeNull();
    expect(instantToLocal('2026-07-15T07:30:00.000Z', 'Europe/Berlin')).toBe('2026-07-15T09:30');
    expect(instantToLocal('2026-07-15T07:30:00.000Z', 'Asia/Kolkata')).toBe('2026-07-15T13:00');
    expect(zoneText('Europe/Berlin', new Date('2026-01-15T00:00:00Z'))).toBe('Europe/Berlin (UTC+01:00)');
    expect(zoneText('America/New_York', new Date('2026-07-15T00:00:00Z'))).toBe('America/New_York (UTC-04:00)');
  });
  it('the zones offered: UTC always, the person\'s own and the event\'s when they differ', () => {
    expect(zoneChoices('Europe/Berlin', 'Asia/Aden').map((z) => z.zone)).toEqual(['UTC', 'Europe/Berlin', 'Asia/Aden']);
    expect(zoneChoices('UTC', 'UTC').map((z) => z.zone)).toEqual(['UTC']);
    expect(zoneChoices(null, 'Bogus/Zone').map((z) => z.zone)).toEqual(['UTC']);
  });
});

describe('units and ranges (CMP-038 / CMP-039)', () => {
  it('the original value and unit and the canonical stored value; a non-whole canonical duration is said', () => {
    expect(toCanonical('2', 'h', 'duration')).toMatchObject({ ok: true, canonical: 7200, canonicalUnit: 's', exact: true });
    expect(toCanonical('0.001', 'min', 'duration')).toMatchObject({ ok: true, exact: false, error: '0.001 min is not a whole number of s' });
    expect(toCanonical('', 's', 'duration')).toMatchObject({ ok: false, error: 'enter a number' });
    expect(toCanonical('1', 'parsec', 'duration')).toMatchObject({ ok: false, error: 'parsec is not a unit of duration' });
    expect(fromCanonical(86400, 'duration')).toEqual({ value: '1', unit: 'd' });
    expect(fromCanonical(259200, 'duration')).toEqual({ value: '3', unit: 'd' });
    expect(fromCanonical(90, 'duration')).toEqual({ value: '90', unit: 's' });
  });
  it('a range: both bounds, lower ≤ upper, inside the limits; an open upper bound when allowed', () => {
    expect(validateRange('', '', { label: 'Draft' })).toBeNull();
    expect(validateRange('5', '', { label: 'Draft' })).toBe('Draft: give both the lower and the upper bound');
    expect(validateRange('5', '', { label: 'Draft', openEnded: true })).toBeNull();
    expect(validateRange('9', '3', { label: 'Draft', unit: 'm' })).toBe('Draft: the lower bound (9 m) is above the upper bound (3 m)');
    expect(validateRange('-1', '3', { label: 'Draft', min: 0, unit: 'm' })).toBe('Draft: the lower bound is at least 0 m');
  });
});

describe('the combobox keyboard contract (CMP-036, ARIA 1.2)', () => {
  const opts = [{ value: 'a', label: 'Alpha DEC' }, { value: 'b', label: 'Beta DEC', disabled: 'withdrawn' }, { value: 'c', label: 'Gamma DEC', description: 'from a package' }];
  it('filters on label, value and description', () => {
    expect(filterOptions(opts, 'gam').map((o) => o.value)).toEqual(['c']);
    expect(filterOptions(opts, 'package').map((o) => o.value)).toEqual(['c']);
    expect(filterOptions(opts, '').length).toBe(3);
  });
  it('ArrowDown opens on the first and wraps; ArrowUp opens on the last; Enter selects the active; a disabled option is never selected; Escape closes, then clears', () => {
    let s = COMBO_CLOSED;
    s = comboKey(s, 'ArrowDown', opts).state; expect(s).toMatchObject({ open: true, active: 0 });
    s = comboKey(s, 'ArrowDown', opts).state; s = comboKey(s, 'ArrowDown', opts).state; s = comboKey(s, 'ArrowDown', opts).state; expect(s.active).toBe(0);
    expect(comboKey(COMBO_CLOSED, 'ArrowUp', opts).state.active).toBe(2);
    const onB = { open: true, active: 1, query: '' };
    expect(comboKey(onB, 'Enter', opts).select).toBeNull();
    const r = comboKey({ open: true, active: 2, query: 'g' }, 'Enter', opts);
    expect(r.select!.value).toBe('c'); expect(r.state).toEqual({ open: false, active: null, query: 'Gamma DEC' });
    expect(comboKey({ open: true, active: 0, query: 'x' }, 'Escape', opts).state).toEqual({ open: false, active: null, query: 'x' });
    expect(comboKey({ open: false, active: null, query: 'x' }, 'Escape', opts).state.query).toBe('');
    expect(comboKey({ open: true, active: 1, query: '' }, 'Tab', opts)).toMatchObject({ state: { open: false }, select: null, prevent: false });
    expect(comboKey({ open: true, active: 1, query: '' }, 'End', opts).state.active).toBe(2);
  });
  it('the announcement is never silent about zero matches', () => {
    expect(comboAnnouncement({ open: true, active: null, query: 'zz' }, [])).toMatch(/^No option matches/);
    expect(comboAnnouncement({ open: true, active: null, query: '' }, opts)).toBe('3 options available');
    expect(comboAnnouncement(COMBO_CLOSED, opts)).toBe('');
  });
});

describe('file intake against the upload connector\'s own limits (CMP-040)', () => {
  it('accepts PDF/DOCX/CSV up to 25 files and 64 MiB; refuses the rest, each with its reason', () => {
    const r = intakeCheck([{ name: 'a.pdf', size: 10, type: 'application/pdf' }, { name: 'b.exe', size: 1, type: '' }, { name: 'c.csv', size: 64 * 1024 * 1024, type: 'text/csv' }]);
    expect(r.accepted.map((f) => f.name)).toEqual(['a.pdf']);
    expect(r.refused).toEqual([{ name: 'b.exe', reason: '.exe is not accepted here (.pdf, .docx, .csv)' }, { name: 'c.csv', reason: 'the intake is at most 64 MiB in all' }]);
    const many = Array.from({ length: 26 }, (_, i) => ({ name: `f${i}.pdf`, size: 1, type: 'application/pdf' }));
    expect(intakeCheck(many).refused).toEqual([{ name: 'f25.pdf', reason: 'at most 25 files per intake' }]);
  });
});
