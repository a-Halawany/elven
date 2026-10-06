import { describe, expect, it } from 'vitest';
import { headline, languageLabel, planLines, validationClaim, type Plan, type RoutedForecast } from './registry-b25';

describe('B25 §MR registry client — the claims and the words', () => {
  it('keeps software capability, synthetic demonstration and empirical validation apart', () => {
    expect(validationClaim('validated_retrospective', '40 origins … The validation history is SYNTHETIC: a SYNTHETIC DEMONSTRATION').claim).toBe('synthetic demonstration');
    expect(validationClaim('validated', '40 origins on the ECB series').claim).toBe('empirical validation');
    expect(validationClaim('scenario_language', '').claim).toBe('scenario language');
    expect(validationClaim('unvalidated', '').claim).toBe('no validation claimed');
    expect(validationClaim('validation_impossible', '').text).toMatch(/no accuracy is claimed/);
  });
  it('names the languages and the plan, the unavailable methods with their reasons', () => {
    expect(languageLabel('scenario_language')).toMatch(/never presented as validated/);
    const plan: Plan = { target_key: 't', series_key: 's', forecast_kind: 'quantity', horizon: '3y', confidence_language: 'distribution', treatment: null, validation_required: true,
      policy: { policy_id: 'p', version: 1, risk_class: 'standard' }, refusal: null, refusal_class: null,
      methods: [{ method_ref: 'bayes@1', family: 'bayesian', available: false, unavailable_reason: 'no passed validation', confidence_language: 'distribution', validation: {} }] };
    expect(planLines(plan)).toEqual(['bayes@1 (bayesian) — UNAVAILABLE: no passed validation']);
    expect(planLines({ ...plan, refusal: 'forecast rejected (horizon): s at 3y is unsupported — x' })).toEqual(['forecast rejected (horizon): s at 3y is unsupported — x']);
  });
  it('the headline is what the server sent: a probability, a band or the categories', () => {
    const f: RoutedForecast = { forecastId: 'f', method_ref: 'm@1', family: 'event', forecast_kind: 'event', validation_state: 'unvalidated', validation_note: '', statement: 's', target_at: '2024-01-01',
      quantiles: { q10: 0.1, q50: 0.15, q90: 0.2 }, distribution: { probability: 0.15 } };
    expect(headline(f)).toBe('P = 0.150 (80% band 0.100–0.200)');
    expect(headline({ ...f, forecast_kind: 'regime', quantiles: {}, distribution: { categories: [{ label: 'open', probability: 0.7 }, { label: 'closed', probability: 0.3 }] } })).toBe('open 0.70 · closed 0.30');
  });
});
