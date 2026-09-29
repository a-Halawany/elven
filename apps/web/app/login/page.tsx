'use client';
import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { call, login, setSession, getSession } from '../../lib/api';
import { ErrorNote, buttonStyle, inputStyle } from '../../components/ui';
import { t, defaultLocale } from '../../lib/i18n';
/* B36 (0094 §C3): the invitation pickup — `?invitation=<id>` opens the pickup form; the code from the SYNTHETIC mailbox answers the
   acceptance material ONCE (in this tab's memory only), the acceptance of 0091 §F1 sets the password, and the external lands on its surface */
import { collab, pickupCodeShape, type PickedUpInvitation } from '../../lib/workflow';
/* end B36 */

type Err = { code: string; message: string; correlationId: string } | null;

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const locale = defaultLocale;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [rotating, setRotating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<Err>(null);
  /* B36 (0094 §C3) */
  const invitationId = params.get('invitation') ?? '';
  const [code, setCode] = useState('');
  const [picked, setPicked] = useState<PickedUpInvitation | null>(null);
  const [invPassword, setInvPassword] = useState('');
  /* end B36 */

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
    /* B36 (0094 §C1): an external collaborator's shell is the collaboration surface (its one page); a member lands as before */
    const bindings = r.data?.bindings ?? [];
    if (bindings.length > 0 && bindings.every((b) => b.roleCode === 'external_collaborator')) { router.replace('/decisions/workspaces'); return; }
    /* end B36 */
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

  /* B36 (0094 §C3): THE PICKUP — the code from the mailbox; the material answered once, held in memory only */
  async function pickup(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await collab.pickup(invitationId, code);
    setBusy(false);
    if (!r.ok || r.data === undefined) { setError(r.error ?? { code: 'EYE-INT-001', message: 'the pickup was refused', correlationId: '-' }); return; }
    setPicked(r.data.invitation);
    setNotice(`Invitation picked up for ${r.data.invitation.workspace_title} — set your password to accept it (it expires with the grant).`);
  }
  /** THE ACCEPTANCE (0091 §F1): signed in with the material, the invitation credential is rotated to the password; then the sign-in with it. */
  async function acceptInvitation(e: FormEvent) {
    e.preventDefault();
    if (picked === null) return;
    setBusy(true); setError(null);
    const first = await login(picked.login, picked.token);
    if (!first.ok) { setBusy(false); setError(first.error ?? { code: 'EYE-IDN-002', message: 'the sign-in with the invitation material was refused', correlationId: '-' }); return; }
    const scope = { tenantId: picked.tenant_id, domainId: picked.domain_id };
    const acc = await collab.accept(scope, picked.grant_id, picked.purpose, picked.token, invPassword);
    if (!acc.ok) { setBusy(false); setSession(null); setError(acc.error ?? { code: 'EYE-INT-001', message: 'the acceptance was refused', correlationId: '-' }); return; }
    // every session was revoked by the rotation: sign in with the password and land on the one surface the grant bounds
    setSession(null);
    const second = await login(picked.login, invPassword);
    setBusy(false);
    if (!second.ok) { setError(second.error ?? { code: 'EYE-IDN-002', message: 'the sign-in with the new password was refused', correlationId: '-' }); return; }
    setPicked(null); setInvPassword(''); setCode('');
    router.replace(`/decisions/workspaces?workspace=${picked.workspace_id}`);
  }
  /* end B36 */

  return (
    <main style={{ maxInlineSize: '360px', marginInline: 'auto', paddingBlockStart: 'var(--eye-space-64)' }}>
      <h1 style={{ color: 'var(--eye-color-ink-strong)', fontSize: 'var(--eye-type-heading-1)' }}>{t('app.title', locale)}</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>{t('app.tagline', locale)}</p>
      {notice !== '' && (
        <p role="status" style={{ color: 'var(--eye-color-warning)', fontWeight: 600 }}>{notice}</p>
      )}
      {/* B36 (0094 §C3): the invitation pickup, then the acceptance */}
      {invitationId !== '' && picked === null ? (
        <form onSubmit={pickup} aria-label="Invitation pickup" style={{ display: 'grid', gap: 'var(--eye-space-12)' }}>
          <p>You were invited to collaborate. Enter the one-time pickup code from your invitation message (SYNTHETIC mailbox — invitation <span style={{ fontFamily: 'var(--eye-font-mono)' }}>{invitationId.slice(0, 8)}…</span>).</p>
          <label style={{ display: 'grid', gap: 'var(--eye-space-4)' }}>
            Pickup code
            <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" required minLength={12} placeholder="XXXX-XXXX-XXXX" />
          </label>
          {code !== '' && pickupCodeShape(code) === null && <p style={{ color: 'var(--eye-color-ink-muted)' }}>A code is 12 symbols in three groups.</p>}
          <button style={buttonStyle} type="submit" disabled={busy || pickupCodeShape(code) === null}>{busy ? t('common.loading', locale) : 'Pick up the invitation'}</button>
          <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>The material is answered once; five wrong codes lock the invitation.</p>
        </form>
      ) : invitationId !== '' && picked !== null ? (
        <form onSubmit={acceptInvitation} aria-label="Accept the invitation" style={{ display: 'grid', gap: 'var(--eye-space-12)' }}>
          <p>Workspace <strong>{picked.workspace_title}</strong> · purpose {picked.purpose} · audience {picked.audience_ceiling} · access ends {picked.expires_at.slice(0, 10)}. You sign in as <span style={{ fontFamily: 'var(--eye-font-mono)' }}>{picked.login}</span>.</p>
          <label style={{ display: 'grid', gap: 'var(--eye-space-4)' }}>
            Your new password (12+ characters; it expires with the grant)
            <input style={inputStyle} type="password" value={invPassword} onChange={(e) => setInvPassword(e.target.value)} autoComplete="new-password" required minLength={12} />
          </label>
          <button style={buttonStyle} type="submit" disabled={busy || invPassword.length < 12}>{busy ? t('common.loading', locale) : 'Accept and sign in'}</button>
        </form>
      ) : !rotating ? (
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
