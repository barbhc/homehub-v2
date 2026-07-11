// ── Homehub · Settings tab ───────────────────────────────────────────────────
// iOS grouped settings. Home to the Interface level control (Simple / Standard /
// Advanced) — the switch that drives how much of the app is revealed.

const { useState: useStS } = React;

const ST_INK = '#0B1220', ST_SUB = '#6B7280', ST_TEAL = '#1B6B5A', ST_BG = '#EFF1F0';

function Switch({ on, onToggle }) {
  return (
    <div onClick={onToggle} style={{ width: 46, height: 28, borderRadius: 14, background: on ? ST_TEAL : '#D6DBDA', position: 'relative', cursor: 'pointer', transition: 'background .15s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 24, height: 24, borderRadius: 12, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left .15s' }} />
    </div>
  );
}

function Segmented({ d, options, value, onChange }) {
  return (
    <div style={{ display: 'flex', background: '#E7EAE9', borderRadius: 11, padding: 3, gap: 2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{ flex: 1, border: 'none', borderRadius: 9, padding: '8px 4px', background: on ? '#fff' : 'transparent', color: on ? ST_INK : ST_SUB, fontSize: d.small + 1, fontWeight: on ? 700 : 500, boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer' }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function StRow({ d, icon, iconBg = '#EAF3EF', iconFg = ST_TEAL, label, value, right, last, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: last ? 'none' : '0.5px solid rgba(15,23,42,0.07)', cursor: onClick ? 'pointer' : 'default' }}>
      {icon && <div style={{ width: d.tap, height: d.tap, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={17} style={{ color: iconFg }} /></div>}
      <span style={{ flex: 1, fontSize: d.body, color: ST_INK, fontWeight: 500 }}>{label}</span>
      {value && <span style={{ fontSize: d.body - 0.5, color: ST_SUB }}>{value}</span>}
      {right || (onClick && <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4' }} />)}
    </div>
  );
}

function Group({ d, title, children }) {
  return (
    <div style={{ marginBottom: d.stack }}>
      {title && <div style={{ fontSize: 12, fontWeight: 700, color: ST_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, paddingLeft: d.pad - 6 }}>{title}</div>}
      <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden', margin: `0 ${d.pad - 16}px` }}>{children}</div>
    </div>
  );
}

const LEVEL_DESC = {
  simple:   'Just the essentials — today’s tasks and the basics. Calmest setup.',
  standard: 'Adapts as your home grows. New tools appear when they’re useful.',
  advanced: 'Everything on — filters, calendar, deep-clean guides and bulk tools.',
};

function SettingsTab({ d, tabs = TABS_FULL, current = 'settings', onTab, level = 'standard', onLevel, onOpen, appearance = 'light', onAppearance }) {
  const [lvl, setLvl] = useStS(level);
  const setLevel = (v) => { setLvl(v); onLevel && onLevel(v); };

  return (
    <Screen bg={ST_BG}>
      <div style={{ padding: `10px ${d.pad}px 4px` }}>
        <h1 style={{ fontSize: d.big, fontWeight: 800, color: ST_INK, letterSpacing: -0.7, margin: 0 }}>Settings</h1>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.gap + 4}px 0 0` }}>
        {/* profile */}
        <div onClick={() => onOpen && onOpen('profile')} style={{ margin: `0 ${d.pad - 16}px ${d.stack}px`, background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', padding: d.cardPad, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
          <div style={{ width: d.tap + 22, height: d.tap + 22, borderRadius: '50%', background: 'linear-gradient(135deg,#1B6B5A,#2D9B82)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: d.h2, fontWeight: 700, flexShrink: 0 }}>B</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: d.h2, fontWeight: 700, color: ST_INK, letterSpacing: -0.3 }}>Barb Powell</div>
            <div style={{ fontSize: d.small + 1, color: ST_SUB, marginTop: 1 }}>barb.powell@gmail.com</div>
          </div>
          <Icon name="chevron-right" size={20} style={{ color: '#C2CBD4' }} />
        </div>

        {/* interface level — the unfold control */}
        <div style={{ fontSize: 12, fontWeight: 700, color: ST_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, paddingLeft: d.pad - 6 }}>Homehub level</div>
        <div style={{ margin: `0 ${d.pad - 16}px ${d.stack}px`, background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', padding: d.cardPad }}>
          <Segmented d={d} value={lvl} onChange={setLevel}
            options={[{ value: 'simple', label: 'Simple' }, { value: 'standard', label: 'Standard' }, { value: 'advanced', label: 'Advanced' }]} />
          <div style={{ fontSize: d.small + 1, color: ST_SUB, lineHeight: 1.45, marginTop: 11, textWrap: 'pretty' }}>{LEVEL_DESC[lvl]}</div>
        </div>

        {/* appearance */}
        <div style={{ fontSize: 12, fontWeight: 700, color: ST_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, paddingLeft: d.pad - 6 }}>Appearance</div>
        <div style={{ margin: `0 ${d.pad - 16}px ${d.stack}px`, background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', padding: d.cardPad }}>
          <Segmented d={d} value={appearance} onChange={(v) => onAppearance && onAppearance(v)}
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
        </div>

        {/* home */}
        <Group d={d} title="Home">
          <StRow d={d} icon="house" label="My home" value="Maple Street" onClick={() => onOpen && onOpen('home')} />
          <StRow d={d} icon="layout-grid" label="Rooms" value="5" onClick={() => onOpen && onOpen('rooms')} />
          <StRow d={d} icon="users" label="Members" value="2" onClick={() => onOpen && onOpen('members')} last />
        </Group>

        {/* care & service */}
        <Group d={d} title="Care &amp; service">
          <StRow d={d} icon="list-checks" label="Custom tasks" value="3" onClick={() => onOpen && onOpen('custasks')} />
          <StRow d={d} icon="spray-can" label="Deep clean" onClick={() => onOpen && onOpen('clean')} />
          <StRow d={d} icon="shield-check" iconBg="#FAF6EC" iconFg="#9A7B3A" label="Warranties" value="2 active" onClick={() => onOpen && onOpen('warranties')} />
          <StRow d={d} icon="contact" label="Service providers" value="4" onClick={() => onOpen && onOpen('providers')} last />
        </Group>

        {/* notifications */}
        <Group d={d} title="Notifications">
          <StRow d={d} icon="bell" iconBg="#FBF1EC" iconFg="#C2410C" label="Notifications" value="On" onClick={() => onOpen && onOpen('notifications')} last />
        </Group>

        {/* support */}
        <Group d={d} title="Support">
          <StRow d={d} icon="circle-help" label="Help center" onClick={() => onOpen && onOpen('help')} />
          <StRow d={d} icon="info" label="About" value="v2.4.0" onClick={() => {}} last />
        </Group>
        <div style={{ height: d.pad }} />
      </div>

      <TabBar tabs={tabs} current={current} onSelect={onTab} accent={ST_TEAL} solidBg="rgba(239,241,240,0.85)" />
    </Screen>
  );
}

Object.assign(window, { SettingsTab, Switch, Segmented, LEVEL_DESC });
