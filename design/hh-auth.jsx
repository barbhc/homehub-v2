// ── Homehub · Auth & invite ──────────────────────────────────────────────────
// The screens that bookend the app: sign in / create account, reset password,
// accept a home invite, and the not-found page. Calm teal system, centred brand
// mark, no tab bars. Standalone of the signed-in shell.

const { useState: useAuS } = React;

const AU_INK = '#0B1220', AU_SUB = '#6B7280', AU_TEAL = '#1B6B5A', AU_BG = '#F3F5F4';

function AuthMark({ size = 64 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.29, background: 'linear-gradient(150deg,#1B6B5A,#2D9B82)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 22px rgba(27,107,90,0.22)' }}>
      <Icon name="house" size={size * 0.46} strokeWidth={1.8} style={{ color: '#fff' }} />
    </div>
  );
}

function AuthInput({ d, label, value, onChange, placeholder, type = 'text', icon, right }) {
  const [show, setShow] = useAuS(false);
  const isPw = type === 'password';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 7px 2px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: AU_SUB, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</span>
        {right}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid rgba(15,23,42,0.14)', borderRadius: 12, padding: '0 12px' }}>
        {icon && <Icon name={icon} size={16} style={{ color: '#9AA6A2', flexShrink: 0 }} />}
        <input type={isPw && !show ? 'password' : 'text'} value={value} onChange={(e) => onChange && onChange(e.target.value)} placeholder={placeholder}
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: d.body, color: AU_INK, padding: '13px 0' }} />
        {isPw && <button onClick={() => setShow((v) => !v)} style={{ border: 'none', background: 'transparent', color: '#9AA6A2', padding: 4, cursor: 'pointer', flexShrink: 0 }}><Icon name={show ? 'eye-off' : 'eye'} size={17} /></button>}
      </div>
    </div>
  );
}

function AuthCTA({ d, label, onClick, icon, disabled }) {
  return (
    <button onClick={disabled ? undefined : onClick} style={{ width: '100%', border: 'none', background: disabled ? '#C9D4D0' : AU_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer' }}>
      {icon && <Icon name={icon} size={18} strokeWidth={2.4} />} {label}
    </button>
  );
}

// Apple logo (the real mark — lucide's ‘apple’ is a fruit, not the brand).
function AppleLogo({ size = 18, color = '#fff' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={color} aria-hidden="true" style={{ display: 'block' }}>
      <path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.23 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.02 2.29-1.27 3.14-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.73-1.05-2.76-4.16zM14.6 4.59c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44z" />
    </svg>
  );
}
function AppleButton({ d, label = 'Continue with Apple', onClick }) {
  return (
    <button onClick={onClick} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, border: 'none', background: '#000', color: '#fff', borderRadius: 14, padding: '14px 0', fontSize: d.body, fontWeight: 700, cursor: 'pointer' }}>
      <span style={{ marginTop: -2, display: 'flex' }}><AppleLogo size={18} /></span> {label}
    </button>
  );
}
function AuthOrDivider({ d }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(15,23,42,0.10)' }} />
      <span style={{ fontSize: d.small, color: AU_SUB, fontWeight: 600 }}>or</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(15,23,42,0.10)' }} />
    </div>
  );
}

function AuthScreen({ children }) {
  return (
    <Screen bg={AU_BG} padBottom={0}>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </Screen>
  );
}

