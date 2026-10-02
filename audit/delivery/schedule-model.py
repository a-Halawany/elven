#!/usr/bin/env python3
"""The delivery plan's schedule model (audit/DELIVERY_PLAN.md §5; baseline 2026-09-24, corrected 2026-09-25).

WHAT IT SCHEDULES: the implementation stages (milestone M1) and the hardening stages H1–H3 (M2), from
audit/delivery/STAGES.csv (effort ranges, dependencies, lanes). It does NOT schedule final acceptance (M3) or the
deployment-readiness stages R1–R3 (M4): those wait on external prerequisites and are not dated by it.

THE UNIT: one effort unit (U) = the scope of one CP-6 batch of B21/B22 size — design → migration(s) → API →
harness → web → act → records → hosted run — the unit the characterisation estimated in. The rate r is U per
account WORKING day; it is calibrated in DELIVERY_PLAN.md §5.1 from B18–B22.

WHAT IS SIMULATED (explicit resources, not constants):
  - accounts working their lanes (DELIVERY_PLAN.md §8); first assignments PINNED (A1: B23 then B24; A2: B50;
    A3: B80 — per allocation); an idle account takes the highest-priority ready stage of any lane (priority =
    the remaining precedence-chain length);
  - stacking: a stage may start once its dependencies are IMPLEMENTED;
  - the HEAVY-VERIFICATION SLOTS: 2 machine-wide (scripts/dev/heavy-slot.sh); the last HV days of every stage's
    implementation and the HV days of every integration each hold one slot; without a slot the account waits;
  - the ONE COORDINATOR (account 1): integration INTEG days per stage, serialised, only once the stage's
    dependencies are MERGED (it rebases onto main);
  - the OWNER'S APPROVAL: a merge follows APPROVAL working days after integration (not occupying anyone).
WHAT IS NOT SIMULATED (absorbed in constants — stated, not modelled): review findings and their corrections
(the x1.25 contingency), session and usage limits (inside the calibrated rate), shared-file conflicts and
rebase churn (the efficiency factor 1.0/0.9/0.8/0.7 for 1–4 accounts), holidays, hosted-CI queueing.

Run:  python3 audit/delivery/schedule-model.py            (the comparison, the 3-account sequences, the chain)
      python3 audit/delivery/schedule-model.py --write    (writes the 3-account owners/dates into STAGES.csv and
                                                           the generated blocks of DELIVERY_PLAN.md; then run
                                                           node audit/delivery/feature-tracker.mjs --write)
      python3 audit/delivery/schedule-model.py --check    (fails if STAGES.csv or the plan's blocks differ)
"""
import csv, datetime as dt, collections as C, os, sys, re

HERE = os.path.dirname(os.path.abspath(__file__))
PLAN = os.path.join(HERE, '..', 'DELIVERY_PLAN.md')
START = dt.date(2026, 9, 28)
RATE = {'optimistic': 2.0, 'expected': 1.5, 'conservative': 1.0}   # U per account working day (§5.1)
CONTINGENCY = 1.25
EFFICIENCY = {1: 1.0, 2: 0.9, 3: 0.8, 4: 0.7}
INTEG, HV, SLOTS, APPROVAL, STEP = 0.5, 0.15, 2, 1.0, 0.05
ALLOC = {1: {0: 'BADCEF'}, 2: {0: 'BDF', 1: 'ACE'}, 3: {0: 'BF', 1: 'AC', 2: 'DE'}, 4: {0: 'B', 1: 'AF', 2: 'DC', 3: 'E'}}
PIN = {1: {0: ['B23', 'B24']}, 2: {0: ['B23', 'B24'], 1: ['B50']}, 3: {0: ['B23', 'B24'], 1: ['B50'], 2: ['B80']},
       4: {0: ['B23', 'B24'], 1: ['B50'], 2: ['B70'], 3: ['B80']}}

rows = list(csv.DictReader(open(os.path.join(HERE, 'STAGES.csv'), newline='')))
by = {r['stage']: r for r in rows}
M1 = [r['stage'] for r in rows if r['milestone'] == 'M1']
M2 = [r['stage'] for r in rows if r['milestone'] == 'M2']
lane = {r['stage']: r['lane'] for r in rows}
mid = {r['stage']: (float(r['effort_lo']) + float(r['effort_hi'])) / 2 for r in rows}
deps = {s: [d for d in by[s]['depends_on'].split() if d in M1] for s in M1}
for s in M2: deps[s] = list(M1)
ORDER = {r['stage']: i for i, r in enumerate(rows)}

