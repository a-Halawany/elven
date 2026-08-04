'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../../lib/api';
import { ErrorNote, buttonStyle, inputStyle } from '../../components/ui';
import { t, defaultLocale } from '../../lib/i18n';

export default function LoginPage() {
  const router = useRouter();
  const locale = defaultLocale;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await login(username, password);
    setBusy(false);
    if (r.ok) router.replace('/admin');
    else setError(r.error ?? { code: 'EYE-INT-001', message: 'login failed', correlationId: '-' });
  }

  return (
    <main style={{ maxInlineSize: '360px', marginInline: 'auto', paddingBlockStart: 'var(--eye-space-64)' }}>
      <h1 style={{ color: 'var(--eye-color-ink-strong)', fontSize: 'var(--eye-type-heading-1)' }}>{t('app.title', locale)}</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>{t('app.tagline', locale)}</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--eye-space-12)' }}>
        <label style={{ display: 'grid', gap: 'var(--eye-space-4)' }}>
          {t('login.username', locale)}
          <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} />
        </label>
        <label style={{ display: 'grid', gap: 'var(--eye-space-4)' }}>
          {t('login.password', locale)}
          <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required minLength={12} />
        </label>
        <button style={buttonStyle} type="submit" disabled={busy}>
          {busy ? t('common.loading', locale) : t('login.submit', locale)}
        </button>
      </form>
      <ErrorNote error={error} />
    </main>
  );
}
