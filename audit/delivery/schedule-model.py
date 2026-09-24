#!/usr/bin/env python3
"""The delivery plan's schedule model (audit/DELIVERY_PLAN.md §5; baseline 2026-09-24).

Reads audit/delivery/STAGES.csv: the implementation stages of lanes A–F, their effort ranges and their
dependencies. It simulates n accounts working the lanes under one serialized integration coordinator
(account 1).

Assumptions (DELIVERY_PLAN.md §5.1):
  - A stage takes contingency x mid-effort / (rate x efficiency) account-days.
  - Efficiency is 1.0 / 0.9 / 0.8 / 0.7 for 1–4 accounts.
  - A stage may start once its dependencies are implemented (stacked); it merges after 0.5 coordinator-day
    of integration, taken before the coordinator's own next stage.
  - An idle account takes the highest-priority ready stage of any lane (priority = remaining critical-path
    length).
  - Working days start 2026-09-28, five a week, no holiday calendar.

Run:  python3 audit/delivery/schedule-model.py            (the comparison table and the critical path)
      python3 audit/delivery/schedule-model.py --check    (fails if STAGES.csv's 3-account target dates
                                                           differ from the model's)
      python3 audit/delivery/schedule-model.py --write    (writes the 3-account owners and dates into
                                                           STAGES.csv and FEATURE_TRACKER.csv)
"""
import csv, datetime as dt, collections as C, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
START = dt.date(2026, 9, 28)
ALLOC = {1: {0: 'BADCEF'}, 2: {0: 'BDF', 1: 'ACE'}, 3: {0: 'BF', 1: 'AC', 2: 'DE'}, 4: {0: 'B', 1: 'AF', 2: 'DC', 3: 'E'}}
EFFICIENCY = {1: 1.0, 2: 0.9, 3: 0.8, 4: 0.7}

rows = list(csv.DictReader(open(os.path.join(HERE, 'STAGES.csv'), newline='')))
IMPL = [r['stage'] for r in rows if r['lane'] in 'ABCDEF']
lane = {r['stage']: r['lane'] for r in rows}
mid = {r['stage']: (float(r['effort_lo']) + float(r['effort_hi'])) / 2 for r in rows}
deps = {r['stage']: [d for d in r['depends_on'].split() if d in IMPL] for r in rows if r['stage'] in IMPL}

def cp_len(rate):
    succ = C.defaultdict(list)
    for s, ds in deps.items():
        for d in ds: succ[d].append(s)
    memo = {}
    def L(s):
        if s not in memo: memo[s] = mid[s] / rate + max([L(x) for x in succ[s]] + [0])
        return memo[s]
    return {s: L(s) for s in IMPL}, succ

def workday_add(start, days):
    d = start; n = 0
    while n < int(days):
        d += dt.timedelta(days=1)
        if d.weekday() < 5: n += 1
    return d

def simulate(n, rate, contingency, integ=0.5, step=0.05):
    e = EFFICIENCY[n]; prio, _ = cp_len(rate); lanes = ALLOC[n]
    remaining = list(IMPL); impl = {}; merged = {}; queue = []; who = {}; start_of = {}
    acct = [None] * n; t = 0.0
    def pick(i):
        ready = [s for s in remaining if all(d in impl for d in deps[s])]
        mine = [s for s in ready if lane[s] in lanes[i]]
        pool = mine or ready
        return sorted(pool, key=lambda s: (-prio[s], IMPL.index(s)))[0] if pool else None
    while remaining or any(a is not None for a in acct) or queue:
        for i in range(n):
            if acct[i] is not None: continue
            if i == 0 and queue: acct[i] = ('INTEG', queue.pop(0), integ); continue
            s = pick(i)
            if s:
                remaining.remove(s); who[s] = i; start_of[s] = t
                acct[i] = ('IMPL', s, contingency * mid[s] / (rate * e))
        t += step
        for i in range(n):
            if acct[i] is None: continue
            k, s, r = acct[i]; r -= step
            if r <= 1e-9:
                if k == 'IMPL': impl[s] = t; queue.append(s)
                else: merged[s] = t
                acct[i] = None
            else: acct[i] = (k, s, r)
    return t, who, start_of, merged

def critical_path(rate=3.0):
    prio, succ = cp_len(rate)
    s = max(IMPL, key=lambda x: prio[x])
    path = [s]
    while succ[s]:
        s = max(succ[s], key=lambda x: prio[x]); path.append(s)
    return path, sum(mid[x] for x in path)

if __name__ == '__main__':
    print('M1 (every implementation stage merged) by accounts; columns rate x contingency')
    print('accounts | r4 x1.0 | r4 x1.25 | r3 x1.0 | r3 x1.25 (plan) | r2 x1.0 | r2 x1.25')
    for n in (1, 2, 3, 4):
        cells = [str(workday_add(START, simulate(n, r, c)[0])) for r in (4.0, 3.0, 2.0) for c in (1.0, 1.25)]
        print(f'{n} | ' + ' | '.join(cells))
    path, units = critical_path()
    print('critical path (mid units):', ' -> '.join(path), f'= {units:.1f}')
    T, who, st, merged = simulate(3, 3.0, 1.25)
    print('3-account plan end:', workday_add(START, T))
    for a in range(3):
        seq = sorted((x for x in who if who[x] == a), key=lambda x: st[x])
        print(f'A{a + 1}:', ' -> '.join(f'{x}({workday_add(START, st[x])}..{workday_add(START, merged[x])})' for x in seq))
    if '--write' in sys.argv:
        for r in rows:
            if r['stage'] in IMPL:
                r['owner'] = f"A{who[r['stage']] + 1}"
                r['target_start'] = str(workday_add(START, st[r['stage']]))
                r['target_merged'] = str(workday_add(START, merged[r['stage']]))
        with open(os.path.join(HERE, 'STAGES.csv'), 'w', newline='') as o:
            w = csv.DictWriter(o, fieldnames=list(rows[0].keys()), lineterminator='\n'); w.writeheader(); w.writerows(rows)
        by_stage = {r['stage']: r for r in rows}
        tp = os.path.join(HERE, 'FEATURE_TRACKER.csv')
        trows = list(csv.DictReader(open(tp, newline='')))
        for t in trows:
            s_ = by_stage.get(t['stage'])
            if s_ and s_['stage'] in IMPL: t['owner'] = s_['owner']; t['target_date'] = s_['target_merged']
        with open(tp, 'w', newline='') as o:
            w = csv.DictWriter(o, fieldnames=list(trows[0].keys()), lineterminator='\n'); w.writeheader(); w.writerows(trows)
    if '--check' in sys.argv:
        bad = [(r['stage'], r['target_merged'], str(workday_add(START, merged[r['stage']])), f"A{who[r['stage']] + 1}", r['owner'])
               for r in rows if r['stage'] in IMPL and (r['target_merged'] != str(workday_add(START, merged[r['stage']])) or r['owner'] != f"A{who[r['stage']] + 1}")]
        for b in bad: print('differs:', *b)
        sys.exit(1 if bad else 0)
