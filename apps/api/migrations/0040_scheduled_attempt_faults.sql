-- 0040 · An execution FAULT is not a governance refusal.
--
-- A job the worker could not carry through — an exception that escaped the governed
-- path — used to be recorded as `refused` with no run, which is the record of a
-- governance answer (agent revoked, contract inactive), and hid the run that had in
-- fact been opened. `faulted` names it: a fault, with the opened run's id when
-- run.started had been committed, and without one when the fault struck earlier. The
-- refusal invariant stands — a refusal never has a run; an ended run always has one.
-- 0038 and 0039 are untouched; this is a forward change of the two constraints.
ALTER TABLE observation.scheduled_attempts DROP CONSTRAINT scheduled_attempts_outcome_check;
ALTER TABLE observation.scheduled_attempts
  ADD CONSTRAINT scheduled_attempts_outcome_check
  CHECK (outcome IN ('finished', 'failed', 'cancelled', 'budget_exceeded', 'refused', 'faulted'));
ALTER TABLE observation.scheduled_attempts DROP CONSTRAINT sa_run_iff_opened;
ALTER TABLE observation.scheduled_attempts
  ADD CONSTRAINT sa_run_iff_opened
  CHECK ((outcome = 'refused' AND run_id IS NULL)
      OR (outcome IN ('finished', 'failed', 'cancelled', 'budget_exceeded') AND run_id IS NOT NULL)
      OR outcome = 'faulted');
