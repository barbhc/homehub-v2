// ── Homehub · Desktop flows B — Landing, States, Settings managers ───────────

const { useState: useFlB } = React;

// ── Marketing landing page ───────────────────────────────────────────────────
function LandingPreview({ T }) {
  // a calm, static mini-dashboard that makes the product feel real
  const hero = HH_TASKS[0]; const item = hhItem(hero.item);
  return (
    <div style={{ background: T.bg, borderRadius: 14, border: `1px solid ${T.line}`, boxShadow: T.shadowMd, overflow: 'hidden', fontFamily: DT_FONT }}>
      <div style={{ height: 46, borderBottom: `1px solid ${T.line}`, background: T.surface, display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px' }}>
        <Wordmark T={T} size={20} />
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {['Home', 'Items', 'Tasks', 'Ask'].map((l, i) => <span key={l} style={{ fontSize: 12, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? T.teal : T.sub, padding: '5px 10px', borderRadius: 7, background: i === 0 ? T.tealWash : 'transparent' }}>{l}</span>)}
        </div>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.teal, textTransform: 'uppercase', letterSpacing: 0.5 }}>{hhToday()}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.ink, letterSpacing: -0.5, margin: '3px 0 14px' }}>{hhGreeting()}, Barb</div>
        <Card T={T} pad={16} raised>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><TierChip T={T} tier={hero.tier} /><span style={{ fontSize: 12, fontWeight: 700, color: T.teal }}>{dueLabel(hero.due)} · {hero.mins} min</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <Glyph T={T} icon={item.icon} size={44} radius={12} />
            <div><div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{hero.name}</div><div style={{ fontSize: 12, color: T.sub }}>{item.name} · {item.room}</div></div>
          </div>
        </Card>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          {HH_TASKS.slice(1).map((t) => { const it = hhItem(t.item); return (
            <div key={t.id} style={{ flex: 1, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 12 }}>
              <Glyph T={T} icon={it.icon} size={30} radius={8} />
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, marginTop: 8 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{dueLabel(t.due)}</div>
            </div>
          ); })}
        </div>
      </div>
    </div>
  );
}

