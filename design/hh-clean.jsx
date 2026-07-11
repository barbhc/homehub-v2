// ── Homehub · Clean ──────────────────────────────────────────────────────────
// The home for cleaning: a calm hub that (1) starts a guided deep-clean session,
// (2) surfaces this week's cleaning, and (3) holds step-by-step how-to guides.
// Same calm teal system as the rest of the app — cleaning is signalled with the
// spray-can / sparkles iconography, never a louder colour. Three connected
// surfaces: CleanHub · CleanGuide (how-to) · CleanSession (setup → run → summary).

const { useState: useClS } = React;

const CL_INK = '#0B1220', CL_SUB = '#6B7280', CL_TEAL = '#1B6B5A', CL_BG = '#F3F5F4', CL_AMBER = '#B4791F';

// ── Quick cleaning jobs — the building blocks of a session ───────────────────
const CL_TASKS = [
  { id: 'counters', name: 'Wipe down the counters', room: 'Kitchen', icon: 'utensils', mins: 5, due: 0,
    steps: ['Clear everything off the surface.', 'Spray a mild all-purpose cleaner and wipe.', 'Buff dry with a clean microfiber cloth.'] },
  { id: 'sink', name: 'Scrub & shine the sink', room: 'Kitchen', icon: 'utensils', mins: 8, due: 0,
    steps: ['Rinse away loose debris.', 'Sprinkle baking soda and scrub with a soft sponge.', 'Rinse, then wipe dry for shine.'] },
  { id: 'stovetop', name: 'Degrease the stovetop', room: 'Kitchen', icon: 'flame', mins: 12, due: 2,
    caution: 'Let the burners and surface cool fully before you start.',
    steps: ['Lift off grates and knobs.', 'Wipe up loose crumbs.', 'Spray degreaser, wait a minute, then wipe clean.', 'Dry and replace the grates.'] },
  { id: 'shower', name: 'Scrub the shower & tiles', room: 'Bathroom', icon: 'shower-head', mins: 15, due: 4,
    caution: 'Never mix bleach with vinegar or other cleaners — it releases toxic fumes.',
    steps: ['Wet the walls with warm water.', 'Apply bathroom cleaner top to bottom.', 'Scrub grout and corners with a brush.', 'Rinse thoroughly and squeegee dry.'] },
  { id: 'toilet', name: 'Clean & disinfect the toilet', room: 'Bathroom', icon: 'bath', mins: 8, due: 4,
    steps: ['Add cleaner under the rim and let it sit.', 'Scrub the bowl with the brush.', 'Wipe the seat, lid and base with a disinfecting wipe.', 'Flush.'] },
  { id: 'mirror', name: 'Wipe mirrors & fixtures', room: 'Bathroom', icon: 'sparkles', mins: 5, due: 4,
    steps: ['Spray glass cleaner on a cloth, not the mirror.', 'Wipe in an S-pattern to avoid streaks.', 'Polish faucet and handles.'] },
  { id: 'lint', name: 'Clear the dryer lint trap', room: 'Laundry', icon: 'wind', mins: 4, due: 1,
    caution: 'Lint buildup is a leading cause of dryer fires — don’t skip this one.',
    steps: ['Pull out the lint screen.', 'Peel off the lint by hand.', 'Vacuum the slot it sits in.', 'Slide the screen back in.'] },
  { id: 'gasket', name: 'Wipe the washer gasket', room: 'Laundry', icon: 'washing-machine', mins: 6, due: 6,
    steps: ['Pull back the rubber door seal.', 'Wipe away trapped lint and residue.', 'Dry it, and leave the door ajar to air out.'] },
  { id: 'dust', name: 'Dust surfaces & shelves', room: 'Living room', icon: 'sofa', mins: 10, due: 3,
    steps: ['Work top to bottom so dust falls down.', 'Use a slightly damp microfiber cloth.', 'Don’t forget sills, frames and the TV.'] },
  { id: 'floors', name: 'Vacuum the floors', room: 'Living room', icon: 'wind', mins: 12, due: 3,
    steps: ['Pick up anything on the floor first.', 'Vacuum edges and under furniture.', 'Finish with open floor in overlapping passes.'] },
];

