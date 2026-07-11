// ── Homehub · Desktop screens C — Warranties, Clean, Providers ───────────────

const { useState: useScC } = React;

// ── Warranties ───────────────────────────────────────────────────────────────
function DesktopWarranties({ T, d, onOpenItem }) {
  const withW = HH_ITEMS.filter((i) => i.warranty);
  const soon = withW.filter((i) => i.warranty.active && i.warranty.soon);
  const active = withW.filter((i) => i.warranty.active && !i.warranty.soon);
  const lapsed = withW.filter((i) => !i.warranty.active);

  const Group = ({ title, tone, items, hint }) => items.length === 0 ? null : (
    <div>
      <SectionLabel T={T} right={<span style={{ fontSize: 12, color: T.faint, fontFamily: DT_MONO }}>{items.length}</span>}>{title}</SectionLabel>
      <Card T={T} d={d} pad={0}>
        {items.map((it, i) => (
          <button key={it.id} onClick={() => onOpenItem && onOpenItem(it.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderTop: i ? `1px solid ${T.line}` : 'none', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <ItemThumb T={T} icon={it.icon} size={42} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{it.name}</div>
              <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{it.brand} · {it.room}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: tone }}>{it.warranty.ends}</div>
              <div style={{ fontSize: 11.5, color: T.faint }}>{hint}</div>
            </div>
            <Icon name="chevron-right" size={17} style={{ color: T.faint }} />
          </button>
        ))}
      </Card>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 27, fontWeight: 800, color: T.ink, letterSpacing: -0.6, margin: 0 }}>Warranties</h1>
        <div style={{ fontSize: 13.5, color: T.sub, marginTop: 6 }}>Coverage across your whole home, at a glance.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        {[{ k: 'Expiring soon', v: soon.length, c: T.gold }, { k: 'Active', v: active.length, c: T.teal }, { k: 'Lapsed', v: lapsed.length, c: T.faint }].map((s) => (
          <Card T={T} d={d} key={s.k} pad={16}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, letterSpacing: 0.4, textTransform: 'uppercase' }}>{s.k}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: s.c, letterSpacing: -1, marginTop: 6, fontFamily: DT_MONO }}>{s.v}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Group title="Expiring soon" tone={T.gold} items={soon} hint="worth a look" />
        <Group title="Active coverage" tone={T.teal} items={active} hint="covered" />
        <Group title="Lapsed" tone={T.faint} items={lapsed} hint="expired" />
      </div>
    </div>
  );
}

// ── Clean ────────────────────────────────────────────────────────────────────
// Faithful desktop port of the mobile Clean flow: hub → guide reader →
// guided session (setup · run · summary). Reuses CL_GUIDES / CL_TASKS data.
const DT_CL_ROOMS = ['Kitchen', 'Bathroom', 'Laundry', 'Living room'];
const DT_CL_BUDGETS = [
  { id: 15, label: '15 min', note: 'Quick tidy' },
  { id: 30, label: '30 min', note: 'Reset' },
  { id: 60, label: '1 hour', note: 'Thorough' },
  { id: 0, label: 'No limit', note: 'Deep clean' },
];
function dtSessionTasks(rooms, budget) {
  const pool = (typeof CL_TASKS !== 'undefined' ? CL_TASKS : []).filter((t) => rooms.includes(t.room)).sort((a, b) => a.mins - b.mins);
  if (!budget) return pool;
  const out = []; let total = 0;
  for (const t of pool) { if (total + t.mins <= budget) { out.push(t); total += t.mins; } }
  return out.length ? out : pool.slice(0, 1);
}

function DTCaution({ T, text }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: T.goldSoft, border: `1px solid ${T.line}`, borderRadius: 12, padding: '11px 13px' }}>
      <Icon name="triangle-alert" size={16} style={{ color: T.gold, marginTop: 1, flexShrink: 0 }} />
      <span style={{ fontSize: 13.5, color: T.dark ? T.sub : '#6B5526', lineHeight: 1.45, textWrap: 'pretty' }}>{text}</span>
    </div>
  );
}