// ── Sign in ──────────────────────────────────────────────────────────────────
function AuthSignIn({ d, onSignIn, onCreate, onForgot }) {
  const [email, setEmail] = useAuS('barb.powell@gmail.com');
  const [pw, setPw] = useAuS('');
  return (
    <AuthScreen>
      <div style={{ padding: `${d.stack + 14}px ${d.pad + 4}px ${d.pad}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <AuthMark />
        <h1 style={{ fontSize: d.big - 2, fontWeight: 800, color: AU_INK, letterSpacing: -0.6, margin: '20px 0 0' }}>Welcome back</h1>
        <p style={{ fontSize: d.body, color: AU_SUB, margin: '7px 0 0' }}>Sign in to look after your home.</p>
      </div>
      <div style={{ padding: `4px ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.gap + 4 }}>
        <AuthInput d={d} label="Email" value={email} onChange={setEmail} placeholder="you@email.com" icon="mail" />
        <AuthInput d={d} label="Password" type="password" value={pw} onChange={setPw} placeholder="Your password" icon="lock"
          right={<button onClick={onForgot} style={{ border: 'none', background: 'transparent', color: AU_TEAL, fontSize: d.small + 0.5, fontWeight: 700, padding: 0, cursor: 'pointer' }}>Forgot?</button>} />
        <div style={{ marginTop: 4 }}><AuthCTA d={d} label="Sign in" onClick={onSignIn} /></div>

        <AuthOrDivider d={d} />
        <AppleButton d={d} label="Continue with Apple" onClick={onSignIn} />
        <button onClick={onSignIn} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, border: '1.5px solid rgba(15,23,42,0.14)', background: '#fff', color: AU_INK, borderRadius: 14, padding: '14px 0', fontSize: d.body, fontWeight: 700, cursor: 'pointer' }}>
          <Icon name="wand-sparkles" size={17} style={{ color: AU_TEAL }} /> Email me a magic link
        </button>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ padding: `${d.stack}px ${d.pad}px calc(20px + env(safe-area-inset-bottom))`, textAlign: 'center', fontSize: d.body, color: AU_SUB }}>
        New to Homehub? <button onClick={onCreate} style={{ border: 'none', background: 'transparent', color: AU_TEAL, fontSize: d.body, fontWeight: 700, padding: 0, cursor: 'pointer' }}>Create an account</button>
      </div>
    </AuthScreen>
  );
}

// ── Create account ───────────────────────────────────────────────────────────
function AuthSignUp({ d, onCreate, onSignIn }) {
  const [name, setName] = useAuS('');
  const [email, setEmail] = useAuS('');
  const [pw, setPw] = useAuS('');
  return (
    <AuthScreen>
      <div style={{ padding: `${d.stack + 14}px ${d.pad + 4}px ${d.pad}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <AuthMark />
        <h1 style={{ fontSize: d.big - 2, fontWeight: 800, color: AU_INK, letterSpacing: -0.6, margin: '20px 0 0' }}>Create your account</h1>
        <p style={{ fontSize: d.body, color: AU_SUB, margin: '7px 0 0' }}>Start keeping your home in order.</p>
      </div>
      <div style={{ padding: `4px ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.gap + 4 }}>
        <AuthInput d={d} label="Your name" value={name} onChange={setName} placeholder="Barb Powell" icon="user" />
        <AuthInput d={d} label="Email" value={email} onChange={setEmail} placeholder="you@email.com" icon="mail" />
        <AuthInput d={d} label="Password" type="password" value={pw} onChange={setPw} placeholder="At least 8 characters" icon="lock" />
        <div style={{ marginTop: 4 }}><AuthCTA d={d} label="Create account" onClick={onCreate} /></div>
        <AuthOrDivider d={d} />
        <AppleButton d={d} label="Sign up with Apple" onClick={onCreate} />
        <p style={{ fontSize: d.small, color: AU_SUB, textAlign: 'center', lineHeight: 1.45, margin: '2px 8px 0' }}>By continuing you agree to our Terms and Privacy Policy.</p>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ padding: `${d.stack}px ${d.pad}px calc(20px + env(safe-area-inset-bottom))`, textAlign: 'center', fontSize: d.body, color: AU_SUB }}>
        Already have an account? <button onClick={onSignIn} style={{ border: 'none', background: 'transparent', color: AU_TEAL, fontSize: d.body, fontWeight: 700, padding: 0, cursor: 'pointer' }}>Sign in</button>
      </div>
    </AuthScreen>
  );
}