// ── Deep-clean guides — the recurring, do-it-properly jobs ───────────────────
const CL_GUIDES = [
  { id: 'oven', name: 'Deep-clean the oven', room: 'Kitchen', icon: 'flame', mins: 45, freq: 'Every 3 months',
    why: 'Baked-on grease carbonises over time — it smokes, smells, and can taint whatever you bake. A proper clean every few months keeps it odour-free.',
    supplies: [{ name: 'Baking soda' }, { name: 'White vinegar' }, { name: 'Microfiber cloths' }, { name: 'Rubber gloves' }],
    cautions: ['Take the racks out and soak them separately in hot soapy water.', 'If you use the self-clean cycle instead, open a window — it gets very hot and can smoke.'],
    steps: [
      'Remove the racks and anything stored inside.',
      'Mix baking soda with a little water into a paste.',
      'Spread the paste over the interior, avoiding the heating elements.',
      'Leave it to work for a few hours, or overnight.',
      'Wipe it all out, spritzing vinegar on stubborn spots.',
      'Dry the interior and slide the racks back in.',
    ],
    manual: { quote: 'Do not use oven cleaners or oven liners of any kind in or around the self-clean elements.', src: 'GE Range manual · p.27' } },
  { id: 'washer', name: 'Refresh the washing machine', room: 'Laundry', icon: 'washing-machine', mins: 30, freq: 'Monthly',
    why: 'Detergent and damp build up where you can’t see, leaving a musty smell that transfers to clothes. A monthly refresh keeps every load smelling clean.',
    supplies: [{ name: 'Washer cleaner', spec: 'or white vinegar' }, { name: 'Baking soda' }, { name: 'Microfiber cloth' }],
    cautions: ['Run the clean cycle empty — no clothes.'],
    steps: [
      'Wipe the drum and around the rubber gasket.',
      'Add cleaner (or 2 cups vinegar) to the drum.',
      'Run the hottest, longest cycle — or the dedicated tub-clean.',
      'Wipe the gasket and detergent drawer dry.',
      'Leave the door open to air out.',
    ],
    manual: { quote: 'Run a Self Clean+ cycle monthly to keep the drum fresh and prevent odour.', src: 'Samsung Washer manual · p.41' } },
  { id: 'dishwasher', name: 'Deep-clean the dishwasher', room: 'Kitchen', icon: 'utensils', mins: 20, freq: 'Monthly',
    why: 'Grease and limescale clog the filter and spray arms, so dishes come out gritty. A monthly clean restores the spray and clears the smell.',
    supplies: [{ name: 'Dishwasher cleaner', spec: 'or white vinegar' }, { name: 'Old toothbrush' }],
    steps: [
      'Pull out the bottom rack and lift out the filter.',
      'Rinse the filter under hot water; scrub with the toothbrush.',
      'Wipe the door edges and seal.',
      'Place cleaner (or a cup of vinegar) on the top rack.',
      'Run the hottest cycle empty.',
    ],
    manual: { quote: 'Clean the filter monthly; a blocked filter reduces cleaning performance.', src: 'Bosch Dishwasher manual · p.31' } },
  { id: 'showerhead', name: 'Descale the showerhead', room: 'Bathroom', icon: 'shower-head', mins: 20, freq: 'Every 6 months',
    why: 'Mineral deposits block the nozzles, weakening and splitting the spray. A soak in vinegar dissolves the scale and brings the pressure back.',
    supplies: [{ name: 'White vinegar' }, { name: 'Freezer bag' }, { name: 'Rubber band' }],
    steps: [
      'Fill a freezer bag with white vinegar.',
      'Slip it over the showerhead so the nozzles are submerged.',
      'Secure with a rubber band and leave for an hour.',
      'Remove, then run hot water through to flush.',
      'Buff the outside with a cloth.',
    ],
    manual: null },
  { id: 'disposal', name: 'Freshen the garbage disposal', room: 'Kitchen', icon: 'recycle', mins: 10, freq: 'Monthly',
    why: 'Food residue coats the grinding chamber and breeds the smell that drifts up from the drain. A quick freshen clears it without harsh chemicals.',
    supplies: [{ name: 'Ice cubes' }, { name: 'Coarse salt' }, { name: 'Citrus peel' }],
    cautions: ['Never put your hand into the disposal — use the ice to clean the blades.'],
    steps: [
      'Drop a handful of ice and coarse salt down the disposal.',
      'Run cold water and the disposal for a few seconds.',
      'Feed in a few citrus peels and run again.',
      'Flush with cold water.',
    ],
    manual: null },
  { id: 'windows', name: 'Wash the windows', room: 'Whole home', icon: 'square', mins: 60, freq: 'Seasonal',
    why: 'A film of dust and rain spots cuts the light coming in more than you’d think. A seasonal wash makes rooms feel noticeably brighter.',
    supplies: [{ name: 'Glass cleaner', spec: 'or vinegar + water' }, { name: 'Squeegee' }, { name: 'Microfiber cloths' }],
    cautions: ['Clean on a cloudy day — direct sun dries the cleaner too fast and leaves streaks.'],
    steps: [
      'Dust the frames and sills first.',
      'Spray the glass and spread evenly.',
      'Pull the squeegee top to bottom, wiping the blade each pass.',
      'Buff the edges and corners with a dry cloth.',
    ],
    manual: null },
];
function clGuide(id) { return CL_GUIDES.find((g) => g.id === id) || CL_GUIDES[0]; }

const CL_ROOMS = ['Kitchen', 'Bathroom', 'Laundry', 'Living room'];
const CL_BUDGETS = [
  { id: 15, label: '15 min', note: 'Quick tidy' },
  { id: 30, label: '30 min', note: 'Reset' },
  { id: 60, label: '1 hour', note: 'Thorough' },
  { id: 0, label: 'No limit', note: 'Deep clean' },
];

// Pick the tasks for a session from the chosen rooms, fitting the time budget
// (shortest first so a tight budget still clears the most jobs).
function clSessionTasks(rooms, budget) {
  const pool = CL_TASKS.filter((t) => rooms.includes(t.room)).sort((a, b) => a.mins - b.mins);
  if (!budget) return pool;
  const out = []; let total = 0;
  for (const t of pool) { if (total + t.mins <= budget) { out.push(t); total += t.mins; } }
  return out.length ? out : pool.slice(0, 1);
}

// ── Small shared bits ────────────────────────────────────────────────────────
function CleanNav({ d, title, onBack, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: `2px ${d.pad - 6}px 8px` }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: CL_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 4px', cursor: 'pointer' }}>
        <Icon name="chevron-left" size={22} strokeWidth={2.4} /> {title}
      </button>
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

function CautionNote({ d, text }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#FBF3E2', border: '1px solid #EFE0C2', borderRadius: 12, padding: '11px 13px' }}>
      <Icon name="triangle-alert" size={16} style={{ color: CL_AMBER, marginTop: 1, flexShrink: 0 }} />
      <span style={{ fontSize: d.small + 1, color: '#6B5526', lineHeight: 1.45, textWrap: 'pretty' }}>{text}</span>
    </div>
  );
}

// ── Reusable inline step editor — drag to reorder · edit text · add / remove ──
const CL_CADENCES = ['Weekly', 'Every 2 weeks', 'Monthly', 'Every 3 months', 'Every 6 months', 'Seasonal', 'Yearly'];

