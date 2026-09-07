# THE EYE — Scheduled collection (automatic acquisition), 2026-09-07

> The increment after PR #43: the four approved live sources — `ecb-eurusd`, `eu-sanctions-rss`,
> `eu-sanctions-payload`, `worldbank-indicators` — collected **automatically**, by a scheduler that
> hands jobs to a worker that runs the existing agent-authorized acquisition path. Stacked on #43
> (`6086de4`). Phase 4 and Phase 5 functional reviews stay closed; this is not a reopened review.
> C15 and the required downstream checks remain the merge gates.

## 1. Scope — frozen before coding

Five objectives, and nothing else:

1. **Workers and reconciliation.** Start the collection workers with the process and stop them with
   it. At startup, restore every *eligible* persisted schedule entry (status `scheduled`; contract
   active, `live`, rights confirmed; an active agent for the connector) into the scheduler, so a
   schedule recorded while scheduling was disabled — or lost with a Redis restart — is served after
   a restart. Jobs run through `CollectionOrchestrator.handleScheduledJob`, which mints the agent
   session from the registry and re-verifies agent, contract version and lifecycle at execution.
2. **Queue identity under the pinned BullMQ 6.0.6.** The stored queue name
   `obs:<tenant>:<domain>:collection` is refused by `QueueBase` ("Queue name cannot contain :").
   Reproduce against the pinned dependency and real Redis; then keep the **stored logical identity**
   (the `sched_scoped_names` constraint of migration 0022 is untouched) and derive the Redis-facing
   identity from it by a fixed, injective mapping that keeps the tenant and domain in the name.
3. **Unchanged payloads.** A poll whose bytes equal the bytes already held for the same polled thing
   is recorded as an audited, freshness-bearing no-op — the run event names the evidence it
   confirmed and its digest — and stores no second copy. Changed bytes are admitted as before, with
   the prior digest named. Transfer and storage are measured separately on every run.
4. **Readiness tells three things apart**: a configured schedule (a `scheduler_entries` row), the
   runtime (scheduler enabled, worker running, the Redis scheduler present and its next fire time),
   and observed automatic outcomes (a `scheduled_attempts` record per job: finished, failed,
   cancelled, refused). A flag or a manual collect is not evidence of scheduled execution.
5. **Demonstration** with real Redis: scheduler → worker → governed acquisition; restart recovery;
   an unchanged response; a changed response; a failed run and a refused run. Publisher cadences and
   budgets unchanged. Controlled tests (synthetic publisher, ticks promoted on demand) are reported
   apart from live scheduled results on the demonstration deployment.

Out of scope, unchanged: PortWatch (replay, permission pending), UN Comtrade (deferred, key
untouched), purchases (zero), the automatic CorrectionApplied consumer (deferred), any credential
binding, any change to contract cadences or budgets.

## 2. Design

* **Machine context, not system authority.** Migration 0011 removed `ctx.issue_system`; machine
  paths carry one bounded capability each (`issue_publish`, `issue_verify`, …). Migrations 0038/0039
  add `observation.issue_schedule_capability(reason)` — mode `schedule`, operation class `scheduler`,
  action `observation.schedule.reconcile` — granted to `eye_commit`, and two ports that assert
  exactly that capability (0039 moves the minter from `ctx` into the observation schema: Gate-2.2
  C14 discovers every port of the Phase 0 schemas and the upgrade check re-runs that suite at 0021,
  where a later port cannot have a coverage entry; the scheduler is an observation component and
  its minter belongs with its ports): `observation.schedules_to_reconcile()` (the eligible entries with their agent, no
  evidence, no contract body beyond connector kind and budgets) and
  `observation.record_scheduled_attempt(…)`. Neither port serves any other context.
* **A schedule is an intention; an attempt is a fact.** `observation.scheduled_attempts` (RLS like
  every observation table) records each job the worker received: source, contract version,
  scheduler id, job id, started/finished, outcome, run id when a run was opened, reason when not.
  A run opened by a job carries `trigger: scheduler` in its `run.started` event; an operator's run
  carries `trigger: operator` and the principal.
* **Redis identity.** `redisQueueName(logical) = logical.replaceAll(':', '.')`; likewise for the
  scheduler id. Injective (neither tenant ids nor domain ids contain `.` or `:`), scope-preserving,
  and never persisted: the database keeps the logical names.
* **Unchanged bytes.** Every acquired item now carries a `pollKey` — the stable identity of what
  was polled (a REST endpoint's redacted URL; a feed; a feed entry's guid + pubDate). Before
  admission the lifecycle loads the latest evidence per poll key; equal digest → `item.noop` with
  `unchanged: true`, the confirmed evidence id and digest; the quarantine copy is tombstoned. The
  coverage facts count such confirmations as observations (`lastObservedAt`), so freshness reflects
  the last time the source was seen current, not only the last time bytes changed.
* **Worker.** `CollectionWorkerService` starts on application bootstrap when
  `EYE_SCHEDULER_ENABLED` is true: it registers the job handler with `SchedulerService`, reconciles
  persisted schedules, and starts one worker per (tenant, domain) queue. A refusal before a run
  exists (agent revoked, contract inactive, connector mismatch) is recorded as `refused` and not
  retried; an unexpected exception is recorded as `failed` and rethrown so BullMQ's bounded retry
  applies.

