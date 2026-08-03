/**
 * i18n foundations (ADR-P0-14, GLB-11..14): message catalog with no hardcoded
 * strings in components; locale negotiation slot; bidirectional support.
 * English content first; Arabic translation before external release.
 */
export const locales = ['en', 'ar'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

const RTL_LOCALES: ReadonlySet<string> = new Set(['ar', 'he', 'fa', 'ur']);

export function dirFor(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

import en from '../messages/en.json';

const catalogs: Record<Locale, Record<string, string>> = {
  en,
  // Arabic catalog ships before external release (GLB-14); falls back to en.
  ar: en,
};

export function t(key: string, locale: Locale = defaultLocale): string {
  return catalogs[locale][key] ?? catalogs[defaultLocale][key] ?? key;
}
