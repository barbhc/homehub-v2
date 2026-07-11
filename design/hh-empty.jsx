// ── Homehub · New-user empty state (Home) ───────────────────────────────────
// First run, zero items. Warm welcome, one clear primary action (add your
// first item) plus a couple of add methods, a short "what you'll get", and Ask
// available even before anything's added. Calm teal system, iOS-native.

const { useState: useEmS } = React;

const EM_INK = '#0B1220', EM_SUB = '#6B7280', EM_TEAL = '#1B6B5A', EM_BG = '#F3F5F4';

const EM_METHODS = [
  { icon: 'camera', label: 'Snap a photo', sub: 'We’ll identify it for you' },
  { icon: 'scan-line', label: 'Scan the label', sub: 'Model & serial in one go' },
  { icon: 'file-text', label: 'Upload a manual', sub: 'We’ll pull out the key details' },
];
const EM_VALUE = [
  { icon: 'bell-ring', label: 'Timely reminders', sub: 'Filters, service, upkeep' },
  { icon: 'book-open', label: 'Manuals & answers', sub: 'Ask, get the right page' },
  { icon: 'shield-check', label: 'Warranty tracking', sub: 'Know before it lapses' },
];

function EmptyHome({ d, variant = 'full', askVariant = 'mini', tabs = TABS_FULL, currentTab = 'home', onTab, onAdd }) {
  return (
    <Screen bg={EM_BG}>
      <div style={{ padding: `12px ${d.pad}px 0` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: EM_TEAL, letterSpacing: 0.5, textTransform: 'uppercase' }}>Welcome</div>
        <h1 style={{ fontSize: d.big, fontWeight: 800, color: EM_INK, letterSpacing: -0.7, margin: '2px 0 0' }}>Hi, Barb 👋</h1>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 0` }}>
        {/* hero */}
        <div style={{ background: 'linear-gradient(160deg,#EAF3EF,#E0EBE6)', borderRadius: d.radius, padding: `${d.cardPad + 6}px ${d.cardPad + 2}px`, textAlign: 'center', marginBottom: d.stack }}>
          <div style={{ width: d.tap + 34, height: d.tap + 34, borderRadius: 20, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Icon name="house-plus" size={30} strokeWidth={1.8} style={{ color: EM_TEAL }} />
          </div>
          <h2 style={{ fontSize: d.h2 + 3, fontWeight: 800, color: EM_INK, letterSpacing: -0.4, margin: 0, lineHeight: 1.15 }}>Let’s set up your home</h2>
          <p style={{ fontSize: d.body, color: '#4C5A55', lineHeight: 1.45, margin: '8px auto 0', maxWidth: 280, textWrap: 'pretty' }}>
            Add an appliance or fixture and Homehub keeps track of its upkeep, manuals and warranty.
          </p>
          <button onClick={onAdd} style={{ marginTop: 18, width: '100%', border: 'none', background: EM_TEAL, color: '#fff', borderRadius: 14, padding: '14px 0', fontSize: d.body + 1, fontWeight: 700, letterSpacing: -0.1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="plus" size={19} strokeWidth={2.6} /> Add your first item
          </button>
        </div>

        {variant === 'full' && (
          <React.Fragment>
            {/* add methods */}
            <div style={{ fontSize: 12, fontWeight: 700, color: EM_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2 }}>Or start with</div>
            <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden', marginBottom: d.stack }}>
              {EM_METHODS.map((m, i) => (
                <div key={m.label} onClick={onAdd} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: i === EM_METHODS.length - 1 ? 'none' : '0.5px solid rgba(15,23,42,0.07)', cursor: 'pointer' }}>
                  <div style={{ width: d.tap + 6, height: d.tap + 6, borderRadius: 10, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={m.icon} size={18} style={{ color: EM_TEAL }} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: d.body, fontWeight: 600, color: EM_INK, letterSpacing: -0.2 }}>{m.label}</div>
                    <div style={{ fontSize: d.small, color: EM_SUB, marginTop: 1 }}>{m.sub}</div>
                  </div>
                  <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4' }} />
                </div>
              ))}
            </div>

            {/* what you'll get */}
            <div style={{ fontSize: 12, fontWeight: 700, color: EM_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2 }}>What you’ll get</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap, marginBottom: d.stack }}>
              {EM_VALUE.map((v) => (
                <div key={v.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: d.tap, height: d.tap, borderRadius: 9, background: '#fff', border: '1px solid rgba(15,23,42,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={v.icon} size={16} style={{ color: EM_TEAL }} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: d.body - 0.5, fontWeight: 600, color: EM_INK, letterSpacing: -0.2 }}>{v.label}</div>
                    <div style={{ fontSize: d.small, color: EM_SUB, marginTop: 1 }}>{v.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </React.Fragment>
        )}

        {/* Ask — available even before adding anything */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid rgba(15,23,42,0.10)', borderRadius: 14, padding: '11px 11px 11px 14px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
          <Icon name="sparkles" size={17} style={{ color: EM_TEAL }} />
          <span style={{ flex: 1, fontSize: d.body, color: '#8A9994' }}>Ask a home question…</span>
          <div style={{ width: d.tap, height: d.tap, borderRadius: '50%', background: EM_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="arrow-up" size={16} strokeWidth={2.6} style={{ color: '#fff' }} /></div>
        </div>
        <div style={{ height: d.pad }} />
      </div>

      <TabBar tabs={tabs} current={currentTab} onSelect={onTab} accent={EM_TEAL} solidBg="rgba(243,245,244,0.85)" />
    </Screen>
  );
}

Object.assign(window, { EmptyHome, EM_METHODS, EM_VALUE });