// ── Clean connector ──────────────────────────────────────────────────────────
function DesktopClean({ T, d }) {
  const [view, setView] = useScC({ type: 'hub' });
  const [saved, setSaved] = useScC(null);
  const guides = typeof CL_GUIDES !== 'undefined' ? CL_GUIDES : [];
  const clGuideById = (id) => guides.find((g) => g.id === id) || guides[0];

  if (view.type === 'guide') {
    return <DesktopCleanGuide T={T} d={d} guide={clGuideById(view.id)} onBack={() => setView({ type: 'hub' })} onAddToSession={() => { setSaved(null); setView({ type: 'session' }); }} />;
  }
  if (view.type === 'session') {
    const r = view.resume ? saved : null;
    return <DesktopCleanSession T={T} d={d}
      startStep={r ? 'run' : 'setup'}
      seed={r}
      onClose={() => setView({ type: 'hub' })}
      onExit={(p) => { setSaved(p); setView({ type: 'hub' }); }}
      onDone={() => { setSaved(null); setView({ type: 'hub' }); }} />;
  }
  return <DesktopCleanHub T={T} d={d}
    resume={saved}
    onResume={() => setView({ type: 'session', resume: true })}
    onOpenGuide={(id) => setView({ type: 'guide', id })}
    onStartSession={() => { setSaved(null); setView({ type: 'session' }); }} />;
}

// ── Hub ──────────────────────────────────────────────────────────────────────
function DesktopCleanHub({ T, d, onOpenGuide, onStartSession, resume, onResume }) {
  const tasks = typeof CL_TASKS !== 'undefined' ? CL_TASKS : [];
  const guides = typeof CL_GUIDES !== 'undefined' ? CL_GUIDES : [];
  const dueSoon = tasks.filter((t) => t.due <= 4).sort((a, b) => a.due - b.due).slice(0, 4);
  const resuming = resume && resume.total > 0;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800, color: T.ink, letterSpacing: -0.6, margin: 0 }}>Clean</h1>
          <div style={{ fontSize: 13.5, color: T.sub, marginTop: 6 }}>A calm way to keep things fresh — guided sessions and step-by-step guides.</div>
        </div>
        <Btn T={T} icon={resuming ? 'rotate-ccw' : 'spray-can'} onClick={resuming ? onResume : onStartSession}>{resuming ? 'Resume session' : 'Start a session'}</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(260px,1fr)', gap: 22, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* session starter / resume */}
          <button onClick={resuming ? onResume : onStartSession} style={{ width: '100%', textAlign: 'left', border: 'none', borderRadius: 18, padding: 24, cursor: 'pointer', background: 'linear-gradient(150deg,#1B6B5A,#2D9B82)', color: '#fff', boxShadow: T.shadowMd }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 54, height: 54, borderRadius: 15, background: 'rgba(255,255,255,0.16)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={resuming ? 'rotate-ccw' : 'spray-can'} size={26} style={{ color: '#fff' }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {resuming && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', marginBottom: 3 }}>In progress</div>}
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.3 }}>{resuming ? 'Pick up where you left off' : 'Start cleaning'}</div>
                <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.82)', marginTop: 3 }}>{resuming ? `${resume.done} of ${resume.total} done · ${resume.rooms.join(' · ')}` : 'Pick rooms and a time budget — we’ll size a checklist to fit.'}</div>
              </div>
              <Icon name="arrow-right" size={22} style={{ color: 'rgba(255,255,255,0.9)' }} />
            </div>
          </button>
          {resuming && <button onClick={onStartSession} style={{ alignSelf: 'center', border: 'none', background: 'transparent', color: T.teal, fontWeight: 700, fontSize: 13, cursor: 'pointer', marginTop: -8 }}>Start a new session instead</button>}

          {/* guides */}
          <div>
            <SectionLabel T={T} right={<span style={{ fontSize: 12.5, color: T.sub, fontWeight: 600 }}>{guides.length} guides</span>}>Cleaning guides</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 14 }}>
              {guides.map((g) => (
                <Card T={T} d={d} key={g.id} pad={16} onClick={() => onOpenGuide(g.id)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 11 }}>
                  <Glyph T={T} icon={g.icon} size={42} radius={12} />
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, letterSpacing: -0.2, lineHeight: 1.2, textWrap: 'balance' }}>{g.name}</div>
                  <div style={{ fontSize: 12.5, color: T.sub, marginTop: 'auto' }}>{g.mins} min · {g.freq}</div>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* this week */}
        <div>
          <SectionLabel T={T}>This week</SectionLabel>
          <Card T={T} d={d} pad={0}>
            {dueSoon.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderTop: i ? `1px solid ${T.line}` : 'none' }}>
                <CheckBox T={T} done={false} size={20} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: T.sub, marginTop: 1 }}>{t.room} · {t.mins} min</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: t.due === 0 ? T.teal : T.sub, whiteSpace: 'nowrap' }}>{dueLabel(t.due)}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Guide reader ─────────────────────────────────────────────────────────────
