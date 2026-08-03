import { defaultLocale, t } from '../lib/i18n';

export default function Home() {
  const locale = defaultLocale;
  return (
    <main>
      <h1 style={{ color: 'var(--eye-color-ink-strong)', fontSize: 'var(--eye-type-heading-1)' }}>
        {t('app.workspace', locale)}
      </h1>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>{t('shell.status.scaffold', locale)}</p>
    </main>
  );
}
