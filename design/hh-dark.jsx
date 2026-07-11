// ── Homehub · Dark mode ─────────────────────────────────────────────────────
// A faithful dark theme for the core tabs, built as its own interactive shell
// so the working light app stays untouched. Dark green-tinted surfaces,
// brightened teal accent, AA-contrast text. Reuses the shared data + frame.

const { useState: useDkS } = React;

const DK = {
  bg: '#0D1411', surface: '#161E1A', surfaceAlt: '#1E2A24', raise: '#22302A',
  ink: '#F1F5F3', sub: '#8B9A93', faint: '#647069',
  line: 'rgba(255,255,255,0.08)', line2: 'rgba(255,255,255,0.12)',
  teal: '#34B093', tealSoft: 'rgba(52,176,147,0.16)', tealInk: '#A7ECD7',
  clay: '#E8956A', claySoft: 'rgba(232,149,106,0.16)',
  gold: '#D9B978', slate: '#8FB0CC',
};

function dkCard(d, extra) { return { background: DK.surface, borderRadius: d.radius - 4, border: `1px solid ${DK.line}`, overflow: 'hidden', ...extra }; }
function DkChip({ d, tier }) {
  const c = tier === 'essential' ? DK.clay : DK.teal;
  const soft = tier === 'essential' ? DK.claySoft : DK.tealSoft;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: soft, color: c, borderRadius: 99, padding: '4px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}><span style={{ width: 6, height: 6, borderRadius: 3, background: c }} />{tier === 'essential' ? 'Essential' : 'Recommended'}</span>;
}
function DkGlyph({ icon, d, size }) {
  const s = size || d.tap + 8;
  return <div style={{ width: s, height: s, borderRadius: 11, background: DK.surfaceAlt, color: DK.tealInk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={s * 0.5} /></div>;
}
function dkDot({ size = 26, on }) {
  return { width: size, height: size, borderRadius: size / 2, flexShrink: 0, border: `2px solid ${on ? DK.teal : DK.line2}`, background: on ? DK.teal : 'transparent' };
}
function DkLabel({ d, children, right }) {
  return <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, paddingLeft: 2 }}>
    <span style={{ fontSize: 12, fontWeight: 700, color: DK.sub, letterSpacing: 0.6, textTransform: 'uppercase' }}>{children}</span>
    {right}
  </div>;
}

