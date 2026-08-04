'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { call, login, setSession, getSession } from '../../lib/api';
import { ErrorNote, buttonStyle, inputStyle } from '../../components/ui';
import { t, defaultLocale } from '../../lib/i18n';

type Err = { code: string; message: string; correlationId: string } | null;

export default function LoginPage() {
  const router = useRouter();
  const locale = defaultLocale;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [rotating, setRotating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<Err>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await login(username, password);
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? { code: 'EYE-INT-001', message: 'login failed', correlationId: '-' });
      return;
    }
    if (r.data !== undefined && (r.data as { rotationRequired?: boolean }).rotationRequired === true) {
      // One-time bootstrap secret: rotation is FORCED before any governed action.
      setRotating(true);
      setNotice(t('login.rotation.required', locale));
      return;
    }
    router.replace('/admin');
  }

  async function rotate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const session = getSession();
    const r = await call<{ rotated: boolean }>('/v1/auth/rotate', {
      scope: 'PLATFORM',
      action: 'identity.credential.rotate',
      object_type: 'PRN',
      purpose_id: 'authentication',
      principal_id: session !== null ? `principal:${session.principalId}` : 'anonymous',
    }, { currentPassword: password, newPassword });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? { code: 'EYE-IDN-002', message: 'rotation failed', correlationId: '-' });
      return;
    }
    // All sessions are revoked on rotation — sign in again with the new secret.
    setSession(null);
    setRotating(false);
    setPassword('');
    setNewPassword('');
    setNotice(t('login.rotation.done', locale));
  }

  return (
    <main style={{ maxInlineSize: '360px', marginInline: 'auto', paddingBlockStart: 'var(--eye-space-64)' }}>
      <h1 style={{ color: 'var(--eye-color-ink-strong)', fontSize: 'var(--eye-type-heading-1)' }}>{t('app.title', locale)}</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>{t('app.tagline', locale)}</p>
      {notice !== '' && (
        <p role="status" style={{ color: 'var(--eye-color-warning)', fontWeight: 600 }}>{notice}</p>
      )}
      {!rotating ? (
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
      ) : (
        <form onSubmit={rotate} style={{ display: 'grid', gap: 'var(--eye-space-12)' }}>
          <label style={{ display: 'grid', gap: 'var(--eye-space-4)' }}>
            {t('login.rotation.new', locale)}
            <input style={inputStyle} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required minLength={12} />
          </label>
          <button style={buttonStyle} type="submit" disabled={busy || newPassword.length < 12}>
            {busy ? t('common.loading', locale) : t('login.rotation.submit', locale)}
          </button>
        </form>
      )}
      <ErrorNote error={error} />
    </main>
  );
}
