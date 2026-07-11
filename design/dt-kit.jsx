// ── Homehub · Desktop kit ────────────────────────────────────────────────────
// Translates the finished mobile design language (teal identity, warm surfaces,
// calm tiers, no alarmist red) to a responsive desktop app. Shared tokens,
// atoms, and the two navigation chromes (top-bar + sidebar) live here. Every
// screen reads `T` (theme) + `d` (density) so light/dark and spacing are real.

const DT_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", system-ui, sans-serif';
const DT_MONO = '"SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace';
const APP_H = 880;            // desktop app viewport height inside a board
const CONTENT_MAX = 1180;     // max content width (fluid below this)

// ── Theme ────────────────────────────────────────────────────────────────────
function dtTheme(dark) {
  if (dark) {
    return {
      dark: true,
      bg: '#0D1411', surface: '#161E1A', surface2: '#121A16', raise: '#1E2A24',
      ink: '#F1F5F3', sub: '#8B9A93', faint: '#647069',
      teal: '#34B093', tealDeep: '#34B093', tealWash: 'rgba(52,176,147,0.16)', tealWash2: 'rgba(52,176,147,0.10)', tealInk: '#A7ECD7',
      line: 'rgba(255,255,255,0.08)', line2: 'rgba(255,255,255,0.14)',
      navBg: '#121915', navActive: 'rgba(52,176,147,0.16)',
      shadowSm: '0 1px 2px rgba(0,0,0,0.3)', shadowMd: '0 10px 34px rgba(0,0,0,0.40)', shadowNav: 'none',
      clay: '#E8956A', claySoft: 'rgba(232,149,106,0.16)',
      gold: '#D9B978', goldSoft: 'rgba(217,185,120,0.14)',
      slate: '#8FB0CC', slateSoft: 'rgba(143,176,204,0.14)',
      fieldBg: '#121915',
    };
  }
  return {
    dark: false,
    bg: '#F3F5F4', surface: '#FFFFFF', surface2: '#F7F9F8', raise: '#FFFFFF',
    ink: '#0B1220', sub: '#6B7280', faint: '#9AA6A2',
    teal: '#1B6B5A', tealDeep: '#15564A', tealWash: '#E8F2EF', tealWash2: '#EAF3EF', tealInk: '#15564A',
    line: 'rgba(15,23,42,0.08)', line2: 'rgba(15,23,42,0.14)',
    navBg: '#FFFFFF', navActive: '#E8F2EF',
    shadowSm: '0 1px 2px rgba(15,23,42,0.05)', shadowMd: '0 6px 24px rgba(11,26,22,0.08)', shadowNav: '0 1px 0 rgba(15,23,42,0.05)',
    clay: '#C2410C', claySoft: '#FFF1E8',
    gold: '#7A5A18', goldSoft: '#FBF3E2',
    slate: '#5B748F', slateSoft: '#F1F5F8',
    fieldBg: '#F4F6F5',
  };
}

// Tier accent resolved against the active theme.
function dtTier(T, tier) {
  if (tier === 'essential') return { fg: T.clay, soft: T.claySoft, label: 'Essential' };
  if (tier === 'recommended') return { fg: T.teal, soft: T.tealWash, label: 'Recommended' };
  return { fg: T.slate, soft: T.slateSoft, label: 'Optional' };
}

// ── Brand mark ───────────────────────────────────────────────────────────────
function Logo({ T, size = 26 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.3, background: T.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon name="house" size={size * 0.56} strokeWidth={2.4} style={{ color: '#fff' }} />
    </div>
  );
}
function Wordmark({ T, size = 26 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <Logo T={T} size={size} />
      <span style={{ fontSize: size * 0.62, fontWeight: 800, letterSpacing: -0.5, color: T.ink }}>Homehub</span>
    </div>
  );
}