function StepEditor({ d, initial, onChange }) {
  const mk = (t) => ({ id: 'st-' + Math.random().toString(36).slice(2, 8), text: t });
  const [items, setItems] = useClS(() => (initial && initial.length ? initial : ['']).map(mk));
  const [dragId, setDragId] = useClS(null);
  const refs = React.useRef({});
  const data = React.useRef(null);
  const emit = (next) => { setItems(next); onChange(next.map((x) => x.text)); };

  const onDown = (e, id) => {
    e.preventDefault(); e.stopPropagation();
    setDragId(id);
    data.current = { ids: items.map((x) => x.id) };
    const move = (ev) => {
      const dd = data.current; if (!dd) return;
      const ids = dd.ids; const cur = ids.indexOf(id);
      let target = cur;
      for (let k = 0; k < ids.length; k++) {
        const el = refs.current[ids[k]]; if (!el) continue;
        const r = el.getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) { target = k; break; }
      }
      if (target !== cur) {
        const nextIds = [...ids]; nextIds.splice(cur, 1); nextIds.splice(target, 0, id);
        dd.ids = nextIds;
        const map = {}; items.forEach((it) => { map[it.id] = it; });
        emit(nextIds.map((x) => map[x]));
      }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); data.current = null; setDragId(null); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, i) => (
        <div key={it.id} ref={(el) => { refs.current[it.id] = el; }} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, background: '#fff', border: `1px solid ${dragId === it.id ? CL_TEAL : 'rgba(15,23,42,0.12)'}`, borderRadius: 11, padding: '4px 6px 4px 4px', boxShadow: dragId === it.id ? '0 10px 22px rgba(11,26,22,0.16)' : 'none', position: 'relative', zIndex: dragId === it.id ? 5 : 1 }}>
          <div onPointerDown={(e) => onDown(e, it.id)} title="Drag to reorder" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 36, color: dragId === it.id ? CL_TEAL : '#B4BEC8', cursor: dragId === it.id ? 'grabbing' : 'grab', touchAction: 'none' }}><Icon name="grip-vertical" size={18} /></div>
          <span style={{ flexShrink: 0, width: 20, height: 20, marginTop: 8, borderRadius: 10, background: '#EAF3EF', color: CL_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
          <textarea value={it.text} onChange={(e) => emit(items.map((x) => x.id === it.id ? { ...x, text: e.target.value } : x))} rows={2} placeholder="Describe the step…" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: d.small + 1.5, color: '#26302D', lineHeight: 1.4, padding: '7px 0' }} />
          <button onClick={() => emit(items.length > 1 ? items.filter((x) => x.id !== it.id) : items)} title="Remove step" style={{ flexShrink: 0, border: 'none', background: 'transparent', color: '#B4BEC8', padding: 6, marginTop: 5, cursor: 'pointer' }}><Icon name="x" size={16} /></button>
        </div>
      ))}
      <button onClick={() => emit([...items, mk('')])} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1.5px dashed rgba(15,23,42,0.18)', background: 'transparent', color: CL_TEAL, borderRadius: 11, padding: '11px 0', fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}><Icon name="plus" size={15} /> Add a step</button>
    </div>
  );
}

// Small labelled section title used inside the editors.
function EditLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: CL_SUB, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>{children}</div>;
}