const LAND_FEATURES = [
  { icon: 'package', title: 'Every item, organized', body: 'Appliances and fixtures with their models, manuals, warranties and history — by room or type.' },
  { icon: 'list-checks', title: 'Upkeep that finds you', body: 'Timely, tailored tasks — never a generic checklist. Calm tiers tell you what truly matters.' },
  { icon: 'sparkles', title: 'Answers from your manuals', body: 'Ask anything about your home. Answers cite the right manual and save back to the item.' },
  { icon: 'shield-check', title: 'Coverage at a glance', body: 'See what’s under warranty, what’s expiring, and recall notices — surfaced calmly, never alarmist.' },
  { icon: 'spray-can', title: 'Guided cleaning', body: 'Pick rooms and a time budget; Homehub sizes a checklist that fits and walks you through it.' },
  { icon: 'wrench', title: 'Your trusted pros', body: 'Keep service providers on hand, with the items they’ve worked on and a tidy job history.' },
];
function DesktopLanding({ T, d }) {
  return (
    <div style={{ background: T.surface, fontFamily: DT_FONT, color: T.ink }}>
      {/* nav */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '20px 48px', maxWidth: 1180, margin: '0 auto' }}>
        <Wordmark T={T} size={28} />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {['Features', 'How it works', 'Pricing'].map((l) => <span key={l} style={{ fontSize: 14, color: T.sub, fontWeight: 500 }}>{l}</span>)}
          <Btn T={T} kind="ghost" size="sm">Sign in</Btn>
          <Btn T={T} size="sm">Get started</Btn>
        </div>
      </div>

      {/* hero */}
      <div style={{ background: T.bg }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 48px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: T.teal, background: T.tealWash, padding: '6px 12px', borderRadius: 99 }}><Icon name="sparkles" size={14} /> Calm home management</div>
            <h1 style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05, margin: '18px 0 0' }}>Your home,<br />managed effortlessly.</h1>
            <p style={{ fontSize: 17, color: T.sub, lineHeight: 1.6, margin: '18px 0 28px', maxWidth: 440 }}>Track what you own, never miss the upkeep that matters, and ask any question — grounded in your own manuals.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <Btn T={T} size="lg" icon="arrow-right">Start your home free</Btn>
              <Btn T={T} kind="ghost" size="lg" icon="play">See how it works</Btn>
            </div>
          </div>
          <LandingPreview T={T} />
        </div>
      </div>

      {/* features */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 48px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.8, margin: 0 }}>Everything your home needs</h2>
          <p style={{ fontSize: 16, color: T.sub, marginTop: 10 }}>One calm place — that grows only as fast as you do.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
          {LAND_FEATURES.map((f) => (
            <Card T={T} d={d} key={f.title} pad={22}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: T.tealWash, display: 'grid', placeItems: 'center', marginBottom: 14 }}><Icon name={f.icon} size={22} style={{ color: T.teal }} /></div>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3 }}>{f.title}</div>
              <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55, marginTop: 7 }}>{f.body}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* how it works */}
      <div style={{ background: T.bg }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 48px' }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.8, margin: '0 0 40px', textAlign: 'center' }}>Up and running in minutes</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
            {[['1', 'Add your items', 'Scan a label or type a model — manuals, specs and warranty fill in automatically.'], ['2', 'Get your plan', 'Homehub builds a tailored upkeep schedule, calmest setup first.'], ['3', 'Ask anything', 'Questions answered from your own manuals, saved right back to the item.']].map(([n, t, b]) => (
              <div key={n}>
                <div style={{ width: 40, height: 40, borderRadius: 20, background: T.teal, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 17, fontWeight: 800, fontFamily: DT_MONO }}>{n}</div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, marginTop: 14 }}>{t}</div>
                <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.55, marginTop: 7 }}>{b}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 48px' }}>
        <div style={{ background: T.dark ? T.raise : '#0E2E27', borderRadius: 24, padding: '56px 48px', textAlign: 'center', color: '#fff' }}>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.8, margin: 0 }}>Start your home today</h2>
          <p style={{ fontSize: 16.5, color: 'rgba(255,255,255,0.72)', margin: '14px auto 26px', maxWidth: 640, lineHeight: 1.6 }}>Free to set up. No credit card. Manage your home with ease.</p>
          <Btn T={T} size="lg" icon="arrow-right" style={{ background: '#fff', color: '#0E2E27' }}>Create your free account</Btn>
        </div>
      </div>
    </div>
  );
}

