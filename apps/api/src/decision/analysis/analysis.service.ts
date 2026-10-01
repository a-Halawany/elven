/**
 * DECISION OPTION ANALYSIS — the service of CP-6 B35 part `analysis` (migration 0101 §A; F-P6-01).
 *
 * The service owns the INTAKE: it checks the shape of each request (analysis-core's validators) and answers a malformed one 422 in the
 * family `analysis rejected (<class>): …` before anything is read or written; it names every write's ids. It computes NOTHING the record
 * holds: the scores, the ranking, the sensitivity, the trade-offs, the obligation results, the candidates, the assembly and the adversarial
 * rank change are the PORTS' (decision.dsa_scores and the ports of §A.4) — so the record and the read never disagree.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import {
  validateAdversarial, validateAssess, validateCriteria, validateJudgments, validateObligation, versionOf,
  type AdversarialIntake, type AssessIntake, type CriteriaIntake, type JudgmentIntake, type ObligationIntake,
} from './analysis-core.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refuse = (correlationId: string, message: string, status = 422): never => {
  throw new HttpException(errorBody(status === 404 ? 'EYE_STA_001' : status === 409 ? 'EYE_STA_002' : 'EYE_REQ_001', correlationId, message), status);
};
function checked<T>(r: { ok: T } | { problem: string }, correlationId: string): T {
  if ('problem' in r) refuse(correlationId, r.problem);
  return (r as { ok: T }).ok;
}

@Injectable()
export class AnalysisService {
  /** The package named on the route (a uuid; otherwise unknown — 404). */
  packageId(v: string, correlationId: string): string {
    if (!UUID.test(v)) refuse(correlationId, `analysis rejected (unknown_package): ${v} is not a decision package of this domain`, 404);
    return v;
  }
  /** The version named on the route (a whole number ≥ 1). */
  version(v: string, correlationId: string): number {
    const n = versionOf(v);
    if (n === null) refuse(correlationId, `analysis rejected (unknown_version): ${v} is not a package version`, 404);
    return n as number;
  }
  /** The version a read names in its payload: absent → the current version. */
  readVersion(p: Row, correlationId: string): number | null {
    const v = p['version'];
    if (v === undefined || v === null) return null;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) refuse(correlationId, 'analysis rejected (unknown_version): version is a whole number ≥ 1');
    return v as number;
  }
  criteria(p: Row, correlationId: string): CriteriaIntake { return checked(validateCriteria(p), correlationId); }
  assessment(p: Row, correlationId: string): AssessIntake & { assessmentId: string } { return { ...checked(validateAssess(p), correlationId), assessmentId: newId() }; }
  obligation(p: Row, correlationId: string): ObligationIntake & { obligationId: string } { return { ...checked(validateObligation(p), correlationId), obligationId: newId() }; }
  judgments(p: Row, correlationId: string): JudgmentIntake[] { return checked(validateJudgments(p), correlationId); }
  adversarial(p: Row, correlationId: string): AdversarialIntake & { assessmentId: string } { return { ...checked(validateAdversarial(p), correlationId), assessmentId: newId() }; }
}