// ── Atoms ────────────────────────────────────────────────────────────────────
function Card({ T, d, children, pad, style, onClick, raised }) {
  return (
    <div onClick={onClick} style={{
      background: T.surface, border: `1px solid ${T.line}`, borderRadius: (d ? d.radius : 18) - 4,
      boxShadow: raised ? T.shadowMd : T.shadowSm, overflow: 'hidden',
      padding: pad === undefined ? (d ? d.cardPad : 18) : pad,
      cursor: onClick ? 'pointer' : 'default', ...style,
    }}>{children}</div>
  );
}

function Btn({ T, kind = 'primary', icon, iconRight, children, onClick, size = 'md', style }) {
  const pad = size === 'sm' ? '8px 13px' : size === 'lg' ? '13px 20px' : '10px 16px';
  const fs = size === 'sm' ? 13 : size === 'lg' ? 15.5 : 14;
  const base = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 'none', borderRadius: 11, padding: pad, fontSize: fs, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: -0.1, whiteSpace: 'nowrap' };
  const skin = kind === 'primary' ? { background: T.teal, color: '#fff' }
    : kind === 'soft' ? { background: T.tealWash, color: T.tealInk }
    : kind === 'ghost' ? { background: 'transparent', color: T.ink, border: `1.5px solid ${T.line2}` }
    : kind === 'subtle' ? { background: T.surface2, color: T.ink, border: `1px solid ${T.line}` }
    : { background: T.teal, color: '#fff' };
  return (
    <button onClick={onClick} style={{ ...base, ...skin, ...style }}>
      {icon && <Icon name={icon} size={fs + 2} strokeWidth={2.4} />}
      {children}
      {iconRight && <Icon name={iconRight} size={fs + 1} strokeWidth={2.4} />}
    </button>
  );
}