// ── States: loading skeleton, error, empty ───────────────────────────────────
function Shimmer({ T, w, h, r = 8, style }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: T.dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)', ...style }} />;
}
function DesktopLoading({ T, d }) {
  return (
    <div>
      <Shimmer T={T} w={220} h={30} style={{ marginBottom: 22 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.85fr) minmax(280px,1fr)', gap: 22, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[0, 1, 2, 3].map((i) => <Card T={T} d={d} key={i} pad={15}><Shimmer T={T} w={70} h={11} /><Shimmer T={T} w={44} h={26} style={{ marginTop: 10 }} /></Card>)}
          </div>
          <Card T={T} d={d} pad={22} raised>
            <Shimmer T={T} w={100} h={20} r={99} />
            <div style={{ display: 'flex', gap: 14, marginTop: 16, alignItems: 'center' }}><Shimmer T={T} w={56} h={56} r={15} /><div style={{ flex: 1 }}><Shimmer T={T} w="60%" h={20} /><Shimmer T={T} w="40%" h={13} style={{ marginTop: 8 }} /></div></div>
          </Card>
          {[0, 1, 2].map((i) => <Card T={T} d={d} key={i}><div style={{ display: 'flex', gap: 13, alignItems: 'center' }}><Shimmer T={T} w={36} h={36} r={10} /><div style={{ flex: 1 }}><Shimmer T={T} w="50%" h={15} /><Shimmer T={T} w="30%" h={12} style={{ marginTop: 7 }} /></div></div></Card>)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card T={T} d={d}><Shimmer T={T} w={90} h={13} /><Shimmer T={T} w="100%" h={48} style={{ marginTop: 14 }} /></Card>
          {[0, 1].map((i) => <Card T={T} d={d} key={i}><Shimmer T={T} w="70%" h={15} /><Shimmer T={T} w="100%" h={12} style={{ marginTop: 9 }} /><Shimmer T={T} w="85%" h={12} style={{ marginTop: 6 }} /></Card>)}
        </div>
      </div>
    </div>
  );
}
function DesktopError({ T, d, onRetry }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: 460 }}>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: T.surface2, display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}><Icon name="cloud-off" size={30} style={{ color: T.slate }} /></div>
        <h2 style={{ fontSize: 21, fontWeight: 800, color: T.ink, margin: 0 }}>We couldn't load your home</h2>
        <p style={{ fontSize: 14.5, color: T.sub, lineHeight: 1.55, margin: '10px 0 20px' }}>Something hiccuped on our side. Your data is safe — give it another try.</p>
        <Btn T={T} icon="refresh-cw" onClick={onRetry}>Try again</Btn>
      </div>
    </div>
  );
}
function DesktopEmpty({ T, d, onAdd }) {
  return (
    <div>
      <h1 style={{ fontSize: 30, fontWeight: 800, color: T.ink, letterSpacing: -0.8, margin: '0 0 22px' }}>{hhGreeting()}, Barb</h1>
      <Card T={T} d={d} pad={48} raised style={{ textAlign: 'center' }}>
        <div style={{ width: 76, height: 76, borderRadius: 22, background: T.tealWash, display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}><Icon name="package-plus" size={36} style={{ color: T.teal }} /></div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: T.ink, letterSpacing: -0.5, margin: 0 }}>Let's add your first item</h2>
        <p style={{ fontSize: 15, color: T.sub, lineHeight: 1.6, maxWidth: 440, margin: '12px auto 24px' }}>Start with something big — your furnace, fridge, or water heater. Homehub pulls in the manual, warranty and upkeep automatically.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Btn T={T} size="lg" icon="scan-line" onClick={onAdd}>Scan a label</Btn>
          <Btn T={T} kind="ghost" size="lg" icon="keyboard">Type a model</Btn>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 22 }}>
        {[['list-checks', 'Tailored upkeep', 'Only the tasks your home actually needs.'], ['sparkles', 'Ask anything', 'Answers grounded in your manuals.'], ['shield-check', 'Stay covered', 'Warranties and recalls, surfaced calmly.']].map(([ic, t, b]) => (
          <Card T={T} d={d} key={t} pad={18}>
            <Icon name={ic} size={20} style={{ color: T.teal }} />
            <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, marginTop: 10 }}>{t}</div>
            <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5, marginTop: 4 }}>{b}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Settings managers: Rooms + Custom tasks ──────────────────────────────────