def chain(rate):
    succ = C.defaultdict(list)
    for s in M1:
        for d in deps[s]: succ[d].append(s)
    memo = {}
    def L(s):
        if s not in memo: memo[s] = mid[s] / rate + max([L(x) for x in succ[s]] + [0])
        return memo[s]
    prio = {s: L(s) for s in M1}
    s = max(M1, key=lambda x: prio[x]); path = [s]
    while succ[s]:
        s = max(succ[s], key=lambda x: prio[x]); path.append(s)
    return prio, path

def workday_add(start, days):
    d = start; n = 0
    while n < int(days + 1e-9):
        d += dt.timedelta(days=1)
        if d.weekday() < 5: n += 1
    return d

def simulate(n, rate, contingency=CONTINGENCY):
    e = EFFICIENCY[n]; prio, _ = chain(rate); lanes = ALLOC[n]
    pins = {i: list(v) for i, v in PIN[n].items()}
    prio.update({s: 0.0 for s in M2})
    remaining = list(M1); impl, integrated, merged, who, start_of = {}, {}, {}, {}, {}
    queue = []; slots = 0; acct = [None] * n; t = 0.0; phase2 = False
    def pick(i):
        r = [s for s in remaining if all(d in impl for d in deps[s])]
        while pins.get(i):
            p = pins[i][0]
            if p not in remaining: pins[i].pop(0); continue
            return p if p in r else None
        mine = [s for s in r if lane[s] in lanes[i]]
        pool = mine or r
        return sorted(pool, key=lambda s: (-prio[s], ORDER[s]))[0] if pool else None
    while True:
        if not phase2 and not remaining and all(s in merged for s in M1):
            phase2 = True; remaining = list(M2)
        if phase2 and not remaining and all(s in merged for s in M2) and all(a is None for a in acct): break
        for s in list(integrated):
            if s not in merged and t >= integrated[s] + APPROVAL - 1e-9 and all(d in merged for d in deps[s]): merged[s] = t
        for i in range(n):
            if acct[i] is not None: continue
            if i == 0:
                q = [s for s in queue if all(d in merged for d in deps[s])]
                if q and slots < SLOTS:
                    s = q[0]; queue.remove(s); slots += 1; acct[i] = ['INTEG', s, INTEG, True]; continue
            s = pick(i)
            if s:
                remaining.remove(s); who[s] = i; start_of[s] = t
                acct[i] = ['IMPL', s, contingency * mid[s] / (rate * e), False]
        t = round(t + STEP, 6)
        for i in range(n):
            a = acct[i]
            if a is None: continue
            k, s, r, holding = a
            if k == 'IMPL' and not holding and r <= HV + 1e-9:
                if slots >= SLOTS: continue          # waits for a heavy-verification slot
                slots += 1; a[3] = True
            a[2] = r - STEP
            if a[2] <= 1e-9:
                if a[3]: slots -= 1
                if k == 'IMPL': impl[s] = t; queue.append(s)
                else: integrated[s] = t
                acct[i] = None
        if t > 3000: raise SystemExit('the simulation did not converge')
    return dict(who=who, start=start_of, impl=impl, merged=merged,
                m1=max(merged[s] for s in M1), m2=max(merged[s] for s in M2))

D = lambda x: str(workday_add(START, x))

