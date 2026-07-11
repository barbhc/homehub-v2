// ── Homehub · Feature exploration — shared atoms ─────────────────────────────
// Reusable pieces for the P2 feature-option canvases (due-date math, unified
// week agenda, notification preferences). Mobile-first; reuses PhoneFrame /
// Screen / dens / Icon from hh-frame.jsx and the unified upkeep model.

const { useState: useFeS } = React;
const FE_INK = '#0B1220', FE_SUB = '#6B7280', FE_FAINT = '#9AA6A2', FE_TEAL = '#1B6B5A', FE_TEALD = '#15564A';
const FE_GOLD = '#8A5A12', FE_GOLDBG = '#FBF3E2', FE_LINE = 'rgba(15,23,42,0.08)', FE_BG = '#F3F5F4';

// ── date helpers ─────────────────────────────────────────────────────────────
const FE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FE_SEASON_MONTH = { spring: 2, summer: 5, fall: 8, winter: 11 }; // Mar / Jun / Sep / Dec
function feFmt(dt) { return `${FE_MONTHS[dt.getMonth()]} ${dt.getDate()}`; }
function feAddDays(base, days) { const d = new Date(base); d.setDate(d.getDate() + days); return d; }
const FE_INTERVAL_DAYS = { 'Weekly': 7, 'Monthly': 30, 'Every 3 months': 91, 'Every 6 months': 182, 'Yearly': 365 };
// Compute the next occurrence for a cadence model { recur, every, season }.
function feNext(model, from = new Date()) {
  if (model.recur === 'seasonal') {
    const m = FE_SEASON_MONTH[model.season] ?? 8;
    let yr = from.getFullYear();
    let dt = new Date(yr, m, 15);
    if (dt <= from) dt = new Date(yr + 1, m, 15);
    return dt;
  }
  return feAddDays(from, FE_INTERVAL_DAYS[model.every] || 90);
}
function feRelative(dt, from = new Date()) {
  const days = Math.round((dt - from) / 86400000);
  if (days <= 0) return 'today';
  if (days < 14) return `in ${days} days`;
  if (days < 56) return `in ${Math.round(days / 7)} weeks`;
  if (days < 365) return `in ${Math.round(days / 30)} months`;
  return 'in a year';
}

// ── small atoms ──────────────────────────────────────────────────────────────
function FeNav({ d, title = 'Today', right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `2px ${d.pad - 6}px 8px` }}>
      <button style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: FE_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 4px', cursor: 'pointer' }}>
        <Icon name="chevron-left" size={22} strokeWidth={2.4} /> {title}
      </button>
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}
function FeLabel({ children, style }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: FE_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10, paddingLeft: 2, ...style }}>{children}</div>;
}
function FeCard({ d, children, style, pad }) {
  return <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', padding: pad === undefined ? d.cardPad : pad, ...style }}>{children}</div>;
}
function FeCheck({ on, size = 24 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: size / 2, flexShrink: 0, border: `2px solid ${on ? FE_TEAL : 'rgba(15,23,42,0.22)'}`, background: on ? FE_TEAL : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on && <Icon name="check" size={size * 0.55} strokeWidth={3} style={{ color: '#fff' }} />}</span>
  );
}
function FeBtn({ d, children, onClick, kind = 'primary', icon, size = 'md', style }) {
  const pad = size === 'sm' ? '10px 14px' : '14px 18px';
  const skin = kind === 'primary' ? { background: FE_TEAL, color: '#fff', border: 'none' }
    : kind === 'ghost' ? { background: '#fff', color: FE_INK, border: '1.5px solid rgba(15,23,42,0.14)' }
    : { background: '#EAF3EF', color: FE_TEALD, border: 'none' };
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, padding: pad, fontSize: d.body, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', ...skin, ...style }}>
      {icon && <Icon name={icon} size={17} strokeWidth={2.4} />}{children}
    </button>
  );
}
// A source chip — which surface a unified-agenda item comes from.
const FE_SOURCES = {
  item:   { label: 'Appliance', icon: 'package',     fg: '#1B6B5A', bg: '#EAF3EF' },
  upkeep: { label: 'Home',      icon: 'house',        fg: '#8A5A12', bg: '#FBF3E2' },
  clean:  { label: 'Clean',     icon: 'spray-can',    fg: '#3A6EA5', bg: '#E8F1F7' },
};
function FeSourceChip({ kind, d }) {
  const s = FE_SOURCES[kind] || FE_SOURCES.item;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: s.bg, color: s.fg, borderRadius: 99, padding: '2px 8px', fontSize: (d.small || 12) - 1, fontWeight: 700 }}>
      <Icon name={s.icon} size={10} /> {s.label}
    </span>
  );
}

Object.assign(window, {
  FE_INK, FE_SUB, FE_FAINT, FE_TEAL, FE_TEALD, FE_GOLD, FE_GOLDBG, FE_LINE, FE_BG,
  feFmt, feAddDays, feNext, feRelative, FE_MONTHS, FE_INTERVAL_DAYS,
  FeNav, FeLabel, FeCard, FeCheck, FeBtn, FeSourceChip, FE_SOURCES,
});