function DesktopRoomsManager({ T, d }) {
  const rooms = [...new Set(HH_ITEMS.map((i) => i.room))].concat(['Garage', 'Outdoor']);
  return (
    <div style={{ maxWidth: 720 }}>
      <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: T.sub, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: '2px 0', marginBottom: 14 }}><Icon name="chevron-left" size={17} /> Settings</button>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: T.ink, letterSpacing: -0.6, margin: 0 }}>Rooms</h1>
        <Btn T={T} icon="plus" size="sm">Add room</Btn>
      </div>
      <Card T={T} d={d} pad={0}>
        {rooms.map((r, i) => {
          const n = HH_ITEMS.filter((it) => it.room === r).length;
          return (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderTop: i ? `1px solid ${T.line}` : 'none' }}>
              <Glyph T={T} icon="door-open" size={34} radius={9} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{r}</div>
                <div style={{ fontSize: 12.5, color: T.sub }}>{n} item{n === 1 ? '' : 's'}</div>
              </div>
              <IconBtn T={T} name="pencil" size={32} title="Rename" />
              <IconBtn T={T} name="trash-2" size={32} title="Delete" />
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// Shares the unified upkeep model (HH_UPKEEP from hh-advanced.jsx) so desktop
// and mobile, Home and Settings, all read the same tasks.
const CUSTOM_TASKS = [
  ...HH_UPKEEP.map((t) => ({ id: t.id, name: t.title, area: t.area, freq: upSched(t), icon: upCat(t.cat).icon, recur: t.recur, season: t.season })),
  { id: 'ct-mow', name: 'Mow & edge the lawn', area: 'Yard', freq: 'Weekly', icon: 'leaf', recur: 'rolling' },
];
const STARTER_SUGGESTIONS = HH_UPKEEP_SUGGEST.map((s) => ({ name: s.title, area: s.area, freq: upSched(s), icon: upCat(s.cat).icon, recur: s.recur }));
function DesktopCustomTasks({ T, d, view: initView = 'manager' }) {
  const [view, setView] = useFlB(initView);
  return (
    <div style={{ maxWidth: 820 }}>
      <button style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: T.sub, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: '2px 0', marginBottom: 14 }}><Icon name="chevron-left" size={17} /> Settings</button>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: T.ink, letterSpacing: -0.6, margin: 0 }}>Custom tasks</h1>
          <div style={{ fontSize: 13.5, color: T.sub, marginTop: 5 }}>Jobs that aren't tied to an appliance — targeted by area, not item.</div>
        </div>
        <div style={{ display: 'inline-flex', border: `1px solid ${T.line2}`, borderRadius: 9, overflow: 'hidden' }}>
          {[['manager', 'Manage'], ['planner', 'Starter plan']].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ padding: '8px 16px', border: 'none', cursor: 'pointer', background: view === k ? T.teal : 'transparent', color: view === k ? '#fff' : T.sub, fontWeight: 600, fontSize: 13, fontFamily: 'inherit' }}>{l}</button>
          ))}
        </div>
      </div>

      {view === 'manager' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card T={T} d={d} pad={0}>
            <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Your custom tasks</span>
              <Btn T={T} kind="soft" size="sm" icon="plus">New</Btn>
            </div>
            {CUSTOM_TASKS.map((t, i) => (
              <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderTop: `1px solid ${T.line}` }}>
                <Glyph T={T} icon={t.icon} size={36} radius={9} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{t.name}</div>
                  <div style={{ fontSize: 12.5, color: T.sub, marginTop: 1 }}>{t.area} · {t.freq}</div>
                </div>
                {t.recur === 'seasonal'
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: T.gold, background: T.goldSoft, padding: '4px 9px', borderRadius: 6 }}><Icon name="leaf" size={12} /> Seasonal</span>
                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: T.slate, background: T.slateSoft, padding: '4px 9px', borderRadius: 6 }}><Icon name="repeat" size={12} /> {t.area}</span>}
                <IconBtn T={T} name="pencil" size={32} />
              </div>
            ))}
          </Card>
          <div>
            <SectionLabel T={T}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="sparkles" size={13} style={{ color: T.teal }} /> Suggested for your home</span></SectionLabel>
            <Card T={T} d={d} pad={0}>
              {STARTER_SUGGESTIONS.map((s, i) => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderTop: i ? `1px solid ${T.line}` : 'none' }}>
                  <Glyph T={T} icon={s.icon} size={34} radius={9} tone="grey" />
                  <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{s.name}</div><div style={{ fontSize: 12, color: T.sub }}>{s.area}</div></div>
                  <Btn T={T} kind="ghost" size="sm" icon="plus">Add</Btn>
                </div>
              ))}
            </Card>
          </div>
        </div>
      ) : (
        <Card T={T} d={d} pad={28}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: T.tealWash, display: 'grid', placeItems: 'center', marginBottom: 16 }}><Icon name="clipboard-list" size={26} style={{ color: T.teal }} /></div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: T.ink, letterSpacing: -0.4, margin: 0 }}>Build a starter plan</h2>
          <p style={{ fontSize: 14, color: T.sub, lineHeight: 1.55, margin: '8px 0 20px', maxWidth: 460 }}>Based on your home profile — single-family, built 1998, owned — here's a set of recurring jobs most homes like yours need. Add them all, or pick and choose.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            {CUSTOM_TASKS.concat(STARTER_SUGGESTIONS).map((t) => (
              <label key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 13, borderRadius: 12, border: `1px solid ${T.line}`, cursor: 'pointer' }}>
                <CheckBox T={T} done size={20} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{t.name}</div><div style={{ fontSize: 11.5, color: T.sub }}>{t.freq} · {t.area}</div></div>
                {t.recur === 'seasonal' && <Icon name="leaf" size={14} style={{ color: T.gold, flexShrink: 0 }} />}
              </label>
            ))}
          </div>
          <Btn T={T} size="lg" icon="check" style={{ marginTop: 20 }}>Add {CUSTOM_TASKS.length + STARTER_SUGGESTIONS.length} tasks to my plan</Btn>
        </Card>
      )}
    </div>
  );
}

Object.assign(window, { DesktopLanding, LandingPreview, DesktopLoading, DesktopError, DesktopEmpty, DesktopRoomsManager, DesktopCustomTasks });
