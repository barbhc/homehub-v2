// ── Homehub · iOS frame + shared native atoms ───────────────────────────────
// Leaning into iOS conventions: Dynamic-Island status bar, large-title headers,
// translucent bottom tab bar, system font stack. Shared across every direction
// so the chrome stays consistent and only the *content* idea changes.

const IOS_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", system-ui, sans-serif';
const SB_H = 56;   // status bar
const TAB_H = 86;  // bottom tab bar incl. home-indicator safe area

// ── Device frame ───────────────────────────────────────────────────────────────
function PhoneFrame({ bg = '#fff', statusDark = true, children }) {
  return (
    <div style={{ width: '100%', height: '100%', background: '#08090c', padding: 9, boxSizing: 'border-box' }}>
      <div style={{
        position: 'relative', width: '100%', height: '100%', borderRadius: 40, overflow: 'hidden',
        background: bg, fontFamily: IOS_FONT, color: '#0b1220',
        WebkitFontSmoothing: 'antialiased',
      }}>
        {children}
        <IOSStatusBar dark={statusDark} />
        <HomeIndicator dark={statusDark} />
      </div>
    </div>
  );
}

function IOSStatusBar({ dark = true }) {
  const c = dark ? '#0b1220' : '#fff';
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: SB_H, zIndex: 40,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      padding: '17px 30px 0', pointerEvents: 'none',
    }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: c, letterSpacing: 0.2, fontVariantNumeric: 'tabular-nums' }}>9:41</span>
      {/* Dynamic Island */}
      <div style={{ position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)', width: 86, height: 26, borderRadius: 14, background: '#08090c' }} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: c }}>
        <Icon name="signal" size={16} strokeWidth={2.4} />
        <Icon name="wifi" size={16} strokeWidth={2.4} />
        <Icon name="battery-full" size={20} strokeWidth={2} />
      </div>
    </div>
  );
}

function HomeIndicator({ dark = true }) {
  return (
    <div style={{
      position: 'absolute', bottom: 7, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
      width: 128, height: 5, borderRadius: 3, background: dark ? 'rgba(11,18,32,0.85)' : 'rgba(255,255,255,0.85)',
      pointerEvents: 'none',
    }} />
  );
}

// ── Bottom tab bar (translucent, iOS-native) ────────────────────────────────────
// tabs: [{ id, label, icon }]. tone: 'light' | 'dark'. accent: active color.
function TabBar({ tabs, current, accent = '#1B6B5A', tone = 'light', solidBg, onSelect }) {
  const dark = tone === 'dark';
  const bg = solidBg || (dark ? 'rgba(20,22,28,0.78)' : 'rgba(255,255,255,0.82)');
  const inactive = dark ? 'rgba(235,238,244,0.55)' : 'rgba(60,66,78,0.55)';
  const hair = dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: TAB_H, zIndex: 35,
      background: bg, backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)',
      borderTop: `0.5px solid ${hair}`,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around',
      padding: '11px 6px 0',
    }}>
      {tabs.map((t) => {
        const on = t.id === current;
        return (
          <div key={t.id} onClick={onSelect ? () => onSelect(t.id) : undefined}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 58, cursor: onSelect ? 'pointer' : 'default' }}>
            <Icon name={t.icon} size={24} strokeWidth={on ? 2.4 : 2} style={{ color: on ? accent : inactive }} />
            <span style={{ fontSize: 10, fontWeight: on ? 600 : 500, color: on ? accent : inactive, letterSpacing: 0.05 }}>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Standard simple-home tab set (essentials level: Home · Items · Ask).
const TABS_SIMPLE = [
  { id: 'home', label: 'Home', icon: 'house' },
  { id: 'items', label: 'Items', icon: 'package' },
  { id: 'ask', label: 'Ask', icon: 'sparkles' },
];
// Engaged adds Tasks — the unfold.
const TABS_ENGAGED = [
  { id: 'home', label: 'Home', icon: 'house' },
  { id: 'tasks', label: 'Tasks', icon: 'list-checks' },
  { id: 'items', label: 'Items', icon: 'package' },
  { id: 'ask', label: 'Ask', icon: 'sparkles' },
];
// Full five-tab set for the app shell.
const TABS_FULL = [
  { id: 'home', label: 'Home', icon: 'house' },
  { id: 'tasks', label: 'Tasks', icon: 'list-checks' },
  { id: 'items', label: 'Items', icon: 'package' },
  { id: 'ask', label: 'Ask', icon: 'sparkles' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

// ── Shared content atoms ────────────────────────────────────────────────────────

// Scroll body that respects the status bar + tab bar safe areas.
function Screen({ children, bg = 'transparent', padTop = SB_H, padBottom = TAB_H + 8, style }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: bg, overflow: 'hidden',
      paddingTop: padTop, paddingBottom: padBottom, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', ...style,
    }}>
      {children}
    </div>
  );
}

// Tappable check circle for completing a task.
function CheckDot({ size = 26, color = '#1B6B5A', ring = '#CBD5E1', done = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      border: `2px solid ${done ? color : ring}`, background: done ? color : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {done && <Icon name="check" size={size * 0.6} strokeWidth={3} style={{ color: '#fff' }} />}
    </div>
  );
}

// Item icon chip — soft rounded square with the lucide glyph.
function ItemGlyph({ icon, size = 38, bg = '#EEF2F1', fg = '#1B6B5A', radius = 11 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon name={icon} size={size * 0.5} strokeWidth={2} />
    </div>
  );
}

Object.assign(window, {
  IOS_FONT, SB_H, TAB_H, PhoneFrame, IOSStatusBar, HomeIndicator,
  TabBar, TABS_SIMPLE, TABS_ENGAGED, TABS_FULL, Screen, CheckDot, ItemGlyph,
});