// ── Home ─────────────────────────────────────────────────────────────────────
function DarkHome({ d, tabs, onTab }) {
  const sorted = [...HH_TASKS].sort((a, b) => a.due - b.due);
  const hero = sorted[0], up = sorted.slice(1), it = hhItem(hero.item);
  return (
    <Screen bg={DK.bg}>
      <div style={{ padding: `12px ${d.pad}px 0`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: d.h2, fontWeight: 800, color: DK.ink, letterSpacing: -0.4 }}>{hhGreeting()}, Barb</span>
        <span style={{ fontSize: d.small, color: DK.sub, fontWeight: 600 }}>{hhShortDate(0)}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 0`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        {/* ask mini */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, ...dkCard(d), padding: '11px 11px 11px 15px' }}>
          <Icon name="sparkles" size={17} style={{ color: DK.tealInk }} />
          <span style={{ flex: 1, fontSize: d.body, color: DK.faint }}>Ask about your home…</span>
          <div style={{ width: d.tap, height: d.tap, borderRadius: '50%', background: DK.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="arrow-up" size={16} strokeWidth={2.6} style={{ color: '#06120E' }} /></div>
        </div>

        {/* hero */}
        <div>
          <DkLabel d={d} right={<span style={{ fontSize: d.small, color: DK.sub }}>{up.length} more this week</span>}>Due today</DkLabel>
          <div style={dkCard(d, { padding: d.cardPad + 2 })}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <DkChip d={d} tier={hero.tier} />
              <span style={{ fontSize: d.small, fontWeight: 700, color: DK.tealInk }}>{dueLabel(hero.due)} · {hero.mins} min</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
              <DkGlyph icon={it.icon} d={d} size={d.tap + 22} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: d.h2 + 1, fontWeight: 800, color: DK.ink, letterSpacing: -0.3, lineHeight: 1.1 }}>{hero.name}</div>
                <div style={{ fontSize: d.small + 1, color: DK.sub, marginTop: 3 }}>{it.name} · {it.room}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: d.gap, marginTop: 16 }}>
              <button style={{ flex: 1, border: 'none', background: DK.teal, color: '#06120E', borderRadius: 13, padding: '13px 0', fontSize: d.body, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer' }}><Icon name="check" size={17} strokeWidth={2.8} /> Mark done</button>
              <button style={{ border: `1.5px solid ${DK.line2}`, background: 'transparent', color: DK.ink, borderRadius: 13, padding: '13px 16px', fontSize: d.body, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>See how <Icon name="chevron-down" size={16} /></button>
            </div>
          </div>
        </div>

        {/* upcoming */}
        <div>
          <DkLabel d={d}>Upcoming</DkLabel>
          <div style={{ position: 'relative', paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: d.gap }}>
            <div style={{ position: 'absolute', left: 5, top: 6, bottom: 8, width: 2, background: DK.line }} />
            {up.map((t) => {
              const item = hhItem(t.item);
              return (
                <div key={t.id} style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: -19, top: 16, width: 12, height: 12, borderRadius: 7, background: DK.bg, border: `2px solid ${t.tier === 'essential' ? DK.clay : DK.teal}` }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...dkCard(d), padding: `${d.rowPy}px ${d.cardPad}px` }}>
                    <DkGlyph icon={item.icon} d={d} size={d.tap + 4} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: d.body, fontWeight: 600, color: DK.ink, letterSpacing: -0.2 }}>{t.name}</div>
                      <div style={{ fontSize: d.small, color: DK.sub, marginTop: 2 }}>{dueLabel(t.due)} · {t.mins} min</div>
                    </div>
                    <div style={dkDot({ size: d.tap })} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* notice */}
        <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', background: 'rgba(143,176,204,0.10)', border: '1px solid rgba(143,176,204,0.2)', borderRadius: d.radius - 4, padding: d.cardPad }}>
          <Icon name="megaphone" size={18} style={{ color: DK.slate, flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: DK.slate, letterSpacing: 0.5, textTransform: 'uppercase' }}>Safety notice</div>
            <div style={{ fontSize: d.body, fontWeight: 600, color: DK.ink, marginTop: 3 }}>Safety update for your dishwasher</div>
            <div style={{ fontSize: d.small + 0.5, color: DK.sub, marginTop: 3, lineHeight: 1.4 }}>Bosch issued a recall on some 300-series units.</div>
          </div>
        </div>
        <div style={{ height: 4 }} />
      </div>
      <TabBar tabs={tabs} current="home" onSelect={onTab} accent={DK.teal} tone="dark" />
    </Screen>
  );
}

// ── Items ────────────────────────────────────────────────────────────────────
function DarkItems({ d, tabs, onTab }) {
  const rooms = HH_ITEMS.reduce((a, it) => { (a[it.room] = a[it.room] || []).push(it); return a; }, {});
  return (
    <Screen bg={DK.bg}>
      <div style={{ padding: `12px ${d.pad}px 0`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: d.big, fontWeight: 800, color: DK.ink, letterSpacing: -0.7, margin: 0 }}>Items</h1>
        <div style={{ width: d.tap + 6, height: d.tap + 6, borderRadius: '50%', background: DK.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={20} strokeWidth={2.6} style={{ color: '#06120E' }} /></div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.gap + 4}px ${d.pad}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, ...dkCard(d), padding: '10px 13px', marginBottom: d.stack }}>
          <Icon name="search" size={16} style={{ color: DK.faint }} /><span style={{ fontSize: d.body, color: DK.faint }}>Search 5 items…</span>
        </div>
        {Object.entries(rooms).map(([room, items]) => (
          <div key={room} style={{ marginBottom: d.stack }}>
            <DkLabel d={d}>{room}</DkLabel>
            <div style={dkCard(d)}>
              {items.map((it, i) => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: i === items.length - 1 ? 'none' : `0.5px solid ${DK.line}` }}>
                  <div style={{ width: d.tap + 20, height: d.tap + 20, borderRadius: 12, background: 'linear-gradient(135deg,#1C2620,#243029)', color: DK.tealInk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={it.icon} size={(d.tap + 20) * 0.5} strokeWidth={1.8} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: d.body, fontWeight: 600, color: DK.ink, letterSpacing: -0.2 }}>{it.name}</div>
                    <div style={{ fontSize: d.small, color: DK.sub, marginTop: 2 }}>{it.brand} · {it.category}</div>
                  </div>
                  <Icon name="chevron-right" size={18} style={{ color: DK.faint }} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ height: d.pad }} />
      </div>
      <TabBar tabs={tabs} current="items" onSelect={onTab} accent={DK.teal} tone="dark" />
    </Screen>
  );
}

// ── Tasks ────────────────────────────────────────────────────────────────────
function DarkTasks({ d, tabs, onTab }) {
  const open = [...HH_TASKS].sort((a, b) => a.due - b.due);
  const today = open.filter((t) => t.due <= 0), week = open.filter((t) => t.due > 0);
  const Row = ({ t, last }) => {
    const item = hhItem(t.item);
    return <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: last ? 'none' : `0.5px solid ${DK.line}` }}>
      <div style={dkDot({ size: d.tap })} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: d.body, fontWeight: 600, color: DK.ink, letterSpacing: -0.2 }}>{t.name}</div>
        <div style={{ fontSize: d.small, color: DK.sub, marginTop: 2 }}>{item.name} · {t.mins} min</div>
      </div>
      <span style={{ fontSize: d.small, fontWeight: 700, color: t.due <= 0 ? DK.tealInk : DK.sub }}>{dueLabel(t.due)}</span>
    </div>;
  };
  const Grp = ({ title, items }) => (
    <div style={{ marginBottom: d.stack }}>
      <DkLabel d={d} right={<span style={{ fontSize: d.small, color: DK.sub }}>{items.length}</span>}>{title}</DkLabel>
      <div style={dkCard(d)}>{items.map((t, i) => <Row key={t.id} t={t} last={i === items.length - 1} />)}</div>
    </div>
  );
  return (
    <Screen bg={DK.bg}>
      <div style={{ padding: `12px ${d.pad}px 0`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: d.big, fontWeight: 800, color: DK.ink, letterSpacing: -0.7, margin: 0 }}>Tasks</h1>
        <span style={{ fontSize: d.small, color: DK.sub }}>{open.length} to do</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 0` }}>
        <Grp title="Today" items={today} />
        <Grp title="This week" items={week} />
        <div style={{ height: d.pad }} />
      </div>
      <TabBar tabs={tabs} current="tasks" onSelect={onTab} accent={DK.teal} tone="dark" />
    </Screen>
  );
}