// ════════════════════════════════════════════════════════════════════════════
// CLEAN HUB — the entry point
// ════════════════════════════════════════════════════════════════════════════
function CleanHub({ d, tabs = TABS_FULL, currentTab = 'tasks', onTab, onOpenGuide, onStartSession, resume, onResume, onBack }) {
  const dueSoon = CL_TASKS.filter((t) => t.due <= 4).sort((a, b) => a.due - b.due).slice(0, 3);
  return (
    <Screen bg={CL_BG} padBottom={onBack ? d.pad : undefined}>
      <div style={{ padding: `${onBack ? 2 : 10}px ${d.pad}px 0` }}>
        {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: CL_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 6px 6px 0', marginLeft: -2, cursor: 'pointer' }}><Icon name="chevron-left" size={22} strokeWidth={2.4} /> Settings</button>}
        <h1 style={{ fontSize: d.big, fontWeight: 800, color: CL_INK, letterSpacing: -0.7, margin: 0 }}>Clean</h1>
        <p style={{ fontSize: d.small + 1, color: CL_SUB, margin: '3px 0 0' }}>A calm way to keep things fresh.</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 0`, display: 'flex', flexDirection: 'column', gap: d.stack + 2 }}>
        {resume && resume.total > 0 ? (
          /* resume an in-progress session */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={onResume} style={{ width: '100%', textAlign: 'left', border: 'none', borderRadius: d.radius, padding: d.cardPad + 2, cursor: 'pointer', background: 'linear-gradient(150deg,#1B6B5A,#2D9B82)', color: '#fff', boxShadow: '0 8px 24px rgba(27,107,90,0.22)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <div style={{ width: d.tap + 16, height: d.tap + 16, borderRadius: 14, background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="rotate-ccw" size={23} style={{ color: '#fff' }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', marginBottom: 2 }}>In progress</div>
                  <div style={{ fontSize: d.h2, fontWeight: 800, letterSpacing: -0.3 }}>Pick up where you left off</div>
                  <div style={{ fontSize: d.small + 1, color: 'rgba(255,255,255,0.85)', marginTop: 3 }}>{resume.done} of {resume.total} done · {resume.rooms.join(' · ')}</div>
                </div>
                <Icon name="arrow-right" size={20} style={{ color: 'rgba(255,255,255,0.9)' }} />
              </div>
            </button>
            <button onClick={onStartSession} style={{ alignSelf: 'center', border: 'none', background: 'transparent', color: CL_TEAL, fontSize: d.small + 1, fontWeight: 700, padding: '2px 6px', cursor: 'pointer' }}>Start a new session instead</button>
          </div>
        ) : (
          /* start a session */
          <button onClick={onStartSession} style={{ width: '100%', textAlign: 'left', border: 'none', borderRadius: d.radius, padding: d.cardPad + 2, cursor: 'pointer', background: 'linear-gradient(150deg,#1B6B5A,#2D9B82)', color: '#fff', boxShadow: '0 8px 24px rgba(27,107,90,0.22)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <div style={{ width: d.tap + 16, height: d.tap + 16, borderRadius: 14, background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="spray-can" size={24} style={{ color: '#fff' }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: d.h2, fontWeight: 800, letterSpacing: -0.3 }}>Start cleaning</div>
                <div style={{ fontSize: d.small + 1, color: 'rgba(255,255,255,0.82)', marginTop: 2, lineHeight: 1.35 }}>Pick rooms and a time budget — we’ll build the checklist.</div>
              </div>
              <Icon name="arrow-right" size={20} style={{ color: 'rgba(255,255,255,0.9)' }} />
            </div>
          </button>
        )}

        {/* this week's cleaning */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: CL_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>This week</div>
          <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
            {dueSoon.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>
                <CheckDot size={d.tap} color={CL_TEAL} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: d.body, fontWeight: 600, color: CL_INK, letterSpacing: -0.2 }}>{t.name}</div>
                  <div style={{ fontSize: d.small, color: CL_SUB, marginTop: 1 }}>{t.room} · {t.mins} min</div>
                </div>
                <span style={{ fontSize: d.small, fontWeight: 700, color: t.due === 0 ? CL_TEAL : CL_SUB, whiteSpace: 'nowrap' }}>{dueLabel(t.due)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* guides */}
        <div style={{ paddingBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9, paddingLeft: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: CL_SUB, letterSpacing: 0.6, textTransform: 'uppercase' }}>Cleaning guides</span>
            <span style={{ fontSize: d.small, color: CL_SUB, fontWeight: 500 }}>{CL_GUIDES.length} guides</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: d.gap }}>
            {CL_GUIDES.map((g) => (
              <button key={g.id} onClick={() => onOpenGuide(g.id)} style={{ textAlign: 'left', background: '#fff', border: '1px solid rgba(15,23,42,0.07)', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', padding: d.cardPad - 1, cursor: 'pointer' }}>
                <div style={{ width: d.tap + 8, height: d.tap + 8, borderRadius: 12, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 11 }}><Icon name={g.icon} size={20} style={{ color: CL_TEAL }} /></div>
                <div style={{ fontSize: d.body - 0.5, fontWeight: 700, color: CL_INK, letterSpacing: -0.2, lineHeight: 1.2, textWrap: 'balance' }}>{g.name}</div>
                <div style={{ fontSize: d.small, color: CL_SUB, marginTop: 5 }}>{g.mins} min · {g.freq}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {!onBack && <TabBar tabs={tabs} current={currentTab} onSelect={onTab} accent={CL_TEAL} solidBg="rgba(243,245,244,0.85)" />}
    </Screen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CLEAN GUIDE — the how-to for one job
// ════════════════════════════════════════════════════════════════════════════
function CleanGuide({ d, guide, guideId = 'oven', onBack, onAddToSession, onSave, startEditing = false }) {
  const base = guide || clGuide(guideId);
  const [model, setModel] = useClS(base);
  const [editing, setEditing] = useClS(startEditing);
  const [draft, setDraft] = useClS(base);
  const [done, setDone] = useClS([]);
  const toggle = (i) => setDone((x) => x.includes(i) ? x.filter((n) => n !== i) : [...x, i]);

  const g = model;
  const beginEdit = () => { setDraft({ ...model, steps: [...model.steps] }); setEditing(true); };
  const cancel = () => setEditing(false);
  const save = () => { const cleaned = { ...draft, steps: draft.steps.filter((s) => s.trim()) }; setModel(cleaned); setEditing(false); setDone([]); onSave && onSave(cleaned); };
  const setD = (patch) => setDraft((x) => ({ ...x, ...patch }));

  const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(15,23,42,0.14)', borderRadius: 11, padding: '12px 13px', fontFamily: 'inherit', fontSize: d.body, color: CL_INK, outline: 'none', background: '#fff' };

  // ── EDIT MODE ──
  if (editing) {
    return (
      <Screen bg={CL_BG} padBottom={96}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `2px ${d.pad - 6}px 8px` }}>
          <button onClick={cancel} style={{ border: 'none', background: 'transparent', color: CL_SUB, fontSize: d.body, fontWeight: 600, padding: '6px 8px', cursor: 'pointer' }}>Cancel</button>
          <span style={{ fontSize: d.body, fontWeight: 700, color: CL_INK }}>Edit guide</span>
          <button onClick={save} style={{ border: 'none', background: 'transparent', color: CL_TEAL, fontSize: d.body, fontWeight: 800, padding: '6px 8px', cursor: 'pointer' }}>Save</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: `6px ${d.pad}px 40px`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
          <div>
            <EditLabel>Title</EditLabel>
            <input value={draft.name} onChange={(e) => setD({ name: e.target.value })} style={inputStyle} />
          </div>

          <div>
            <EditLabel>Cadence — how often</EditLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {CL_CADENCES.map((c) => {
                const on = draft.freq === c;
                return <button key={c} onClick={() => setD({ freq: c })} style={{ border: `1.5px solid ${on ? CL_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? CL_TEAL : '#fff', color: on ? '#fff' : CL_INK, borderRadius: 99, padding: '8px 13px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}>{c}</button>;
              })}
            </div>
          </div>

          <div>
            <EditLabel>Time estimate</EditLabel>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0, background: '#fff', border: '1px solid rgba(15,23,42,0.14)', borderRadius: 12, overflow: 'hidden' }}>
              <button onClick={() => setD({ mins: Math.max(5, draft.mins - 5) })} style={{ border: 'none', background: 'transparent', color: CL_TEAL, padding: '11px 16px', cursor: 'pointer', display: 'flex' }}><Icon name="minus" size={18} strokeWidth={2.6} /></button>
              <span style={{ minWidth: 74, textAlign: 'center', fontSize: d.body, fontWeight: 700, color: CL_INK, fontVariantNumeric: 'tabular-nums' }}>{draft.mins} min</span>
              <button onClick={() => setD({ mins: draft.mins + 5 })} style={{ border: 'none', background: 'transparent', color: CL_TEAL, padding: '11px 16px', cursor: 'pointer', display: 'flex' }}><Icon name="plus" size={18} strokeWidth={2.6} /></button>
            </div>
          </div>

          <div>
            <EditLabel>Steps — drag to reorder</EditLabel>
            <StepEditor d={d} initial={draft.steps} onChange={(s) => setD({ steps: s })} />
          </div>

          <div>
            <EditLabel>Your notes</EditLabel>
            <textarea value={draft.note || ''} onChange={(e) => setD({ note: e.target.value })} rows={3} placeholder="Anything you want to remember — a product that works, a spot to watch…" style={{ ...inputStyle, resize: 'none', lineHeight: 1.45 }} />
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(12px + env(safe-area-inset-bottom))`, background: 'rgba(243,245,244,0.94)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.08)', display: 'flex', gap: d.gap }}>
          <button onClick={cancel} style={{ border: '1.5px solid rgba(15,23,42,0.14)', background: '#fff', color: CL_INK, borderRadius: 14, padding: '15px 18px', fontSize: d.body, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} style={{ flex: 1, border: 'none', background: CL_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}><Icon name="check" size={18} strokeWidth={2.6} /> Save changes</button>
        </div>
      </Screen>
    );
  }

  // ── READ MODE ──
  return (
    <Screen bg="#FFFFFF" padBottom={96}>
      <CleanNav d={d} title="Clean" onBack={onBack} right={
        <button onClick={beginEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid rgba(15,23,42,0.12)', background: '#fff', color: CL_INK, borderRadius: 10, padding: '7px 12px', fontSize: d.small + 1, fontWeight: 700, marginRight: d.pad - 6, cursor: 'pointer' }}><Icon name="pencil" size={14} style={{ color: CL_TEAL }} /> Edit</button>
      } />
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        {/* header */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <ItemGlyph icon={g.icon} size={d.tap + 26} bg="#EAF3EF" fg={CL_TEAL} radius={16} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#E8F2EF', color: CL_TEAL, borderRadius: 99, padding: '4px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}><Icon name="repeat" size={11} /> {g.freq}</span>
              <h1 style={{ fontSize: d.big - 3, fontWeight: 800, color: CL_INK, letterSpacing: -0.5, lineHeight: 1.12, margin: '8px 0 0', textWrap: 'balance' }}>{g.name}</h1>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: d.small + 1, color: CL_SUB }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="clock" size={15} /> {g.mins} min</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="map-pin" size={15} /> {g.room}</span>
          </div>
        </div>

        <WhyNote text={g.why} d={d} />

        {g.cautions && g.cautions.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: CL_SUB, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Before you start</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap - 2 }}>
              {g.cautions.map((c) => <CautionNote key={c} d={d} text={c} />)}
            </div>
          </div>
        )}

        <SuppliesRow supplies={g.supplies} d={d} />

        {/* steps */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: CL_SUB, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 9 }}>Steps</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap - 1 }}>
            {g.steps.map((s, i) => {
              const on = done.includes(i);
              return (
                <div key={i} onClick={() => toggle(i)} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <span style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, marginTop: 1, border: `2px solid ${on ? CL_TEAL : '#CBD5E1'}`, background: on ? CL_TEAL : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                    {on ? <Icon name="check" size={13} strokeWidth={3} /> : i + 1}
                  </span>
                  <span style={{ fontSize: d.body, color: on ? CL_SUB : '#26302D', lineHeight: 1.4, textDecoration: on ? 'line-through' : 'none', textWrap: 'pretty' }}>{s}</span>
                </div>
              );
            })}
          </div>
        </div>

        <ManualSnippet manual={g.manual} d={d} />

        {/* your notes */}
        {g.note ? (
          <div style={{ background: '#FBFCF8', border: '1px solid #E6ECD9', borderRadius: d.radius - 4, padding: d.cardPad }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, color: '#7C8A5A', letterSpacing: 0.5, textTransform: 'uppercase' }}><Icon name="sticky-note" size={13} /> Your notes</div>
              <button onClick={beginEdit} style={{ border: 'none', background: 'transparent', color: CL_TEAL, fontSize: d.small + 0.5, fontWeight: 700, padding: 2, cursor: 'pointer' }}>Edit</button>
            </div>
            <div style={{ fontSize: d.body, color: '#3A4030', lineHeight: 1.45, textWrap: 'pretty' }}>{g.note}</div>
          </div>
        ) : (
          <button onClick={beginEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', border: '1.5px dashed rgba(15,23,42,0.18)', background: 'transparent', color: CL_SUB, borderRadius: 12, padding: '11px 15px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}><Icon name="sticky-note" size={15} style={{ color: CL_TEAL }} /> Add a note</button>
        )}
        <div style={{ height: 8 }} />
      </div>

      {/* sticky actions */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(12px + env(safe-area-inset-bottom))`, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.08)', display: 'flex', gap: d.gap }}>
        <button onClick={onBack} style={{ flex: 1, border: 'none', background: CL_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
          <Icon name="check" size={18} strokeWidth={2.6} /> Mark done
        </button>
        <button onClick={onAddToSession} style={{ border: '1.5px solid rgba(15,23,42,0.14)', background: '#fff', color: CL_INK, borderRadius: 14, padding: '15px 16px', fontSize: d.body, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Icon name="plus" size={17} /> Add to session
        </button>
      </div>
    </Screen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CLEAN SESSION — setup → run (checklist) → summary
// ════════════════════════════════════════════════════════════════════════════
function CleanSession({ d, onClose, onDone, onExit, startStep = 'setup', seedRooms = ['Kitchen'], seedBudget = 30, seedDone = [], seedSkipped = [], seedOrder = null, taskEdits = {}, onSaveTask }) {
  const [step, setStep] = useClS(startStep);
  const [rooms, setRooms] = useClS(seedRooms);
  const [budget, setBudget] = useClS(seedBudget);
  const [doneIds, setDoneIds] = useClS(seedDone);
  const [skippedIds, setSkippedIds] = useClS(seedSkipped);
  const [order, setOrder] = useClS(seedOrder); // null until the checklist is built/materialised
  const [openId, setOpenId] = useClS(null);
  const [dragId, setDragId] = useClS(null);
  const [editId, setEditId] = useClS(null);
  const [taskDraft, setTaskDraft] = useClS(null);
  const rowRefs = React.useRef({});
  const dragData = React.useRef(null);

  // Display reflects any light edits the user has made (name · steps · note).
  const byId = CL_TASKS.reduce((a, t) => { a[t.id] = { ...t, ...(taskEdits[t.id] || {}) }; return a; }, {});
  const baseTasks = clSessionTasks(rooms.length ? rooms : CL_ROOMS, budget);
  // Active tasks follow the user-controlled order (minus anything set aside).
  const activeIds = (order || baseTasks.map((t) => t.id)).filter((id) => byId[id] && !skippedIds.includes(id));
  const activeTasks = activeIds.map((id) => byId[id]);
  const skippedTasks = skippedIds.map((id) => byId[id]).filter(Boolean);

  const doneCount = activeTasks.filter((t) => doneIds.includes(t.id)).length;
  const minsLeft = activeTasks.filter((t) => !doneIds.includes(t.id)).reduce((a, t) => a + t.mins, 0);
  const minsDone = activeTasks.filter((t) => doneIds.includes(t.id)).reduce((a, t) => a + t.mins, 0);
  const roomsTouched = [...new Set(activeTasks.filter((t) => doneIds.includes(t.id)).map((t) => t.room))];
  const remaining = [...activeTasks.filter((t) => !doneIds.includes(t.id)), ...skippedTasks];
  const estTotal = baseTasks.reduce((a, t) => a + t.mins, 0);

  const toggleRoom = (r) => setRooms((x) => x.includes(r) ? x.filter((y) => y !== r) : [...x, r]);
  const toggleDone = (id) => setDoneIds((x) => x.includes(id) ? x.filter((y) => y !== id) : [...x, id]);
  const skipTask = (id) => { setOrder(activeIds.filter((x) => x !== id)); setSkippedIds([...skippedIds, id]); setOpenId(null); };
  const unskip = (id) => { setSkippedIds(skippedIds.filter((x) => x !== id)); setOrder([...activeIds, id]); };
  const moveTask = (id, dir) => { const arr = [...activeIds]; const i = arr.indexOf(id); const j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; setOrder(arr); };
  const buildChecklist = () => { setOrder(baseTasks.map((t) => t.id)); setStep('run'); };
  const exit = () => { const p = { rooms: rooms.length ? rooms : CL_ROOMS, budget, doneIds, skippedIds, order: activeIds, done: doneCount, total: activeTasks.length }; onExit ? onExit(p) : onClose(); };

  // Pointer-based drag reorder — one code path for touch (mobile) and mouse (desktop).
  const onHandleDown = (e, id) => {
    e.preventDefault(); e.stopPropagation();
    setOpenId(null); setDragId(id);
    dragData.current = { id, ids: [...activeIds] };
    const move = (ev) => {
      const dd = dragData.current; if (!dd) return;
      const ids = dd.ids; const cur = ids.indexOf(dd.id);
      let target = cur;
      for (let k = 0; k < ids.length; k++) {
        const el = rowRefs.current[ids[k]]; if (!el) continue;
        const r = el.getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) { target = k; break; }
        if (ev.clientY < r.top) { target = Math.min(target, k); }
        if (ev.clientY > r.bottom) { target = Math.max(target, k); }
      }
      if (target !== cur) {
        const next = [...ids]; next.splice(cur, 1); next.splice(target, 0, dd.id);
        dd.ids = next; setOrder(next);
      }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); dragData.current = null; setDragId(null); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // ── SETUP ──
  if (step === 'setup') {
    const allOn = rooms.length === CL_ROOMS.length;
    return (
      <Screen bg={CL_BG} padTop={SB_H} padBottom={0}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `4px ${d.pad - 6}px 12px` }}>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: CL_TEAL, padding: '6px', display: 'flex', cursor: 'pointer' }}><Icon name="x" size={24} strokeWidth={2.2} /></button>
          <span style={{ fontSize: d.body + 1, fontWeight: 700, color: CL_INK }}>Start a cleaning session</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: `6px ${d.pad}px 120px` }}>
          {/* rooms */}
          <div style={{ fontSize: 12, fontWeight: 700, color: CL_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>What are you cleaning?</div>
          <button onClick={() => setRooms(allOn ? [] : [...CL_ROOMS])} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: allOn ? '#E8F2EF' : '#fff', border: `1.5px solid ${allOn ? CL_TEAL : 'rgba(15,23,42,0.10)'}`, borderRadius: d.radius - 4, padding: d.cardPad, marginBottom: d.gap, cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: d.tap + 6, height: d.tap + 6, borderRadius: 11, background: allOn ? CL_TEAL : '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="house" size={19} style={{ color: allOn ? '#fff' : CL_TEAL }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: d.body, fontWeight: 700, color: CL_INK }}>Whole home</div>
              <div style={{ fontSize: d.small, color: CL_SUB, marginTop: 1 }}>Every room</div>
            </div>
            {allOn && <Icon name="check" size={18} strokeWidth={3} style={{ color: CL_TEAL }} />}
          </button>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CL_ROOMS.map((r) => {
              const on = rooms.includes(r);
              return <button key={r} onClick={() => toggleRoom(r)} style={{ border: `1.5px solid ${on ? CL_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? CL_TEAL : '#fff', color: on ? '#fff' : CL_INK, borderRadius: 99, padding: '10px 16px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}>{r}</button>;
            })}
          </div>

          {/* time budget */}
          <div style={{ fontSize: 12, fontWeight: 700, color: CL_SUB, letterSpacing: 0.6, textTransform: 'uppercase', margin: `${d.stack + 4}px 0 9px`, paddingLeft: 2 }}>How much time?</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: d.gap }}>
            {CL_BUDGETS.map((b) => {
              const on = budget === b.id;
              return (
                <button key={b.id} onClick={() => setBudget(b.id)} style={{ textAlign: 'left', background: on ? '#E8F2EF' : '#fff', border: `1.5px solid ${on ? CL_TEAL : 'rgba(15,23,42,0.10)'}`, borderRadius: d.radius - 4, padding: d.cardPad, cursor: 'pointer' }}>
                  <div style={{ fontSize: d.h2 - 1, fontWeight: 800, color: on ? CL_TEAL : CL_INK, letterSpacing: -0.4 }}>{b.label}</div>
                  <div style={{ fontSize: d.small, color: CL_SUB, marginTop: 2 }}>{b.note}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(243,245,244,0.95)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
          <div style={{ textAlign: 'center', fontSize: d.small + 1, color: CL_SUB, marginBottom: 10 }}>
            {rooms.length ? <span><strong style={{ color: CL_INK }}>{baseTasks.length} task{baseTasks.length === 1 ? '' : 's'}</strong> lined up · about {estTotal} min</span> : 'Pick at least one room'}
          </div>
          <button onClick={() => rooms.length && buildChecklist()} style={{ width: '100%', border: 'none', background: rooms.length ? CL_TEAL : '#C9D4D0', color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: rooms.length ? 'pointer' : 'default' }}>
            <Icon name="spray-can" size={18} strokeWidth={2.4} /> Build my checklist
          </button>
        </div>
      </Screen>
    );
  }

  // ── SUMMARY ──
  if (step === 'summary') {
    return (
      <Screen bg="#FFFFFF" padTop={SB_H} padBottom={0}>
        <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 100px` }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: `${d.stack}px 0 ${d.stack + 4}px` }}>
            <div style={{ width: 78, height: 78, borderRadius: '50%', background: '#E8F2EF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><Icon name="sparkles" size={38} style={{ color: CL_TEAL }} /></div>
            <h1 style={{ fontSize: d.big - 1, fontWeight: 800, color: CL_INK, letterSpacing: -0.5, margin: 0 }}>Nice work, Barb</h1>
            <p style={{ fontSize: d.body, color: CL_SUB, margin: '8px 0 0', lineHeight: 1.45, maxWidth: 280 }}>
              {doneCount > 0 ? `The ${roomsTouched.join(' & ')} ${roomsTouched.length > 1 ? 'are' : 'is'} looking fresher.` : 'Every little bit helps — pick it back up anytime.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: d.gap, marginBottom: d.stack }}>
            {[{ n: doneCount, l: 'tasks done' }, { n: minsDone, l: 'minutes' }, { n: roomsTouched.length, l: roomsTouched.length === 1 ? 'room' : 'rooms' }].map((s) => (
              <div key={s.l} style={{ flex: 1, background: '#F4F6F5', borderRadius: d.radius - 4, padding: `${d.cardPad}px 6px`, textAlign: 'center' }}>
                <div style={{ fontSize: d.big - 6, fontWeight: 800, color: CL_TEAL, letterSpacing: -0.5 }}>{s.n}</div>
                <div style={{ fontSize: d.small, color: CL_SUB, marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>

          {remaining.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: CL_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>Picked up later · {remaining.length}</div>
              <div style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: d.radius - 4, overflow: 'hidden', marginBottom: d.gap }}>
                {remaining.map((t, i) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>
                    <Icon name={skippedIds.includes(t.id) ? 'circle-slash' : 'circle'} size={d.tap - 6} style={{ color: '#CBD5E1', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: d.body, color: CL_INK }}>{t.name}</span>
                    <span style={{ fontSize: d.small, color: CL_SUB }}>{t.room}</span>
                  </div>
                ))}
              </div>
              <button style={{ width: '100%', border: '1.5px solid rgba(15,23,42,0.14)', background: '#fff', color: CL_INK, borderRadius: 13, padding: '13px 0', fontSize: d.body, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer' }}>
                <Icon name="calendar-plus" size={17} style={{ color: CL_TEAL }} /> Add the rest to next week
              </button>
            </div>
          )}
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
          <button onClick={onDone} style={{ width: '100%', border: 'none', background: CL_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, cursor: 'pointer' }}>Done</button>
        </div>
      </Screen>
    );
  }

  // ── RUN (checklist) ──
  const pct = activeTasks.length ? Math.round((doneCount / activeTasks.length) * 100) : 0;
  return (
    <Screen bg={CL_BG} padTop={SB_H} padBottom={0}>
      {/* sticky progress header */}
      <div style={{ padding: `4px ${d.pad}px 12px`, borderBottom: '0.5px solid rgba(15,23,42,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={exit} title="Save & pick up later" style={{ border: 'none', background: 'transparent', color: CL_TEAL, padding: '6px', display: 'flex', cursor: 'pointer', marginLeft: -6 }}><Icon name="chevron-left" size={24} strokeWidth={2.2} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: d.body + 1, fontWeight: 800, color: CL_INK, letterSpacing: -0.3 }}>{doneCount} of {activeTasks.length} done</div>
            <div style={{ fontSize: d.small, color: CL_SUB, marginTop: 1 }}>{minsLeft > 0 ? `About ${minsLeft} min left` : 'All caught up'}</div>
          </div>
          <button onClick={() => setStep('summary')} style={{ border: 'none', background: 'transparent', color: CL_TEAL, fontSize: d.body, fontWeight: 700, padding: '6px 4px', cursor: 'pointer' }}>Finish</button>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(15,23,42,0.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: CL_TEAL, borderRadius: 3, transition: 'width .3s ease' }} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 100px`, display: 'flex', flexDirection: 'column', gap: d.gap }}>
        {activeTasks.map((t, idx) => {
          const on = doneIds.includes(t.id);
          const open = openId === t.id;
          const dragging = dragId === t.id;
          return (
            <div key={t.id} ref={(el) => { rowRefs.current[t.id] = el; }} style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: dragging ? '0 14px 30px rgba(11,26,22,0.20)' : on ? 'none' : '0 1px 2px rgba(15,23,42,0.05)', border: on ? '1px solid rgba(15,23,42,0.06)' : '1px solid transparent', overflow: 'hidden', opacity: on && !dragging ? 0.7 : 1, transform: dragging ? 'scale(1.02)' : 'none', position: 'relative', zIndex: dragging ? 5 : 1, transition: dragging ? 'none' : 'box-shadow .15s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: d.cardPad }}>
                <button onClick={() => toggleDone(t.id)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', flexShrink: 0 }}><CheckDot size={d.tap + 2} color={CL_TEAL} done={on} /></button>
                <button onClick={() => setOpenId(open ? null : t.id)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: d.body, fontWeight: 600, color: on ? CL_SUB : CL_INK, letterSpacing: -0.2, textDecoration: on ? 'line-through' : 'none' }}>{t.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
                      <span style={{ fontSize: d.small, color: CL_SUB }}>{t.room} · {t.mins} min</span>
                      {t.caution && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: d.small - 0.5, fontWeight: 600, color: CL_AMBER }}><Icon name="triangle-alert" size={11} /> Care</span>}
                    </div>
                  </div>
                  <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} style={{ color: '#94A3B8', flexShrink: 0 }} />
                </button>
                <div onPointerDown={(e) => onHandleDown(e, t.id)} title="Drag to reorder" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: d.tap, height: d.tap + 6, marginRight: -5, color: dragging ? CL_TEAL : '#B4BEC8', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}>
                  <Icon name="grip-vertical" size={20} />
                </div>
              </div>
              {open && (
                <div style={{ padding: `0 ${d.cardPad}px ${d.cardPad}px`, borderTop: '0.5px solid rgba(15,23,42,0.06)' }}>
                  {editId === t.id ? (
                    /* ── edit this task ── */
                    <div style={{ marginTop: d.gap, display: 'flex', flexDirection: 'column', gap: d.gap + 2 }}>
                      <div>
                        <EditLabel>Task name</EditLabel>
                        <input value={taskDraft.name} onChange={(e) => setTaskDraft((s) => ({ ...s, name: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(15,23,42,0.14)', borderRadius: 11, padding: '11px 12px', fontFamily: 'inherit', fontSize: d.body, color: CL_INK, outline: 'none' }} />
                      </div>
                      <div>
                        <EditLabel>Steps — drag to reorder</EditLabel>
                        <StepEditor d={d} initial={taskDraft.steps} onChange={(s) => setTaskDraft((p) => ({ ...p, steps: s }))} />
                      </div>
                      <div>
                        <EditLabel>Note</EditLabel>
                        <textarea value={taskDraft.note || ''} onChange={(e) => setTaskDraft((s) => ({ ...s, note: e.target.value }))} rows={2} placeholder="A reminder for next time…" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(15,23,42,0.14)', borderRadius: 11, padding: '11px 12px', fontFamily: 'inherit', fontSize: d.body, color: CL_INK, outline: 'none', resize: 'none', lineHeight: 1.45 }} />
                      </div>
                      <div style={{ display: 'flex', gap: d.gap }}>
                        <button onClick={() => setEditId(null)} style={{ border: '1.5px solid rgba(15,23,42,0.14)', background: '#fff', color: CL_INK, borderRadius: 12, padding: '11px 16px', fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                        <button onClick={() => { onSaveTask && onSaveTask(t.id, { name: taskDraft.name, steps: taskDraft.steps.filter((s) => s.trim()), note: taskDraft.note }); setEditId(null); }} style={{ flex: 1, border: 'none', background: CL_TEAL, color: '#fff', borderRadius: 12, padding: '11px 0', fontSize: d.small + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer' }}><Icon name="check" size={16} strokeWidth={2.6} /> Save</button>
                      </div>
                    </div>
                  ) : (
                    <React.Fragment>
                      {t.caution && <div style={{ marginTop: d.gap }}><CautionNote d={d} text={t.caution} /></div>}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: d.gap }}>
                        {t.steps.map((s, i) => (
                          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <span style={{ width: 20, height: 20, borderRadius: 10, flexShrink: 0, marginTop: 1, background: '#EAF3EF', color: CL_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                            <span style={{ fontSize: d.small + 1.5, color: '#3A4A45', lineHeight: 1.4, textWrap: 'pretty' }}>{s}</span>
                          </div>
                        ))}
                      </div>
                      {t.note && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#FBFCF8', border: '1px solid #E6ECD9', borderRadius: 11, padding: '9px 11px', marginTop: d.gap }}>
                          <Icon name="sticky-note" size={14} style={{ color: '#7C8A5A', marginTop: 1, flexShrink: 0 }} />
                          <span style={{ fontSize: d.small + 1, color: '#3A4030', lineHeight: 1.4, textWrap: 'pretty' }}>{t.note}</span>
                        </div>
                      )}
                      {/* actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: d.stack - 2 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: d.small, color: CL_SUB }}><Icon name="grip-vertical" size={13} /> Drag to reorder</span>
                        <div style={{ flex: 1 }} />
                        <button onClick={() => { setEditId(t.id); setTaskDraft({ name: t.name, steps: [...t.steps], note: t.note || '' }); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid rgba(15,23,42,0.12)', background: '#fff', color: CL_INK, borderRadius: 10, padding: '8px 11px', fontSize: d.small + 0.5, fontWeight: 600, cursor: 'pointer' }}><Icon name="pencil" size={13} style={{ color: CL_TEAL }} /> Edit</button>
                        <button onClick={() => skipTask(t.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid rgba(15,23,42,0.12)', background: '#fff', color: CL_SUB, borderRadius: 10, padding: '8px 11px', fontSize: d.small + 0.5, fontWeight: 600, cursor: 'pointer' }}><Icon name="circle-slash" size={14} /> Set aside</button>
                      </div>
                    </React.Fragment>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {activeTasks.length === 0 && (
          <div style={{ textAlign: 'center', padding: `${d.stack}px 12px`, fontSize: d.small + 1, color: CL_SUB }}>Everything’s done or set aside — finish up below.</div>
        )}
        <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1.5px dashed rgba(15,23,42,0.18)', background: 'transparent', color: CL_SUB, borderRadius: d.radius - 4, padding: '14px 0', fontSize: d.body, fontWeight: 600, cursor: 'pointer' }}>
          <Icon name="plus" size={17} /> Add a task
        </button>

        {/* set-aside group */}
        {skippedTasks.length > 0 && (
          <div style={{ marginTop: d.gap }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: CL_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>Set aside · {skippedTasks.length}</div>
            <div style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.07)', borderRadius: d.radius - 4, overflow: 'hidden' }}>
              {skippedTasks.map((t, i) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>
                  <Icon name="circle-slash" size={d.tap - 6} style={{ color: '#CBD5E1', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: d.body, fontWeight: 600, color: CL_SUB }}>{t.name}</div>
                    <div style={{ fontSize: d.small, color: CL_SUB, marginTop: 1 }}>{t.room} · {t.mins} min</div>
                  </div>
                  <button onClick={() => unskip(t.id)} style={{ border: 'none', background: 'transparent', color: CL_TEAL, fontSize: d.small + 1, fontWeight: 700, padding: '6px 4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Bring back</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(243,245,244,0.95)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
        <button onClick={() => setStep('summary')} style={{ width: '100%', border: 'none', background: CL_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
          <Icon name="check" size={18} strokeWidth={2.6} /> {activeTasks.length > 0 && doneCount === activeTasks.length ? 'All done — finish' : 'Finish session'}
        </button>
      </div>
    </Screen>
  );
}

// ── Connector: makes the hub fully tappable (hub ↔ guide ↔ session), and keeps
// an in-progress session around so you can pick up where you left off. ────────
function CleanApp({ d, tabs = TABS_FULL, onTab, onBack }) {
  const [view, setView] = useClS({ type: 'hub' });
  const [saved, setSaved] = useClS(null); // in-progress session, or null
  const [guides, setGuides] = useClS(() => CL_GUIDES.map((g) => ({ ...g, steps: [...g.steps] }))); // editable copy
  const [taskEdits, setTaskEdits] = useClS({}); // id → { name, steps, note }
  const saveGuide = (u) => setGuides((gs) => gs.map((g) => g.id === u.id ? u : g));
  const saveTask = (id, patch) => setTaskEdits((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } }));

  if (view.type === 'guide') {
    return <CleanGuide d={d} guide={guides.find((g) => g.id === view.id)} onSave={saveGuide} onBack={() => setView({ type: 'hub' })} onAddToSession={() => { setSaved(null); setView({ type: 'session' }); }} />;
  }
  if (view.type === 'session') {
    const r = view.resume ? saved : null;
    return <CleanSession d={d}
      startStep={r ? 'run' : 'setup'}
      seedRooms={r ? r.rooms : ['Kitchen']}
      seedBudget={r ? r.budget : 30}
      seedDone={r ? r.doneIds : []}
      seedSkipped={r ? r.skippedIds : []}
      seedOrder={r ? r.order : null}
      taskEdits={taskEdits} onSaveTask={saveTask}
      onClose={() => setView({ type: 'hub' })}
      onExit={(p) => { setSaved(p); setView({ type: 'hub' }); }}
      onDone={() => { setSaved(null); setView({ type: 'hub' }); }} />;
  }
  return <CleanHub d={d} tabs={tabs} currentTab="tasks" onTab={onTab} onBack={onBack}
    resume={saved} onResume={() => setView({ type: 'session', resume: true })}
    onOpenGuide={(id) => setView({ type: 'guide', id })}
    onStartSession={() => { setSaved(null); setView({ type: 'session' }); }} />;
}

Object.assign(window, { CleanHub, CleanGuide, CleanSession, CleanApp, CL_GUIDES, CL_TASKS });