## 3. Results

### 3.1 The queue-name incompatibility — reproduced, then fixed

Against the pinned `bullmq@6.0.6` and the real Redis container (`apps/api/test/unit/scheduler-names.test.ts`,
and a one-off probe before the fix): `new Queue('obs:<tenant>:<domain>:collection')` throws
**"Queue name cannot contain :"** in `QueueBase`'s constructor, before any backend is created.
Scheduler ids with ':' are accepted by `upsertJobScheduler`, but are mapped the same way for
consistency. The fix is `redisName()` in `scheduler.service.ts` — the stored names are unchanged
and still satisfy migration 0022's `sched_scoped_names` constraint; the Redis-facing names
`obs.<tenant>.<domain>.collection` / `obs.<tenant>.<domain>.src.<source>` keep the scope and are
recoverable. No migration was needed for this item.

### 3.2 Controlled demonstration — `apps/api/test/int/phase6-scheduled-collection.test.ts`, 7/7

Real database, real Redis, the shipping activation route, worker, orchestrator and lifecycle; a
**synthetic publisher** installed on the orchestrator in the test runtime (no network); the
contract's cadence at the 60-second floor; ticks **promoted on demand** so the test does not wait
for boundaries; one job at a time per queue (`EYE_CONNECTOR_PER_SOURCE_CONCURRENCY=1`) so a
promoted tick never overlaps the natural one. Labelled controlled; the live results are in §3.3.

| Step | What was shown | Evidence in the run |
|---|---|---|
| activation | the route records the `scheduler_entries` row with the ':' names, materializes the Redis job scheduler under the '.' names, and starts a worker for the domain | `describe()` → `redis_scheduler.present`, `worker_running`; readiness reason "a worker serves it here" |
| automatic run | a promoted tick → worker → `handleScheduledJob` → agent session → lifecycle | attempt `finished` with a run id; `run.started.details.trigger = {kind: scheduler, jobId}`; `bytes_transferred > 0`, `bytes_stored > 0` |
| unchanged response | same bytes as held for the poll key | attempt `finished`, `admitted 0`, `noop > 0`; `item.noop {unchanged: true, evd_object_id, digest}`; evidence count unchanged; `bytes_transferred > 0`, **`bytes_stored 0`**; coverage facts `lastObservedAt` > `lastAdmittedAt` |
| changed response | new bytes for the same poll key | attempt `finished`, `admitted 1`, evidence +1; `item.admitted.details.changed_from {evd_object_id, evd_version, digest}` |
| restart recovery | the Redis scheduler removed, the process closed and re-created | `CollectionWorkerService.lastReconciliation()` lists the source; `redis_scheduler.present` again; `worker_running`; the next tick runs |
| failed run | the publisher answers 500 | attempt `failed` with a run id; `run.failed` with the transport refusal; readiness `last_attempt: failed`, `last_success: finished` |
| refused run | the agent revoked | attempt `refused`, `run_id null`, run count unchanged; the BullMQ job `completed` with `attemptsMade 1` — **not retried** |

### 3.3 Live scheduled results — demonstration deployment, scheduler enabled 2026-09-07 21:34 UTC

`EYE_SCHEDULER_ENABLED=true`, `EYE_CONNECTOR_PER_SOURCE_CONCURRENCY=1`; the API restarted; the
log reads "reconciled 4/4 persisted schedule(s); workers: 1". BullMQ fires an `every` scheduler
once immediately on upsert and then at the cadence from that instant, so all four sources ran
automatically at start (`scripts/integrations/scheduled-status.mjs`, 21:41 UTC):

| Source | Cadence | Automatic run at 21:34 UTC | Transfer / storage | Next fire |
|---|---|---|---|---|
| `eu-sanctions-rss` v2 | 3,600 s | **finished** — 1 admitted (the feed's `lastBuildDate` moves, so the parent's bytes differ), 5 entries confirmed unchanged | feed bytes transferred; only the parent stored | 22:34 UTC |
| `eu-sanctions-payload` v2 | 21,600 s | **finished** — 0 admitted, **1 confirmed unchanged**: the 25,166,172-byte CSV was transferred, compared to the held digest `049cb95c…`, and not stored again | 25 MB transferred, 0 stored | 03:34 UTC |
| `worldbank-indicators` v2 | 604,800 s | **finished** — 0 admitted: conditional requests, not modified | 0 transferred, 0 stored | 2026-09-14 |
| `ecb-eurusd` v2 | 86,400 s | **failed** — `egress refused (timeout)` at the publisher | — | 2026-09-08 21:34 UTC |

The ECB failure is a live one, recorded as such (`last_attempt: FAILED`, `last_success: none`).
The publisher answered `curl` in under a second minutes later, and an **operator** collection
(`scripts/integrations/collect-once.mjs ecb-eurusd`, `trigger: operator`) finished with 1 admitted
(7,286 bytes transferred and stored: the "last 30 observations" window had moved). That operator run
does not count as automatic; the register still shows the automatic outcome for ECB as failed until
the next scheduled fire.

Readiness now shows, per live row, the configured entry ("configured · every N s"), the runtime
("worker running here · next fire …") and the observed attempts ("FINISHED … · n ok / n failed / n
refused") in the Automatic column, beside the last governed run of any trigger.