// ── Reset password (request + set) ───────────────────────────────────────────
function AuthReset({ d, mode = 'request', onBack, onSubmit }) {
  const [email, setEmail] = useAuS('');
  const [sent, setSent] = useAuS(false);
  const [pw, setPw] = useAuS('');
  const [pw2, setPw2] = useAuS('');
  const match = pw.length >= 8 && pw === pw2;

  return (
    <AuthScreen>
      <div style={{ padding: `2px ${d.pad - 6}px 6px` }}>
        <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: AU_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 4px', cursor: 'pointer' }}>
          <Icon name="chevron-left" size={22} strokeWidth={2.4} /> Sign in
        </button>
      </div>

      {mode === 'set' ? (
        <div style={{ padding: `${d.stack}px ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.gap + 4 }}>
          <div style={{ marginBottom: 4 }}>
            <h1 style={{ fontSize: d.big - 3, fontWeight: 800, color: AU_INK, letterSpacing: -0.5, margin: 0 }}>Set a new password</h1>
            <p style={{ fontSize: d.body, color: AU_SUB, margin: '7px 0 0', lineHeight: 1.45 }}>Pick something you’ll remember — at least 8 characters.</p>
          </div>
          <AuthInput d={d} label="New password" type="password" value={pw} onChange={setPw} placeholder="New password" icon="lock" />
          <AuthInput d={d} label="Confirm password" type="password" value={pw2} onChange={setPw2} placeholder="Repeat it" icon="lock" />
          {pw2.length > 0 && !match && <div style={{ fontSize: d.small + 0.5, color: '#B4791F', marginTop: -4, paddingLeft: 2 }}>Passwords don’t match yet.</div>}
          <div style={{ marginTop: 4 }}><AuthCTA d={d} label="Update password" icon="check" onClick={onSubmit} disabled={!match} /></div>
        </div>
      ) : sent ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: `0 ${d.pad + 8}px` }}>
          <div style={{ width: 74, height: 74, borderRadius: '50%', background: '#E8F2EF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><Icon name="mail-check" size={34} style={{ color: AU_TEAL }} /></div>
          <h1 style={{ fontSize: d.big - 4, fontWeight: 800, color: AU_INK, letterSpacing: -0.4, margin: 0 }}>Check your inbox</h1>
          <p style={{ fontSize: d.body, color: AU_SUB, margin: '9px 0 0', lineHeight: 1.5, maxWidth: 290 }}>We sent a reset link to <strong style={{ color: AU_INK }}>{email || 'your email'}</strong>. It expires in an hour.</p>
          <button onClick={onBack} style={{ marginTop: 22, border: 'none', background: AU_TEAL, color: '#fff', borderRadius: 13, padding: '13px 22px', fontSize: d.body, fontWeight: 700, cursor: 'pointer' }}>Back to sign in</button>
        </div>
      ) : (
        <div style={{ padding: `${d.stack}px ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.gap + 4 }}>
          <div style={{ marginBottom: 4 }}>
            <h1 style={{ fontSize: d.big - 3, fontWeight: 800, color: AU_INK, letterSpacing: -0.5, margin: 0 }}>Reset your password</h1>
            <p style={{ fontSize: d.body, color: AU_SUB, margin: '7px 0 0', lineHeight: 1.45 }}>Enter your email and we’ll send a link to set a new one.</p>
          </div>
          <AuthInput d={d} label="Email" value={email} onChange={setEmail} placeholder="you@email.com" icon="mail" />
          <div style={{ marginTop: 4 }}><AuthCTA d={d} label="Send reset link" onClick={() => setSent(true)} /></div>
        </div>
      )}
    </AuthScreen>
  );
}

