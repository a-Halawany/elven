/**
 * CP-6 B33 integration — the seams the four parts meet at, as the integrator reconciled them (pure; no database).
 * The PACKAGE_GATE's TS refusal (`PackageUnavailable`) carries the SQL seam's SQLSTATE and is answered CENTRALLY as a governed 422 for every
 * noun — the parts' class rows first, the §0 row for any other noun — so a write that reaches the gate without catching it never answers 500.
 */
import { describe, expect, it } from 'vitest';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PackageUnavailable, type PackageFunctionState } from '../../src/domains/seams.js';

const answer = (state: PackageFunctionState['state'], reason: string): PackageFunctionState => ({
  state, package_key: 'competitor', function: 'alert', package_id: null, package_version: null, semver: null, reason,
});

describe('B33 seam · PackageUnavailable is a governed 422 centrally', () => {
  it('carries SQLSTATE 22023 and the class-form text', () => {
    const e = new PackageUnavailable('competitor profile', answer('disabled', 'function alert of package competitor v1 is disabled: a source was retired'));
    expect(e.code).toBe('22023');
    expect(e.message).toBe('competitor profile rejected (package): function alert of package competitor v1 is disabled: a source was retired');
  });
  it('every part noun — and a noun no part row names — answers 422 with the port\'s sentence kept', () => {
    for (const noun of ['domain package', 'package conformance', 'domain assessment', 'watchlist', 'domain event',
      'competitor profile', 'competitor comparison', 'competitor assessment', 'competitor watchlist', 'supply inference', 'some future noun']) {
      const e = new PackageUnavailable(noun, answer('not_installed', `package competitor is not installed in this domain`));
      const a = asObservationRefusal(e, 'corr');
      expect(a, noun).not.toBeNull();
      expect(a!.getStatus(), noun).toBe(422);
      expect((a!.getResponse() as { message: string }).message, noun).toBe(e.message);
    }
  });
  it('the central row does not swallow another class or an unclassed text', () => {
    const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
    expect(asObservationRefusal(pg('22023', 'competitor profile rejected (state): the profile is retired'), 'c')!.getStatus()).toBe(409);
    expect(asObservationRefusal(pg('2F002', 'domain package rejected (state): a package version moves forward only'), 'c')!.getStatus()).toBe(409);
    expect(asObservationRefusal(new Error('package rejected (package): no SQLSTATE'), 'c')).toBeNull();
  });
});