function DesktopCleanGuide({ T, d, guide, onBack, onAddToSession }) {
  const g = guide;
  return (
    <div style={{ maxWidth: 920 }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: T.sub, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: '2px 0', marginBottom: 16 }}>
        <Icon name="chevron-left" size={17} /> Clean
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <Glyph T={T} icon={g.icon} size={58} radius={16} />
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: T.tealWash, color: T.teal, borderRadius: 99, padding: '4px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}><Icon name="repeat" size={11} /> {g.freq}</span>
          <h1 style={{ fontSize: 27, fontWeight: 800, color: T.ink, letterSpacing: -0.6, margin: '8px 0 0' }}>{g.name}</h1>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 18, margin: '14px 0 22px', fontSize: 13.5, color: T.sub }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="clock" size={15} /> {g.mins} min</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="map-pin" size={15} /> {g.room}</span>
      </div>

      <Card T={T} d={d} pad={24} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <WhyNote T={T} text={g.why} />
        {g.cautions && g.cautions.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 9 }}>Before you start</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {g.cautions.map((c) => <DTCaution key={c} T={T} text={c} />)}
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: g.manual ? '1.4fr 1fr' : '1fr', gap: 28, alignItems: 'start' }}>
          <StepsList T={T} steps={g.steps} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SuppliesRow T={T} supplies={g.supplies} />
            <ManualSnippet T={T} manual={g.manual} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, borderTop: `1px solid ${T.line}`, paddingTop: 18 }}>
          <Btn T={T} icon="check" size="lg" onClick={onBack}>Mark done</Btn>
          <Btn T={T} kind="ghost" size="lg" icon="plus" onClick={onAddToSession}>Add to session</Btn>
        </div>
      </Card>
    </div>
  );
}

