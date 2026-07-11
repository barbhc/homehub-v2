// ── Homehub · Cross-app states ───────────────────────────────────────────────
// The states every screen needs but a happy-path mock skips: loading skeletons,
// a calm error-with-retry, and an offline notice. Same teal system; skeletons
// shimmer, errors stay reassuring (never red), offline is a quiet FYI.

const { useState: useSkS } = React;

const SK_BG = '#F3F5F4', SK_SUB = '#6B7280', SK_INK = '#0B1220', SK_TEAL = '#1B6B5A', SK_SLATE = '#5B748F';
const SK_KEYFRAMES = '@keyframes hhshimmer{0%{background-position:-300px 0}100%{background-position:300px 0}}';

// Shimmer block primitive.
function Sk({ w = '100%', h = 14, r = 8, style }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg,#E7EBEA 25%,#F2F5F4 37%,#E7EBEA 63%)', backgroundSize: '300px 100%', animation: 'hhshimmer 1.4s ease infinite', flexShrink: 0, ...style }} />;
}

// ── Home loading skeleton ────────────────────────────────────────────────────
function HomeSkeleton({ d, tabs = TABS_FULL }) {
  return (
    <Screen bg={SK_BG}>
      <style>{SK_KEYFRAMES}</style>
      <div style={{ padding: `12px ${d.pad}px 0`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Sk w={160} h={22} /><Sk w={64} h={13} />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', padding: `${d.stack}px ${d.pad}px 0`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        <Sk w="100%" h={46} r={14} />
        <div>
          <Sk w={84} h={12} style={{ marginBottom: 10 }} />
          <Sk w="100%" h={148} r={d.radius} />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Sk w={d.tap} h={d.tap} r={10} />
            <div style={{ flex: 1 }}><Sk w="58%" h={14} style={{ marginBottom: 7 }} /><Sk w="34%" h={11} /></div>
          </div>
        ))}
      </div>
      <TabBar tabs={tabs} current="home" accent={SK_TEAL} solidBg="rgba(243,245,244,0.85)" />
    </Screen>
  );
}

// ── List loading skeleton (Items / Tasks) ────────────────────────────────────
function ListSkeleton({ d, tabs = TABS_FULL, current = 'items', title = 'Items' }) {
  return (
    <Screen bg={SK_BG}>
      <style>{SK_KEYFRAMES}</style>
      <div style={{ padding: `12px ${d.pad}px 0` }}><Sk w={120} h={26} /></div>
      <div style={{ flex: 1, overflow: 'hidden', padding: `${d.gap + 6}px ${d.pad}px 0` }}>
        <Sk w="100%" h={42} r={12} style={{ marginBottom: d.stack }} />
        <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 13, alignItems: 'center', padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.06)' : 'none' }}>
              <Sk w={d.tap + 20} h={d.tap + 20} r={12} />
              <div style={{ flex: 1 }}><Sk w={`${60 - i * 4}%`} h={14} style={{ marginBottom: 7 }} /><Sk w={`${36 - i * 2}%`} h={11} /></div>
            </div>
          ))}
        </div>
      </div>
      <TabBar tabs={tabs} current={current} accent={SK_TEAL} solidBg="rgba(243,245,244,0.85)" />
    </Screen>
  );
}

// ── Error with retry ─────────────────────────────────────────────────────────
function ErrorState({ d, tabs, current = 'home', title = 'Couldn’t load this', body = 'Something went wrong on our side. Check your connection and give it another try.', onRetry, bg = SK_BG }) {
  const [busy, setBusy] = useSkS(false);
  const retry = () => { if (!onRetry) return; setBusy(true); setTimeout(() => { setBusy(false); onRetry(); }, 900); };
  return (
    <Screen bg={bg}>
      <style>{SK_KEYFRAMES}</style>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: `0 ${d.pad + 8}px` }}>
        <div style={{ width: 74, height: 74, borderRadius: '50%', background: '#EEF1F5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><Icon name="cloud-off" size={34} style={{ color: SK_SLATE }} /></div>
        <h1 style={{ fontSize: d.big - 4, fontWeight: 800, color: SK_INK, letterSpacing: -0.4, margin: 0 }}>{title}</h1>
        <p style={{ fontSize: d.body, color: SK_SUB, margin: '9px 0 0', lineHeight: 1.5, maxWidth: 290 }}>{body}</p>
        <button onClick={retry} style={{ marginTop: 22, border: 'none', background: SK_TEAL, color: '#fff', borderRadius: 13, padding: '13px 22px', fontSize: d.body, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {busy ? <span style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'hhspin .8s linear infinite' }} /> : <Icon name="rotate-cw" size={16} strokeWidth={2.4} />}
          {busy ? 'Retrying…' : 'Try again'}
        </button>
        <style>{'@keyframes hhspin{to{transform:rotate(360deg)}}'}</style>
      </div>
      {tabs && <TabBar tabs={tabs} current={current} accent={SK_TEAL} solidBg="rgba(243,245,244,0.85)" />}
    </Screen>
  );
}

// ── Inline section error (retry just one card) ───────────────────────────────
function InlineError({ d, text = 'Couldn’t load this section.', onRetry }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: d.radius - 4, padding: d.cardPad }}>
      <Icon name="cloud-off" size={18} style={{ color: SK_SLATE, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: d.small + 1, color: '#46535F' }}>{text}</span>
      <button onClick={onRetry} style={{ border: '1px solid rgba(15,23,42,0.14)', background: '#fff', color: SK_INK, borderRadius: 9, padding: '7px 12px', fontSize: d.small + 0.5, fontWeight: 700, cursor: 'pointer' }}>Retry</button>
    </div>
  );
}

// ── Offline notice — a quiet inline strip placed at the top of a screen ───────
function OfflineBanner({ d, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#EEF1F5', border: '1px solid #DBE2EA', borderRadius: 12, padding: '9px 12px', ...style }}>
      <Icon name="cloud-off" size={15} style={{ color: SK_SLATE, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: d.small + 0.5, color: '#46535F', fontWeight: 600 }}>You’re offline — showing your last saved view</span>
      <span style={{ fontSize: d.small - 0.5, color: SK_SLATE, fontWeight: 600, whiteSpace: 'nowrap' }}>Synced 2h ago</span>
    </div>
  );
}

Object.assign(window, { Sk, HomeSkeleton, ListSkeleton, ErrorState, InlineError, OfflineBanner });
