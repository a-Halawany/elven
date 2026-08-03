/**
 * WS-19 admin shell root layout.
 * i18n/RTL foundations (ADR-P0-14): lang + dir are driven by the active locale
 * from the message catalog; all styling uses logical CSS properties and
 * semantic token variables only.
 */
import type { ReactNode } from 'react';
import { defaultLocale, dirFor } from '../lib/i18n';
import './globals.css';

export const metadata = {
  title: 'The Eye — Platform Administration',
  description: 'WS-19 Platform and Customer Administration',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const locale = defaultLocale;
  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body>{children}</body>
    </html>
  );
}