// ── Ask (conversation) ───────────────────────────────────────────────────────
function DarkAsk({ d, tabs, onTab }) {
  const steps = ['Check the drain hose for kinks behind the unit.', 'Clean the filter at the bottom of the tub.', 'Run the rinse-only cycle to clear standing water.'];
  return (
    <Screen bg={DK.bg} padBottom={TAB_H + 64}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `4px ${d.pad - 6}px 8px`, borderBottom: `0.5px solid ${DK.line}` }}>
        <button onClick={() => onTab('home')} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: DK.tealInk, fontSize: d.body + 1, fontWeight: 600, padding: '6px 4px', cursor: 'pointer' }}><Icon name="chevron-left" size={22} strokeWidth={2.4} /> Ask</button>
        <Icon name="square-pen" size={19} style={{ color: DK.tealInk, marginRight: 8 }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 0`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        <div style={{ alignSelf: 'flex-end', maxWidth: '82%', background: DK.teal, color: '#06120E', borderRadius: '16px 16px 4px 16px', padding: '11px 15px', fontSize: d.body, fontWeight: 600 }}>Why won’t my dishwasher drain?</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <DkGlyph icon="sparkles" d={d} size={d.tap} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: d.body, color: DK.ink, lineHeight: 1.5 }}>Usually a blockage, not a fault. For your <strong>Bosch SHEM63W55N</strong>, try these in order:</div>
            {steps.map((s, i) => <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ width: 21, height: 21, borderRadius: 11, background: DK.tealSoft, color: DK.tealInk, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
              <span style={{ fontSize: d.body, color: DK.ink, lineHeight: 1.4 }}>{s}</span>
            </div>)}
            <div style={{ borderLeft: `3px solid ${DK.teal}`, background: DK.surface, borderRadius: '0 12px 12px 0', padding: '10px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}><Icon name="book-open" size={14} style={{ color: DK.tealInk }} /><span style={{ fontSize: 10.5, fontWeight: 700, color: DK.tealInk, letterSpacing: 0.5, textTransform: 'uppercase' }}>From your Bosch manual</span></div>
              <div style={{ fontSize: d.small + 1.5, color: DK.ink, lineHeight: 1.45, fontStyle: 'italic' }}>“Clean the filter and check the drain hose before requesting service.”</div>
              <div style={{ fontSize: d.small, color: DK.sub, marginTop: 4 }}>Dishwasher manual · p.31</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: TAB_H, padding: `10px ${d.pad}px`, background: 'rgba(13,20,17,0.92)', borderTop: `0.5px solid ${DK.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: DK.surfaceAlt, borderRadius: 14, padding: '10px 10px 10px 15px' }}>
          <span style={{ flex: 1, fontSize: d.body, color: DK.faint }}>Reply…</span>
          <div style={{ width: d.tap, height: d.tap, borderRadius: '50%', background: DK.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="arrow-up" size={16} strokeWidth={2.6} style={{ color: '#06120E' }} /></div>
        </div>
      </div>
      <TabBar tabs={tabs} current="ask" onSelect={onTab} accent={DK.teal} tone="dark" solidBg="rgba(13,20,17,0.9)" />
    </Screen>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────
function DarkSeg({ d, value, options, onChange }) {
  return <div style={{ display: 'flex', background: DK.surfaceAlt, borderRadius: 11, padding: 3, gap: 2 }}>
    {options.map((o) => { const on = o.value === value; return <button key={o.value} onClick={() => onChange && onChange(o.value)} style={{ flex: 1, border: 'none', borderRadius: 9, padding: '8px 4px', textAlign: 'center', background: on ? DK.raise : 'transparent', color: on ? DK.ink : DK.sub, fontSize: d.small + 1, fontWeight: on ? 700 : 500, cursor: 'pointer' }}>{o.label}</button>; })}
  </div>;
}
function DarkSettings({ d, tabs, onTab, appearance = 'dark', onAppearance }) {
  const Group = ({ title, children }) => <div style={{ marginBottom: d.stack }}>
    {title && <div style={{ fontSize: 12, fontWeight: 700, color: DK.sub, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2 }}>{title}</div>}
    <div style={dkCard(d)}>{children}</div>
  </div>;
  const Row = ({ label, value, last }) => <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: last ? 'none' : `0.5px solid ${DK.line}` }}>
    <span style={{ flex: 1, fontSize: d.body, color: DK.ink, fontWeight: 500 }}>{label}</span>
    {value && <span style={{ fontSize: d.body - 0.5, color: DK.sub }}>{value}</span>}
    <Icon name="chevron-right" size={18} style={{ color: DK.faint }} />
  </div>;
  return (
    <Screen bg={DK.bg}>
      <div style={{ padding: `12px ${d.pad}px 4px` }}><h1 style={{ fontSize: d.big, fontWeight: 800, color: DK.ink, letterSpacing: -0.7, margin: 0 }}>Settings</h1></div>
      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.gap + 4}px ${d.pad}px 0` }}>
        <div style={{ ...dkCard(d), padding: d.cardPad, display: 'flex', alignItems: 'center', gap: 14, marginBottom: d.stack }}>
          <div style={{ width: d.tap + 22, height: d.tap + 22, borderRadius: '50%', background: 'linear-gradient(135deg,#34B093,#2D9B82)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#06120E', fontSize: d.h2, fontWeight: 700 }}>B</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: d.h2, fontWeight: 700, color: DK.ink }}>Barb Powell</div><div style={{ fontSize: d.small + 1, color: DK.sub, marginTop: 1 }}>barb.powell@gmail.com</div></div>
          <Icon name="chevron-right" size={20} style={{ color: DK.faint }} />
        </div>
        <DkLabel d={d}>Appearance</DkLabel>
        <div style={{ ...dkCard(d), padding: d.cardPad, marginBottom: d.stack }}>
          <DarkSeg d={d} value={appearance} onChange={(v) => onAppearance && onAppearance(v)} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
        </div>
        <DkLabel d={d}>Homehub level</DkLabel>
        <div style={{ ...dkCard(d), padding: d.cardPad, marginBottom: d.stack }}>
          <DarkSeg d={d} value="standard" options={[{ value: 'simple', label: 'Simple' }, { value: 'standard', label: 'Standard' }, { value: 'advanced', label: 'Advanced' }]} />
          <div style={{ fontSize: d.small + 1, color: DK.sub, lineHeight: 1.45, marginTop: 11 }}>Adapts as your home grows. New tools appear when they’re useful.</div>
        </div>
        <Group title="Home">
          <Row label="My home" value="Maple Street" />
          <Row label="Members" value="2" last />
        </Group>
        <Group title="Notifications"><Row label="Notifications" value="On" last /></Group>
        <div style={{ height: d.pad }} />
      </div>
      <TabBar tabs={tabs} current="settings" onSelect={onTab} accent={DK.teal} tone="dark" />
    </Screen>
  );
}

// ── Dark shell ───────────────────────────────────────────────────────────────
function DarkShell({ d, startTab = 'home' }) {
  const [tab, setTab] = useDkS(startTab);
  const tabs = TABS_FULL;
  const P = { d, tabs, onTab: setTab };
  if (tab === 'items') return <DarkItems {...P} />;
  if (tab === 'tasks') return <DarkTasks {...P} />;
  if (tab === 'ask') return <DarkAsk {...P} />;
  if (tab === 'settings') return <DarkSettings {...P} />;
  return <DarkHome {...P} />;
}

Object.assign(window, { DK, DarkHome, DarkItems, DarkTasks, DarkAsk, DarkSettings, DarkShell });
