import { describe, expect, it } from 'vitest';
import { CLASSIFICATIONS, DRILL_KINDS, INSTANCE_STATUSES, TASK_STATES, chainWords, completableHere, covers, deadlineWords, grantWords, parseSpec, provisionable, taskMark, timerWords } from './workflow';

/** CP-6 B34 (0090 §W): the tasks, the workflow and the workspaces are the server's; the pages word them. */
describe('the workflow, the tasks and the grants are worded, never decided on the client', () => {
  const now = '2026-09-28T12:00:00.000Z';
  it('the vocabularies are the migration\'s (the CHECKs of 0090 §0 and §W)', () => {
    expect([...TASK_STATES]).toEqual(['open', 'escalated', 'completed', 'cancelled', 'lapsed']);
    expect([...INSTANCE_STATUSES]).toEqual(['running', 'completed', 'compensated', 'irreconcilable', 'cancelled']);
    expect([...DRILL_KINDS]).toEqual(['restart_replay', 'duplicate_task', 'duplicate_timer', 'definition_change']);
    expect([...CLASSIFICATIONS]).toEqual(['public', 'internal', 'confidential', 'restricted']);
  });
  it('a deadline: overdue, due, or none — against the server\'s now', () => {
    expect(deadlineWords(null, now)).toBe('no deadline');
    expect(deadlineWords('2026-09-28T09:00:00.000Z', now)).toBe('overdue by 3 h');
    expect(deadlineWords('2026-10-12T12:00:00.000Z', now)).toBe('due in 14 d');
    expect(deadlineWords('2026-09-28T12:05:00.000Z', now)).toBe('due in 5 min');
  });
  it('the escalation chain, oldest first; the state in three channels; Complete is not offered for gate and commitment tasks', () => {
    const chain = [{ from: null, to: 'aaaaaaaa-1', reason: 'opened', actor: 'x', at: null }, { from: 'aaaaaaaa-1', to: 'bbbbbbbb-2', reason: 'escalate', actor: 'agent', at: null },
                   { from: 'bbbbbbbb-2', to: 'cccccccc-3', reason: 'access_lost', actor: 'agent', at: null }];
    expect(chainWords(chain, (id) => String(id).slice(0, 1))).toBe('opened for a → escalated to b → access lost — to c');
    expect(chainWords([])).toBe('no assignment recorded');
    expect(taskMark('escalated', 1).text).toBe('ESCALATED (level 1)');
    expect(taskMark('completed').glyph).toBe('✓');
    expect(completableHere('gate.approve')).toBe(false);
    expect(completableHere('commitment.checkpoint')).toBe(false);
    expect(completableHere('collab.review')).toBe(true);
  });
  it('a grant: live with the time left, or lost; a ceiling covers what is at or below it; a timer fires once', () => {
    expect(grantWords({ state: 'accepted', expires_at: '2026-10-12T12:00:00.000Z', live: true }, now)).toBe('accepted · expires in 14 d');
    expect(grantWords({ state: 'lapsed', expires_at: '2026-09-28T11:00:00.000Z', live: false }, now)).toBe('lapsed at its expiry — access is lost');
    expect(grantWords({ state: 'accepted', expires_at: '2026-09-28T11:00:00.000Z', live: false }, now)).toBe('expired — access is lost');
    // B34-F1 (0091): a requested grant awaits an identity administrator's provisioning; only it offers Provision
    expect(grantWords({ state: 'requested', expires_at: '2026-10-12T12:00:00.000Z', live: false }, now)).toBe('requested — awaiting an identity administrator\'s provisioning');
    expect(grantWords({ state: 'requested', expires_at: '2026-09-28T11:00:00.000Z', live: false }, now)).toBe('requested — expired before it was provisioned');
    expect(['requested', 'invited', 'accepted', 'revoked', 'lapsed'].filter((state) => provisionable({ state }))).toEqual(['requested']);
    expect(covers('internal', 'public')).toBe(true);
    expect(covers('internal', 'confidential')).toBe(false);
    expect(covers('internal', 'bogus')).toBe(false);
    expect(timerWords({ state: 'fired', due_at: now, drift_seconds: 2.34, firing: { outcome: 'fired', tick_key: 1, result: {}, at: now } }, now)).toBe('fired once (fired), 2.3 s after its due instant');
    expect(timerWords({ state: 'pending', due_at: '2026-09-28T13:00:00.000Z', drift_seconds: null, firing: null }, now)).toBe('pending · fires in 1 h');
    expect(timerWords({ state: 'cancelled', due_at: now, drift_seconds: null, firing: null }, now)).toBe('cancelled — never fires');
  });
  it('a spec is a JSON object (the server validates it whole)', () => {
    expect(parseSpec('{"states":[]}').ok).toBe(true);
    expect(parseSpec('[]').ok).toBe(false);
    expect(parseSpec('{').ok).toBe(false);
  });
});