// ── Guided session: setup → run → summary ────────────────────────────────────
function DesktopCleanSession({ T, d, startStep = 'setup', seed, onClose, onExit, onDone }) {
  const [step, setStep] = useScC(startStep);
  const [rooms, setRooms] = useScC(seed ? seed.rooms : ['Kitchen']);
  const [budget, setBudget] = useScC(seed ? seed.budget : 30);
  const [doneIds, setDoneIds] = useScC(seed ? seed.doneIds : []);
  const [skippedIds, setSkippedIds] = useScC(seed ? seed.skippedIds : []);
  const [openId, setOpenId] = useScC(null);

  const baseTasks = dtSessionTasks(rooms.length ? rooms : DT_CL_ROOMS, budget);
  const byId = (typeof CL_TASKS !== 'undefined' ? CL_TASKS : []).reduce((a, t) => { a[t.id] = t; return a; }, {});
  const activeTasks = baseTasks.filter((t) => !skippedIds.includes(t.id));
  const skippedTasks = skippedIds.map((id) => byId[id]).filter(Boolean);
  const doneCount = activeTasks.filter((t) => doneIds.includes(t.id)).length;
  const minsLeft = activeTasks.filter((t) => !doneIds.includes(t.id)).reduce((a, t) => a + t.mins, 0);
  const minsDone = activeTasks.filter((t) => doneIds.includes(t.id)).reduce((a, t) => a + t.mins, 0);
  const roomsTouched = [...new Set(activeTasks.filter((t) => doneIds.includes(t.id)).map((t) => t.room))];
  const remaining = [...activeTasks.filter((t) => !doneIds.includes(t.id)), ...skippedTasks];
  const estTotal = baseTasks.reduce((a, t) => a + t.mins, 0);
  const pct = activeTasks.length ? Math.round(doneCount / activeTasks.length * 100) : 0;

  const toggleRoom = (r) => setRooms((x) => x.includes(r) ? x.filter((y) => y !== r) : [...x, r]);
  const toggleDone = (id) => setDoneIds((x) => x.includes(id) ? x.filter((y) => y !== id) : [...x, id]);
  const skip = (id) => { setSkippedIds([...skippedIds, id]); setOpenId(null); };
  const unskip = (id) => setSkippedIds(skippedIds.filter((x) => x !== id));
  const exit = () => { onExit ? onExit({ rooms: rooms.length ? rooms : DT_CL_ROOMS, budget, doneIds, skippedIds, done: doneCount, total: activeTasks.length }) : onClose(); };

  // ── SETUP ──
  if (step === 'setup') {
    const allOn = rooms.length === DT_CL_ROOMS.length;
    return (
      <div style={{ maxWidth: 720 }}>
        <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: T.sub, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: '2px 0', marginBottom: 16 }}><Icon name="x" size={16} /> Cancel</button>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: T.ink, letterSpacing: -0.6, margin: '0 0 22px' }}>Start a cleaning session</h1>

        <SectionLabel T={T}>What are you cleaning?</SectionLabel>
        <button onClick={() => setRooms(allOn ? [] : [...DT_CL_ROOMS])} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: allOn ? T.tealWash2 : T.surface, border: `1.5px solid ${allOn ? T.teal : T.line}`, borderRadius: 14, padding: 16, marginBottom: 12, cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: allOn ? T.teal : T.tealWash, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="house" size={20} style={{ color: allOn ? '#fff' : T.teal }} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>Whole home</div>
            <div style={{ fontSize: 12.5, color: T.sub, marginTop: 1 }}>Every room</div>
          </div>
          {allOn && <Icon name="check" size={18} strokeWidth={3} style={{ color: T.teal }} />}
        </button>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 26 }}>
          {DT_CL_ROOMS.map((r) => <Pill T={T} key={r} active={rooms.includes(r)} onClick={() => toggleRoom(r)}>{r}</Pill>)}
        </div>

        <SectionLabel T={T}>How much time?</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 26 }}>
          {DT_CL_BUDGETS.map((b) => {
            const on = budget === b.id;
            return (
              <button key={b.id} onClick={() => setBudget(b.id)} style={{ textAlign: 'left', background: on ? T.tealWash2 : T.surface, border: `1.5px solid ${on ? T.teal : T.line}`, borderRadius: 14, padding: 16, cursor: 'pointer' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: on ? T.teal : T.ink, letterSpacing: -0.4 }}>{b.label}</div>
                <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>{b.note}</div>
              </button>
            );
          })}
        </div>

        <Card T={T} d={d} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 13.5, color: T.sub }}>{rooms.length ? <span><strong style={{ color: T.ink }}>{baseTasks.length} task{baseTasks.length === 1 ? '' : 's'}</strong> lined up · about {estTotal} min</span> : 'Pick at least one room'}</span>
          <Btn T={T} icon="spray-can" size="lg" onClick={() => rooms.length && setStep('run')} style={rooms.length ? {} : { opacity: 0.5, pointerEvents: 'none' }}>Build my checklist</Btn>
        </Card>
      </div>
    );
  }

  // ── SUMMARY ──
  if (step === 'summary') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '8px 0 24px' }}>
          <div style={{ width: 78, height: 78, borderRadius: '50%', background: T.tealWash, display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}><Icon name="sparkles" size={38} style={{ color: T.teal }} /></div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: T.ink, letterSpacing: -0.6, margin: 0 }}>Nice work, Barb</h1>
          <p style={{ fontSize: 15, color: T.sub, margin: '8px auto 0', lineHeight: 1.45, maxWidth: 320 }}>{doneCount > 0 ? `The ${roomsTouched.join(' & ')} ${roomsTouched.length > 1 ? 'are' : 'is'} looking fresher.` : 'Every little bit helps — pick it back up anytime.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
          {[{ n: doneCount, l: 'tasks done' }, { n: minsDone, l: 'minutes' }, { n: roomsTouched.length, l: roomsTouched.length === 1 ? 'room' : 'rooms' }].map((s) => (
            <Card T={T} d={d} key={s.l} pad={16} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: T.teal, letterSpacing: -0.5, fontFamily: DT_MONO }}>{s.n}</div>
              <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{s.l}</div>
            </Card>
          ))}
        </div>
        {remaining.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <SectionLabel T={T}>Picked up later · {remaining.length}</SectionLabel>
            <Card T={T} d={d} pad={0}>
              {remaining.map((t, i) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderTop: i ? `1px solid ${T.line}` : 'none' }}>
                  <Icon name={skippedIds.includes(t.id) ? 'circle-slash' : 'circle'} size={18} style={{ color: T.faint, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13.5, color: T.ink }}>{t.name}</span>
                  <span style={{ fontSize: 12.5, color: T.sub }}>{t.room}</span>
                </div>
              ))}
            </Card>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'center' }}><Btn T={T} size="lg" onClick={onDone}>Done</Btn></div>
      </div>
    );
  }

  // ── RUN ──
  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <button onClick={exit} title="Save & pick up later" style={{ border: 'none', background: 'transparent', color: T.sub, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13.5, fontWeight: 600, padding: '2px 0' }}><Icon name="chevron-left" size={17} /> Save & exit</button>
        <div style={{ flex: 1 }} />
        <Btn T={T} kind="soft" size="sm" icon="check" onClick={() => setStep('summary')}>Finish</Btn>
      </div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: T.ink, letterSpacing: -0.5, margin: 0 }}>{doneCount} of {activeTasks.length} done</h1>
          <span style={{ fontSize: 13.5, color: T.sub, fontWeight: 600 }}>{minsLeft > 0 ? `About ${minsLeft} min left` : 'All caught up'}</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: T.line, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: T.teal, borderRadius: 4, transition: 'width .3s ease' }} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {activeTasks.map((t) => {
          const on = doneIds.includes(t.id);
          const open = openId === t.id;
          return (
            <Card T={T} d={d} key={t.id} pad={0} style={{ opacity: on ? 0.72 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px' }}>
                <button onClick={() => toggleDone(t.id)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex' }}><CheckBox T={T} done={on} size={22} /></button>
                <button onClick={() => setOpenId(open ? null : t.id)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: on ? T.sub : T.ink, letterSpacing: -0.2, textDecoration: on ? 'line-through' : 'none' }}>{t.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 12.5, color: T.sub }}>{t.room} · {t.mins} min</span>
                      {t.caution && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600, color: T.gold }}><Icon name="triangle-alert" size={11} /> Care</span>}
                    </div>
                  </div>
                  <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} style={{ color: T.faint }} />
                </button>
              </div>
              {open && (
                <div style={{ borderTop: `1px solid ${T.line}`, padding: 16, background: T.surface2, display: 'flex', flexDirection: 'column', gap: 13 }}>
                  {t.caution && <DTCaution T={T} text={t.caution} />}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, columnGap: 28 }}>
                    {t.steps.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ width: 20, height: 20, borderRadius: 10, flexShrink: 0, marginTop: 1, background: T.tealWash, color: T.teal, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                        <span style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.4, textWrap: 'pretty' }}>{s}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Btn T={T} icon="check" size="sm" onClick={() => toggleDone(t.id)}>{on ? 'Done' : 'Mark done'}</Btn>
                    <Btn T={T} kind="subtle" size="sm" icon="circle-slash" onClick={() => skip(t.id)}>Set aside</Btn>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {activeTasks.length === 0 && <div style={{ textAlign: 'center', padding: '24px 12px', fontSize: 13.5, color: T.sub }}>Everything's done or set aside — finish up below.</div>}
      </div>

      {skippedTasks.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <SectionLabel T={T}>Set aside · {skippedTasks.length}</SectionLabel>
          <Card T={T} d={d} pad={0}>
            {skippedTasks.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderTop: i ? `1px solid ${T.line}` : 'none' }}>
                <Icon name="circle-slash" size={18} style={{ color: T.faint, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.sub }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: T.faint, marginTop: 1 }}>{t.room} · {t.mins} min</div>
                </div>
                <button onClick={() => unskip(t.id)} style={{ border: 'none', background: 'transparent', color: T.teal, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Bring back</button>
              </div>
            ))}
          </Card>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <Btn T={T} size="lg" icon="check" onClick={() => setStep('summary')}>{activeTasks.length > 0 && doneCount === activeTasks.length ? 'All done — finish' : 'Finish session'}</Btn>
      </div>
    </div>
  );
}