// ── Accept invite ────────────────────────────────────────────────────────────
function AcceptInvite({ d, home = 'Maple Street', inviter = 'Sam Powell', role = 'Member', state = 'ready', onJoin, onDecline }) {
  if (state === 'expired') {
    return (
      <AuthScreen>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: `0 ${d.pad + 8}px` }}>
          <div style={{ width: 74, height: 74, borderRadius: '50%', background: '#F1F5F8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><Icon name="link-2-off" size={32} style={{ color: '#5B748F' }} /></div>
          <h1 style={{ fontSize: d.big - 4, fontWeight: 800, color: AU_INK, letterSpacing: -0.4, margin: 0 }}>This invite has expired</h1>
          <p style={{ fontSize: d.body, color: AU_SUB, margin: '9px 0 0', lineHeight: 1.5, maxWidth: 290 }}>Ask {inviter} to send a fresh link, then open it again.</p>
          <button onClick={onDecline} style={{ marginTop: 22, border: '1.5px solid rgba(15,23,42,0.14)', background: '#fff', color: AU_INK, borderRadius: 13, padding: '13px 22px', fontSize: d.body, fontWeight: 700, cursor: 'pointer' }}>Go to sign in</button>
        </div>
      </AuthScreen>
    );
  }
  return (
    <AuthScreen>
      <div style={{ padding: `${d.stack + 14}px ${d.pad + 4}px ${d.stack}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <AuthMark />
        <h1 style={{ fontSize: d.big - 2, fontWeight: 800, color: AU_INK, letterSpacing: -0.6, margin: '20px 0 0' }}>You’re invited</h1>
        <p style={{ fontSize: d.body, color: AU_SUB, margin: '8px 0 0', lineHeight: 1.5, maxWidth: 290 }}><strong style={{ color: AU_INK }}>{inviter}</strong> invited you to help look after their home.</p>
      </div>
      <div style={{ padding: `0 ${d.pad}px` }}>
        <div style={{ background: '#fff', borderRadius: d.radius, boxShadow: '0 2px 14px rgba(11,26,22,0.07)', padding: d.cardPad + 2, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: d.tap + 22, height: d.tap + 22, borderRadius: 16, background: 'linear-gradient(135deg,#EAF3EF,#DCE9E4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="house" size={28} strokeWidth={1.6} style={{ color: AU_TEAL }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: d.h2, fontWeight: 800, color: AU_INK, letterSpacing: -0.3 }}>{home}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#E8F2EF', color: AU_TEAL, borderRadius: 99, padding: '3px 9px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 6 }}><Icon name="user-check" size={11} /> Joining as {role}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: d.stack }}>
          {['See and complete the home’s tasks', 'Browse items, manuals and warranties', 'Ask the assistant about anything in the home'].map((t) => (
            <div key={t} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
              <Icon name="check" size={16} strokeWidth={2.6} style={{ color: AU_TEAL, flexShrink: 0 }} />
              <span style={{ fontSize: d.small + 1, color: '#3A4A45' }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ padding: `${d.stack}px ${d.pad}px calc(18px + env(safe-area-inset-bottom))`, display: 'flex', flexDirection: 'column', gap: d.gap }}>
        <AuthCTA d={d} label={`Join ${home}`} icon="arrow-right" onClick={onJoin} />
        <button onClick={onDecline} style={{ width: '100%', border: 'none', background: 'transparent', color: AU_SUB, fontSize: d.body, fontWeight: 600, padding: '8px 0', cursor: 'pointer' }}>Not now</button>
      </div>
    </AuthScreen>
  );
}

// ── Not found ────────────────────────────────────────────────────────────────
function NotFound({ d, onHome }) {
  return (
    <AuthScreen>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: `0 ${d.pad + 8}px` }}>
        <div style={{ width: 78, height: 78, borderRadius: '50%', background: '#EEF1F5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><Icon name="compass" size={36} style={{ color: '#5B748F' }} /></div>
        <h1 style={{ fontSize: d.big - 2, fontWeight: 800, color: AU_INK, letterSpacing: -0.5, margin: 0 }}>Page not found</h1>
        <p style={{ fontSize: d.body, color: AU_SUB, margin: '9px 0 0', lineHeight: 1.5, maxWidth: 280 }}>That link led somewhere that doesn’t exist. Let’s get you back home.</p>
        <button onClick={onHome} style={{ marginTop: 22, border: 'none', background: AU_TEAL, color: '#fff', borderRadius: 13, padding: '13px 24px', fontSize: d.body, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="house" size={16} /> Go home</button>
      </div>
    </AuthScreen>
  );
}

// ── Connector (sign-in ↔ sign-up ↔ reset) ────────────────────────────────────
function AuthApp({ d, start = 'signin' }) {
  const [view, setView] = useAuS(start);
  if (view === 'signup') return <AuthSignUp d={d} onCreate={() => setView('signin')} onSignIn={() => setView('signin')} />;
  if (view === 'reset') return <AuthReset d={d} mode="request" onBack={() => setView('signin')} onSubmit={() => setView('signin')} />;
  return <AuthSignIn d={d} onSignIn={() => {}} onCreate={() => setView('signup')} onForgot={() => setView('reset')} />;
}

Object.assign(window, { AuthSignIn, AuthSignUp, AuthReset, AcceptInvite, NotFound, AuthApp, AuthMark });