function IconBtn({ T, name, onClick, active, size = 36, title }) {
  return (
    <button title={title} onClick={onClick} style={{
      width: size, height: size, borderRadius: 10, flexShrink: 0,
      background: active ? T.tealWash : 'transparent', border: `1px solid ${active ? 'transparent' : T.line}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    }}>
      <Icon name={name} size={size * 0.46} style={{ color: active ? T.teal : T.sub }} />
    </button>
  );
}

function Pill({ T, active, count, icon, children, onClick, size = 'md' }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      border: `1px solid ${active ? 'transparent' : T.line2}`, background: active ? T.teal : T.surface,
      color: active ? '#fff' : T.sub, borderRadius: 99, padding: size === 'sm' ? '6px 12px' : '8px 14px',
      fontSize: size === 'sm' ? 12.5 : 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
    }}>
      {icon && <Icon name={icon} size={13} />}
      {children}
      {count !== undefined && <span style={{ fontFamily: DT_MONO, fontSize: 11, opacity: active ? 0.85 : 0.6 }}>{count}</span>}
    </button>
  );
}

function TierChip({ T, tier }) {
  const tc = dtTier(T, tier);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: tc.soft, color: tc.fg, borderRadius: 99, padding: '4px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: tc.fg }} />{tc.label}
    </span>
  );
}

function SectionLabel({ T, children, right, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, ...style }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: T.sub, letterSpacing: 0.6, textTransform: 'uppercase' }}>{children}</span>
      {right}
    </div>
  );
}

function Glyph({ T, icon, size = 40, radius = 11, tone = 'teal' }) {
  const bg = tone === 'teal' ? T.tealWash2 : T.surface2;
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: bg, color: T.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon name={icon} size={size * 0.5} strokeWidth={2} />
    </div>
  );
}

function ItemThumb({ T, icon, size = 46, radius = 12 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: T.dark ? T.raise : 'linear-gradient(135deg,#EEF3F1,#E3ECE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.dark ? T.tealInk : T.teal }}>
      <Icon name={icon} size={size * 0.5} strokeWidth={1.8} />
    </div>
  );
}

function Avatar({ T, initials = 'BH', size = 34 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, background: T.tealWash, color: T.teal, display: 'grid', placeItems: 'center', fontSize: size * 0.36, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
  );
}

function CheckBox({ T, done, size = 22 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, flexShrink: 0, border: `2px solid ${done ? T.teal : T.line2}`, background: done ? T.teal : 'transparent', display: 'grid', placeItems: 'center' }}>
      {done && <Icon name="check" size={size * 0.6} strokeWidth={3} style={{ color: '#fff' }} />}
    </div>
  );
}

function Field({ T, label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: T.faint, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: T.ink, fontWeight: 600, fontFamily: mono ? DT_MONO : 'inherit' }}>{value}</div>
    </div>
  );
}

function SearchField({ T, placeholder = 'Search items, tasks, manuals…', width = 280 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', background: T.fieldBg, border: `1px solid ${T.line}`, borderRadius: 10, width, maxWidth: '100%' }}>
      <Icon name="search" size={15} style={{ color: T.faint }} />
      <span style={{ fontSize: 13.5, color: T.faint, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{placeholder}</span>
      <span style={{ fontSize: 11, color: T.faint, fontFamily: DT_MONO, padding: '1px 6px', background: T.surface, border: `1px solid ${T.line}`, borderRadius: 4 }}>⌘K</span>
    </div>
  );
}

// Due text — calm, never red unless genuinely overdue.
function DueText({ T, due, mins }) {
  const overdue = due < 0;
  return (
    <span style={{ fontSize: 12.5, fontWeight: 600, color: overdue ? T.clay : T.sub, fontFamily: 'inherit' }}>
      {dueLabel(due)}{mins != null && <span style={{ color: T.faint, fontWeight: 500 }}> · {mins} min</span>}
    </span>
  );
}

// ── Navigation model — grows with the Homehub level ──────────────────────────
const LEVEL_RANK = { simple: 0, standard: 1, advanced: 2 };
const DT_NAV = [
  { id: 'home', label: 'Home', icon: 'house', min: 'simple' },
  { id: 'tasks', label: 'Tasks', icon: 'list-checks', min: 'simple' },
  { id: 'items', label: 'Items', icon: 'package', min: 'simple' },
  { id: 'clean', label: 'Clean', icon: 'sparkles', min: 'standard' },
  { id: 'warranties', label: 'Warranties', icon: 'shield-check', min: 'standard' },
  { id: 'providers', label: 'Providers', icon: 'wrench', min: 'advanced' },
  { id: 'ask', label: 'Ask', icon: 'sparkles', min: 'simple' },
];
function navFor(level) { return DT_NAV.filter((n) => LEVEL_RANK[n.min] <= LEVEL_RANK[level]); }

// ── Top-bar chrome ───────────────────────────────────────────────────────────
function TopNav({ T, tab, onTab, level, onAdd }) {
  const nav = navFor(level);
  return (
    <div style={{ height: 60, background: T.navBg, borderBottom: `1px solid ${T.line}`, boxShadow: T.shadowNav, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 18, flexShrink: 0, zIndex: 5 }}>
      <Wordmark T={T} size={26} />
      <nav style={{ display: 'flex', gap: 2, marginLeft: 14 }}>
        {nav.map((n) => {
          const on = n.id === tab;
          return (
            <button key={n.id} onClick={() => onTab(n.id)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', border: 'none', borderRadius: 9,
              background: on ? T.navActive : 'transparent', color: on ? T.teal : T.sub,
              fontSize: 13.5, fontWeight: on ? 700 : 500, fontFamily: 'inherit', cursor: 'pointer',
            }}>
              <Icon name={n.icon} size={16} strokeWidth={on ? 2.4 : 2} />{n.label}
            </button>
          );
        })}
      </nav>
      <div style={{ flex: 1 }} />
      <SearchField T={T} width={240} />
      <Btn T={T} icon="plus" size="md" onClick={onAdd}>Add item</Btn>
      <IconBtn T={T} name="bell" title="Notifications" />
      <IconBtn T={T} name="settings" active={tab === 'settings'} onClick={() => onTab('settings')} title="Settings" />
      <Avatar T={T} />
    </div>
  );
}

// ── Sidebar chrome ───────────────────────────────────────────────────────────
function Sidebar({ T, d, tab, onTab, level }) {
  const nav = navFor(level);
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);
  return (
    <div style={{ width: 244, background: T.navBg, borderRight: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', flexShrink: 0, padding: '20px 14px' }}>
      <div style={{ padding: '0 8px 18px' }}><Wordmark T={T} size={26} /></div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        {nav.map((n) => {
          const on = n.id === tab;
          return (
            <button key={n.id} onClick={() => onTab(n.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: 'none', borderRadius: 10,
              background: on ? T.navActive : 'transparent', color: on ? T.teal : T.sub,
              fontSize: 14, fontWeight: on ? 700 : 500, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
            }}>
              <Icon name={n.icon} size={18} strokeWidth={on ? 2.4 : 2} />{n.label}
            </button>
          );
        })}
      </nav>
      <div style={{ marginTop: 12, padding: '11px 12px', borderRadius: 12, background: T.tealWash2, border: `1px solid ${T.line}` }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: T.sub, letterSpacing: 0.4, textTransform: 'uppercase' }}>Homehub level</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.teal, marginTop: 2 }}>{levelLabel}</div>
      </div>
      <button onClick={() => onTab('settings')} style={{
        marginTop: 10, display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 10,
        border: 'none', background: tab === 'settings' ? T.navActive : 'transparent', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <Avatar T={T} size={32} />
        <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Barb Haynes</div>
          <div style={{ fontSize: 11, color: T.faint }}>Settings</div>
        </div>
        <Icon name="settings" size={16} style={{ color: tab === 'settings' ? T.teal : T.faint }} />
      </button>
    </div>
  );
}

// Top strip shown above content in sidebar mode (page title + search + add).
function SidebarTopStrip({ T, title, onAdd }) {
  return (
    <div style={{ height: 60, borderBottom: `1px solid ${T.line}`, background: T.navBg, display: 'flex', alignItems: 'center', gap: 14, padding: '0 28px', flexShrink: 0 }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: T.ink, letterSpacing: -0.4, margin: 0 }}>{title}</h2>
      <div style={{ flex: 1 }} />
      <SearchField T={T} width={300} />
      <Btn T={T} icon="plus" onClick={onAdd}>Add item</Btn>
    </div>
  );
}

// ── App chrome wrapper — switches between top-bar and sidebar layouts ─────────
// `nav` = 'top' | 'sidebar'. Renders the chrome + a scrolling content region.
function AppChrome({ T, d, nav = 'top', tab, onTab, level = 'simple', title, onAdd, children, scrollKey }) {
  const scroller = (
    <div key={scrollKey} style={{ flex: 1, overflowY: 'auto', background: T.bg }}>
      <div style={{ maxWidth: CONTENT_MAX, margin: '0 auto', padding: '26px 28px 40px' }}>{children}</div>
    </div>
  );
  if (nav === 'sidebar') {
    return (
      <div style={{ display: 'flex', height: '100%', background: T.bg, fontFamily: DT_FONT, color: T.ink }}>
        <Sidebar T={T} d={d} tab={tab} onTab={onTab} level={level} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <SidebarTopStrip T={T} title={title} onAdd={onAdd} />
          {scroller}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.bg, fontFamily: DT_FONT, color: T.ink }}>
      <TopNav T={T} tab={tab} onTab={onTab} level={level} onAdd={onAdd} />
      {scroller}
    </div>
  );
}

// ── Window wrapper for boards ────────────────────────────────────────────────
// Frames a desktop screen as a clean app window for the design canvas.
function Win({ T, height = APP_H, children, bare }) {
  return (
    <div style={{
      width: '100%', height, borderRadius: 16, overflow: 'hidden',
      border: `1px solid ${bare ? 'transparent' : T.line}`, boxShadow: T.shadowMd,
      background: T.bg, fontFamily: DT_FONT,
    }}>{children}</div>
  );
}

Object.assign(window, {
  DT_FONT, DT_MONO, APP_H, CONTENT_MAX, dtTheme, dtTier, LEVEL_RANK, DT_NAV, navFor,
  Logo, Wordmark, Card, Btn, IconBtn, Pill, TierChip, SectionLabel, Glyph, ItemThumb,
  Avatar, CheckBox, Field, SearchField, DueText, TopNav, Sidebar, SidebarTopStrip, AppChrome, Win,
});
