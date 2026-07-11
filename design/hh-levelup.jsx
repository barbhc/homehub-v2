// ── Homehub · Level-up moment ───────────────────────────────────────────────
// A calm, celebratory bottom sheet when the home grows into a new level. It
// names exactly what just appeared, and offers a graceful way back down.

const LU_INK = '#0B1220', LU_SUB = '#6B7280', LU_TEAL = '#1B6B5A';

const LEVELUP = {
  standard: {
    title: 'You’ve reached Standard',
    sub: 'Your home’s grown enough that Homehub can do more for you. Just added:',
    items: [
      { icon: 'leaf', t: 'Seasonal upkeep', s: 'Recurring reminders, right on Home' },
      { icon: 'sliders-horizontal', t: 'Task filters', s: 'Focus by essential or by room' },
    ],
  },
  advanced: {
    title: 'Welcome to Advanced',
    sub: 'The full toolkit is on. New across your app:',
    items: [
      { icon: 'sparkles', t: 'Deep-clean guides', s: 'Step-by-step, on Home' },
      { icon: 'calendar', t: 'Calendar view', s: 'See upkeep by month in Tasks' },
      { icon: 'layers', t: 'Power tools', s: 'Bulk actions & more' },
    ],
  },
};

function LevelUpSheet({ d, level, onClose, onKeepSimple }) {
  const data = LEVELUP[level] || LEVELUP.standard;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(11,26,22,0.45)', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: '26px 26px 0 0', padding: `10px ${d.pad + 2}px calc(${d.pad}px + env(safe-area-inset-bottom))`, boxShadow: '0 -10px 40px rgba(11,26,22,0.2)' }}>
        <div style={{ width: 38, height: 5, borderRadius: 3, background: 'rgba(15,23,42,0.14)', margin: '0 auto 18px' }} />

        <div style={{ width: 60, height: 60, borderRadius: 18, background: 'linear-gradient(150deg,#1B6B5A,#2D9B82)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Icon name="arrow-up" size={28} strokeWidth={2.6} style={{ color: '#fff' }} />
        </div>

        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: LU_TEAL, marginBottom: 5 }}>New level unlocked</div>
        <h1 style={{ fontSize: d.big - 2, fontWeight: 800, color: LU_INK, letterSpacing: -0.5, margin: 0, lineHeight: 1.12 }}>{data.title}</h1>
        <p style={{ fontSize: d.body, color: LU_SUB, margin: '8px 0 0', lineHeight: 1.45, textWrap: 'pretty' }}>{data.sub}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap, margin: `${d.stack}px 0` }}>
          {data.items.map((m) => (
            <div key={m.t} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: d.tap + 6, height: d.tap + 6, borderRadius: 11, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={m.icon} size={18} style={{ color: LU_TEAL }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: d.body, fontWeight: 700, color: LU_INK, letterSpacing: -0.2 }}>{m.t}</div>
                <div style={{ fontSize: d.small, color: LU_SUB, marginTop: 1 }}>{m.s}</div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={{ width: '100%', border: 'none', background: LU_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, cursor: 'pointer' }}>Show me</button>
        <button onClick={onKeepSimple} style={{ width: '100%', border: 'none', background: 'transparent', color: LU_SUB, padding: '12px 0 2px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}>Keep it simple for now</button>
      </div>
    </div>
  );
}

Object.assign(window, { LevelUpSheet, LEVELUP });