// ── Providers ────────────────────────────────────────────────────────────────
function DesktopProviders({ T, d }) {
  const seed = typeof PV_SEED !== 'undefined' ? PV_SEED : [];
  const [openId, setOpenId] = useScC(seed[0] && seed[0].id);
  const byCat = {};
  seed.forEach((p) => { (byCat[p.category] = byCat[p.category] || []).push(p); });
  const open = seed.find((p) => p.id === openId) || seed[0];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800, color: T.ink, letterSpacing: -0.6, margin: 0 }}>Service providers</h1>
          <div style={{ fontSize: 13.5, color: T.sub, marginTop: 6 }}>Your trusted pros, grouped by trade.</div>
        </div>
        <Btn T={T} icon="plus">Add provider</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)', gap: 22, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {Object.entries(byCat).map(([cat, list]) => (
            <div key={cat}>
              <SectionLabel T={T}>{cat}</SectionLabel>
              <Card T={T} d={d} pad={0}>
                {list.map((p, i) => (
                  <button key={p.id} onClick={() => setOpenId(p.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', borderTop: i ? `1px solid ${T.line}` : 'none', background: p.id === openId ? T.tealWash2 : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: T.tealWash, color: T.teal, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{p.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: T.faint }}>{p.phone}</div>
                    </div>
                  </button>
                ))}
              </Card>
            </div>
          ))}
        </div>

        {open && (
          <Card T={T} d={d} pad={24}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: T.tealWash, color: T.teal, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800 }}>{open.name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</div>
                <div>
                  <h2 style={{ fontSize: 21, fontWeight: 800, color: T.ink, letterSpacing: -0.4, margin: 0 }}>{open.name}</h2>
                  <div style={{ fontSize: 13, color: T.sub, marginTop: 3 }}>{open.category}</div>
                </div>
              </div>
              <Btn T={T} kind="ghost" size="sm" icon="pencil">Edit</Btn>
            </div>

            <div style={{ display: 'flex', gap: 10, margin: '20px 0' }}>
              <Btn T={T} kind="soft" icon="phone" size="sm">Call</Btn>
              {open.email && <Btn T={T} kind="subtle" icon="mail" size="sm">Email</Btn>}
              {open.website && <Btn T={T} kind="subtle" icon="globe" size="sm">Website</Btn>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16, marginBottom: 20 }}>
              <Field T={T} label="Phone" value={open.phone} mono />
              <Field T={T} label="Email" value={open.email || '—'} />
              <Field T={T} label="Website" value={open.website || '—'} />
            </div>

            {open.notes && (
              <div style={{ marginBottom: 20 }}>
                <SectionLabel T={T} style={{ marginBottom: 8 }}>Notes</SectionLabel>
                <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.55, background: T.surface2, borderRadius: 12, padding: 14 }}>{open.notes}</div>
              </div>
            )}

            <SectionLabel T={T} style={{ marginBottom: 8 }}>Worked on</SectionLabel>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {HH_ITEMS.slice(0, 2).map((it) => (
                <span key={it.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', border: `1px solid ${T.line2}`, borderRadius: 10, fontSize: 13, color: T.ink, fontWeight: 600 }}>
                  <Icon name={it.icon} size={14} style={{ color: T.teal }} /> {it.name}
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { DesktopWarranties, DesktopClean, DesktopCleanHub, DesktopCleanGuide, DesktopCleanSession, DesktopProviders });