def render():
    out = {}
    lines = ['| Accounts | optimistic r=2.0 | **expected r=1.5** | conservative r=1.0 | M2 at expected | Stage finishing M1 (expected) |', '|---|---|---|---|---|---|']
    res = {}
    for n in (1, 2, 3, 4):
        res[n] = {k: simulate(n, r) for k, r in RATE.items()}
        x = res[n]['expected']; last = max(M1, key=lambda s: x['merged'][s])
        lines.append(f"| {n} | {D(res[n]['optimistic']['m1'])} | **{D(x['m1'])}** | {D(res[n]['conservative']['m1'])} | {D(x['m2'])} | {last} (A{x['who'][last] + 1}) |")
    out['comparison'] = '\n'.join(lines)
    plan = res[3]['expected']
    acc = ['| Account | Sequence, 3 accounts at the expected rate (start → merged) |', '|---|---|']
    for a in range(3):
        seq = sorted((s for s in plan['who'] if plan['who'][s] == a and s in M1), key=lambda s: plan['start'][s])
        acc.append(f"| A{a + 1} | " + ' → '.join(f"{s} ({D(plan['start'][s])[2:]}→{D(plan['merged'][s])[2:]})" for s in seq) + ' |')
    out['accounts'] = '\n'.join(acc)
    _, path = chain(RATE['expected'])
    units = sum(mid[s] for s in path)
    out['chain'] = (f"Longest precedence chain by midpoint effort: **{' → '.join(path)}** = {units:.2f} U — a lower bound on M1 "
                    f"whatever the account count (≈ {units * CONTINGENCY / RATE['expected']:.0f} working days at r=1.5 ×1.25 with no waits). "
                    f"The resource-limited 3-account finish (expected) is **{max(M1, key=lambda s: plan['merged'][s])}**, merged {D(plan['m1'])}. "
                    "A slip on the precedence chain moves M1 only while that chain is also the resource-limited path; this model does not establish that it is.")
    st = ['| Stage | Lane | Title | Completes | Verifies | Depends on | Effort (U) | Owner | Start → merged |', '|---|---|---|---|---|---|---|---|---|']
    for r in rows:
        s = r['stage']
        when = f"{D(plan['start'][s])} → {D(plan['merged'][s])}" if s in plan['who'] else 'externally gated'
        own = (f"A{plan['who'][s] + 1}" if s in M1 else 'A1+A2+A3') if s in plan['who'] else 'owner + A1'
        comp = r['completing_features'].replace('F-', '').replace(' ', ', ') or ('— (advances ' + r['advances'].replace('F-', '').replace(' ', ', ') + ')' if r['advances'] else '—')
        st.append(f"| {s} | {r['lane']} | {r['title']} | {comp} | {r['verifying_features'].replace('F-', '').replace(' ', ', ') or '—'} | {r['depends_on'].replace(' ', ', ') or '—'} | {r['effort_lo']}–{r['effort_hi']} | {own} | {when} |")
    out['stages'] = '\n'.join(st)
    return out, plan

def blocks_in(text):
    return {m.group(1): m.group(2).strip() for m in re.finditer(r'<!-- model:(\w+):begin -->\n(.*?)<!-- model:\1:end -->', text, re.S)}

if __name__ == '__main__':
    out, plan = render()
    print(out['comparison']); print(); print(out['accounts']); print(); print(out['chain'])
    want = {}
    for r in rows:
        s = r['stage']
        if s in M1 or s in M2:
            want[s] = (f"A{plan['who'][s] + 1}" if s in M1 else 'A1+A2+A3', D(plan['start'][s]), D(plan['merged'][s]))
        else:
            want[s] = ('owner+A1', 'externally gated', 'externally gated')
    if '--write' in sys.argv:
        for r in rows: r['owner'], r['target_start'], r['target_merged'] = want[r['stage']]
        with open(os.path.join(HERE, 'STAGES.csv'), 'w', newline='') as o:
            w = csv.DictWriter(o, fieldnames=list(rows[0].keys()), lineterminator='\n'); w.writeheader(); w.writerows(rows)
        text = open(PLAN).read()
        for k, v in out.items():
            text = re.sub(rf'(<!-- model:{k}:begin -->\n)(.*?)(<!-- model:{k}:end -->)', lambda m: m.group(1) + v + '\n' + m.group(3), text, flags=re.S)
        open(PLAN, 'w').write(text)
    if '--check' in sys.argv:
        bad = [(r['stage'], (r['owner'], r['target_start'], r['target_merged']), want[r['stage']]) for r in rows if (r['owner'], r['target_start'], r['target_merged']) != want[r['stage']]]
        have = blocks_in(open(PLAN).read())
        bad += [('DELIVERY_PLAN.md block', k, 'differs') for k, v in out.items() if have.get(k) != v.strip()]
        for b in bad: print('differs:', *b)
        sys.exit(1 if bad else 0)
