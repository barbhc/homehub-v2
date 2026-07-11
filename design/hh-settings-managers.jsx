// ── Homehub · Settings managers (Rooms · Custom tasks) ───────────────────────
// Rooms: add / rename / delete. Custom tasks: built for the jobs that aren't
// tied to an appliance — pest control, gutters, lawn, alarms — and made easier
// with profile-tailored suggestions. Two design options for the tailoring:
//   A) inline smart suggestions in the manager (CustomTasksManager)
//   B) a short guided "starter plan" that bulk-adds (CustomTaskPlanner)
// Both run off the same home profile (own/rent · type · age) + suggestion set.

const { useState: useMgS } = React;

const MG_INK = '#0B1220', MG_SUB = '#6B7280', MG_TEAL = '#1B6B5A', MG_BG = '#EFF1F0';

// ── Rooms ────────────────────────────────────────────────────────────────────
const MG_ROOMS_SEED = [
  { id: 'r1', name: 'Kitchen', count: 2 }, { id: 'r2', name: 'Laundry', count: 1 },
  { id: 'r3', name: 'Utility', count: 2 }, { id: 'r4', name: 'Living room', count: 0 },
  { id: 'r5', name: 'Garage', count: 0 },
];

function MgBar({ d, onBack, title = 'Settings' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: `2px ${d.pad - 6}px 6px` }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: MG_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 4px', cursor: 'pointer' }}>
        <Icon name="chevron-left" size={22} strokeWidth={2.4} /> {title}
      </button>
    </div>
  );
}
function MgTitle({ d, children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: `2px 0 ${d.stack}px`, paddingLeft: 2 }}>
      <h1 style={{ fontSize: d.big - 1, fontWeight: 800, color: MG_INK, letterSpacing: -0.6, margin: 0 }}>{children}</h1>
      {right}
    </div>
  );
}

function RoomsManager({ d, onBack }) {
  const [rooms, setRooms] = useMgS(MG_ROOMS_SEED);
  const [editId, setEditId] = useMgS(null);
  const [draft, setDraft] = useMgS('');
  const [adding, setAdding] = useMgS('');

  const startEdit = (r) => { setEditId(r.id); setDraft(r.name); };
  const commit = () => { if (editId) setRooms((rs) => rs.map((r) => r.id === editId ? { ...r, name: draft || r.name } : r)); setEditId(null); };
  const del = (id) => setRooms((rs) => rs.filter((r) => r.id !== id));
  const add = () => { if (!adding.trim()) return; setRooms((rs) => [...rs, { id: 'r-' + Date.now(), name: adding.trim(), count: 0 }]); setAdding(''); };

  const inputStyle = { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: d.body, fontWeight: 500, color: MG_INK };

  return (
    <Screen bg={MG_BG} padBottom={20}>
      <MgBar d={d} onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: `2px ${d.pad}px 0` }}>
        <MgTitle d={d}>Rooms</MgTitle>
        <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden', marginBottom: d.gap + 2 }}>
          {rooms.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: i === rooms.length - 1 ? 'none' : '0.5px solid rgba(15,23,42,0.07)' }}>
              <Icon name="layout-grid" size={17} style={{ color: MG_TEAL, flexShrink: 0 }} />
              {editId === r.id ? (
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditId(null); }} style={inputStyle} />
              ) : (
                <div onClick={() => startEdit(r)} style={{ flex: 1, minWidth: 0, fontSize: d.body, fontWeight: 500, color: MG_INK, cursor: 'pointer' }}>{r.name}</div>
              )}
              <span style={{ fontSize: d.small, color: MG_SUB, whiteSpace: 'nowrap' }}>{r.count} item{r.count === 1 ? '' : 's'}</span>
              {editId === r.id ? (
                <button onMouseDown={(e) => e.preventDefault()} onClick={commit} style={{ border: 'none', background: 'transparent', color: MG_TEAL, fontSize: d.small + 1, fontWeight: 700, padding: '4px 6px', cursor: 'pointer' }}>Done</button>
              ) : (
                <button onClick={() => del(r.id)} title="Delete" style={{ border: 'none', background: 'transparent', color: '#C2CBD4', padding: 5, cursor: 'pointer' }}><Icon name="trash-2" size={16} /></button>
              )}
            </div>
          ))}
          {/* add row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
            <Icon name="plus" size={17} style={{ color: MG_TEAL, flexShrink: 0 }} />
            <input value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="Add a room…" style={inputStyle} />
            {adding.trim() && <button onClick={add} style={{ border: 'none', background: MG_TEAL, color: '#fff', borderRadius: 9, padding: '6px 12px', fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}>Add</button>}
          </div>
        </div>
        <p style={{ fontSize: d.small + 0.5, color: MG_SUB, lineHeight: 1.45, paddingLeft: 2 }}>Tap a room to rename it. Deleting a room moves its items to “No room”.</p>
      </div>
    </Screen>
  );
}

// ── Custom tasks: categories, schedules, data ────────────────────────────────
const CT_CATS = {
  'Home':     { icon: 'house',        fg: '#1B6B5A', bg: '#EAF3EF' },
  'HVAC':     { icon: 'wind',         fg: '#1B6B5A', bg: '#EAF3EF' },
  'Outdoor':  { icon: 'trees',        fg: '#5B7A3A', bg: '#ECF4E6' },
  'Pest':     { icon: 'bug',          fg: '#9A6B3A', bg: '#FBF1E6' },
  'Safety':   { icon: 'shield-check', fg: '#C2410C', bg: '#FBF1EC' },
  'Seasonal': { icon: 'snowflake',    fg: '#3A6EA5', bg: '#E8F1F7' },
  'Admin':    { icon: 'file-text',    fg: '#6B7280', bg: '#F1F3F5' },
};
const CT_CAT_LIST = Object.keys(CT_CATS);
function ctCat(c) { return CT_CATS[c] || CT_CATS.Home; }
const CT_SCHEDULES = ['One-time', 'Weekly', 'Monthly', 'Every 3 months', 'Every 6 months', 'Yearly', 'As needed'];
const CT_ROLLING = ['Weekly', 'Monthly', 'Every 3 months', 'Every 6 months', 'Yearly'];
const CT_SEASONS = [
  { k: 'spring', label: 'Spring', icon: 'flower-2' },
  { k: 'summer', label: 'Summer', icon: 'sun' },
  { k: 'fall', label: 'Fall', icon: 'leaf' },
  { k: 'winter', label: 'Winter', icon: 'snowflake' },
];
const CT_AREAS = ['Whole home', 'Yard', 'Exterior', 'Garage', 'Basement', 'Kitchen', 'Bathroom', 'Bedroom'];

// Catalog shares the unified upkeep model (defined in hh-advanced.jsx), so the
// Settings list and the Home “Home upkeep” slice never drift apart. Each row
// carries its cadence model (recur + every/season) plus a derived sched label.
const CT_SEED = [
  ...HH_UPKEEP.map((t) => ({ id: t.id, title: t.title, cat: t.cat, sched: upSched(t), area: t.area, recur: t.recur, every: t.every, season: t.season })),
  { id: 'ct3', title: 'Mow & edge the lawn', cat: 'Outdoor', sched: 'Weekly', area: 'Yard', recur: 'rolling', every: 'Weekly' },
];

// Profile-tagged suggestion pool. own: 'own' | 'rent' | 'both'.
const CT_SUGGEST = [
  { title: 'Replace smoke-alarm batteries', cat: 'Safety', sched: 'Yearly', own: 'both', types: ['house', 'apartment', 'condo', 'townhouse'], age: ['new', 'mid', 'old'] },
  { title: 'Clean the dryer vent', cat: 'Safety', sched: 'Yearly', own: 'both', types: ['house', 'apartment', 'condo', 'townhouse'], age: ['new', 'mid', 'old'] },
  { title: 'Replace the HVAC filter', cat: 'Home', sched: 'Every 3 months', own: 'both', types: ['house', 'condo', 'townhouse'], age: ['new', 'mid', 'old'] },
  { title: 'Schedule pest control', cat: 'Pest', sched: 'Every 3 months', own: 'both', types: ['house', 'townhouse'], age: ['new', 'mid', 'old'] },
  { title: 'Clean the gutters', cat: 'Outdoor', sched: 'Every 6 months', own: 'own', types: ['house', 'townhouse'], age: ['new', 'mid', 'old'] },
  { title: 'Winterize outdoor faucets', cat: 'Seasonal', sched: 'Yearly', own: 'own', types: ['house', 'townhouse'], age: ['new', 'mid', 'old'] },
  { title: 'Service the furnace', cat: 'Home', sched: 'Yearly', own: 'own', types: ['house', 'condo', 'townhouse'], age: ['mid', 'old'] },
  { title: 'Flush the water heater', cat: 'Home', sched: 'Yearly', own: 'own', types: ['house', 'condo', 'townhouse'], age: ['mid', 'old'] },
  { title: 'Test the sump pump', cat: 'Home', sched: 'Yearly', own: 'own', types: ['house', 'townhouse'], age: ['mid', 'old'] },
  { title: 'Inspect the roof', cat: 'Outdoor', sched: 'Yearly', own: 'own', types: ['house', 'townhouse'], age: ['old'] },
  { title: 'Check for drafts & weatherstrip', cat: 'Seasonal', sched: 'Yearly', own: 'both', types: ['house', 'apartment', 'condo', 'townhouse'], age: ['old'] },
  { title: 'Reseal the deck', cat: 'Outdoor', sched: 'Yearly', own: 'own', types: ['house', 'townhouse'], age: ['new', 'mid', 'old'] },
  { title: 'Review renter’s insurance', cat: 'Admin', sched: 'Yearly', own: 'rent', types: ['house', 'apartment', 'condo', 'townhouse'], age: ['new', 'mid', 'old'] },
  { title: 'Log issues for the landlord', cat: 'Admin', sched: 'As needed', own: 'rent', types: ['house', 'apartment', 'condo', 'townhouse'], age: ['new', 'mid', 'old'] },
];

const CT_TYPES = [{ k: 'house', label: 'House' }, { k: 'apartment', label: 'Apt' }, { k: 'condo', label: 'Condo' }, { k: 'townhouse', label: 'Townhouse' }];
const CT_AGES = [{ k: 'new', label: 'Under 10 yrs' }, { k: 'mid', label: '10–40 yrs' }, { k: 'old', label: '40+ yrs' }];
function ctProfileLabel(p) {
  const own = p.own === 'own' ? 'Owned' : 'Rented';
  const type = (CT_TYPES.find((t) => t.k === p.type) || {}).label || p.type;
  const age = (CT_AGES.find((a) => a.k === p.age) || {}).label || p.age;
  return `${own} · ${type} · ${age}`;
}
function ctSuggestFor(p, existingTitles) {
  return CT_SUGGEST.filter((s) =>
    (s.own === 'both' || s.own === p.own) &&
    s.types.includes(p.type) &&
    s.age.includes(p.age) &&
    !existingTitles.includes(s.title)
  );
}

// ── Profile editor (shared by both options) ──────────────────────────────────
function CtProfileEditor({ d, profile, onChange }) {
  const Seg = ({ value, options, onPick }) => (
    <div style={{ display: 'flex', background: '#E7EAE9', borderRadius: 11, padding: 3, gap: 2 }}>
      {options.map((o) => {
        const on = value === o.k;
        return <button key={o.k} onClick={() => onPick(o.k)} style={{ flex: 1, border: 'none', borderRadius: 9, padding: '8px 4px', background: on ? '#fff' : 'transparent', color: on ? MG_INK : MG_SUB, fontSize: d.small + 0.5, fontWeight: on ? 700 : 500, boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer' }}>{o.label}</button>;
      })}
    </div>
  );
  const Lbl = ({ children }) => <div style={{ fontSize: 11, fontWeight: 700, color: MG_SUB, letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 0 7px 2px' }}>{children}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap + 2 }}>
      <div><Lbl>Do you own or rent?</Lbl><Seg value={profile.own} options={[{ k: 'own', label: 'I own' }, { k: 'rent', label: 'I rent' }]} onPick={(v) => onChange({ ...profile, own: v })} /></div>
      <div><Lbl>Property type</Lbl><Seg value={profile.type} options={CT_TYPES} onPick={(v) => onChange({ ...profile, type: v })} /></div>
      <div><Lbl>How old is it?</Lbl><Seg value={profile.age} options={CT_AGES} onPick={(v) => onChange({ ...profile, age: v })} /></div>
    </div>
  );
}

function SuggestCard({ d, s, onAdd }) {
  const cm = ctCat(s.cat);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: d.radius - 4, padding: d.cardPad, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
      <ItemGlyph icon={cm.icon} size={d.tap + 8} bg={cm.bg} fg={cm.fg} radius={11} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: d.body, fontWeight: 700, color: MG_INK, letterSpacing: -0.2 }}>{s.title}</div>
        <div style={{ fontSize: d.small, color: MG_SUB, marginTop: 2 }}>{s.cat} · {s.sched}</div>
      </div>
      <button onClick={onAdd} style={{ flexShrink: 0, width: d.tap + 6, height: d.tap + 6, borderRadius: '50%', border: '1.5px solid rgba(27,107,90,0.3)', background: '#fff', color: MG_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="plus" size={18} strokeWidth={2.6} /></button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// OPTION A — manager with inline smart suggestions
// ════════════════════════════════════════════════════════════════════════════
function CustomTasksManager({ d, onBack, tasks, profile, onAddTask, onDeleteTask, onEditTask, onProfile, onPlan }) {
  const [editProfile, setEditProfile] = useMgS(false);
  const [showAll, setShowAll] = useMgS(false);
  const existing = tasks.map((t) => t.title);
  const suggestions = ctSuggestFor(profile, existing);
  const shown = showAll ? suggestions : suggestions.slice(0, 4);

  return (
    <Screen bg={MG_BG} padBottom={20}>
      <MgBar d={d} onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: `2px ${d.pad}px 0` }}>
        <MgTitle d={d}>Custom tasks</MgTitle>

        {/* profile-tuned banner */}
        <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden', marginBottom: d.stack }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: d.cardPad }}>
            <div style={{ width: d.tap + 6, height: d.tap + 6, borderRadius: 11, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="sparkles" size={18} style={{ color: MG_TEAL }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: d.small, color: MG_SUB }}>Suggestions tuned for</div>
              <div style={{ fontSize: d.body, fontWeight: 700, color: MG_INK, letterSpacing: -0.2 }}>{ctProfileLabel(profile)}</div>
            </div>
            <button onClick={() => setEditProfile((v) => !v)} style={{ border: 'none', background: 'transparent', color: MG_TEAL, fontSize: d.small + 1, fontWeight: 700, padding: 4, cursor: 'pointer' }}>{editProfile ? 'Done' : 'Edit'}</button>
          </div>
          {editProfile && <div style={{ borderTop: '0.5px solid rgba(15,23,42,0.07)', padding: d.cardPad, background: '#FBFCFC' }}><CtProfileEditor d={d} profile={profile} onChange={onProfile} /></div>}
        </div>

        {/* suggestions */}
        {suggestions.length > 0 && (
          <div style={{ marginBottom: d.stack }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9, paddingLeft: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: MG_SUB, letterSpacing: 0.6, textTransform: 'uppercase' }}>Suggested for your home</span>
              <button onClick={onPlan} style={{ border: 'none', background: 'transparent', color: MG_TEAL, fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Build a plan</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
              {shown.map((s) => <SuggestCard key={s.title} d={d} s={s} onAdd={() => onAddTask({ id: 'ct-' + Date.now() + Math.random().toString(36).slice(2, 5), title: s.title, cat: s.cat, sched: s.sched, area: 'Whole home' })} />)}
            </div>
            {suggestions.length > 4 && <button onClick={() => setShowAll((v) => !v)} style={{ width: '100%', marginTop: d.gap, border: 'none', background: 'transparent', color: MG_TEAL, fontSize: d.small + 1, fontWeight: 700, padding: '8px 0', cursor: 'pointer' }}>{showAll ? 'Show fewer' : `Show all ${suggestions.length}`}</button>}
          </div>
        )}

        {/* your tasks */}
        <div style={{ fontSize: 12, fontWeight: 700, color: MG_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>Your custom tasks · {tasks.length}</div>
        {tasks.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', padding: d.cardPad, fontSize: d.small + 1, color: MG_SUB, lineHeight: 1.45 }}>None yet — add a suggestion above, or create your own.</div>
        ) : (
          <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
            {tasks.map((t, i) => {
              const cm = ctCat(t.cat);
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>
                  <button onClick={() => onEditTask(t.id)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ width: d.tap, height: d.tap, borderRadius: 9, background: cm.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={cm.icon} size={16} style={{ color: cm.fg }} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: d.body, fontWeight: 600, color: MG_INK, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                      <div style={{ fontSize: d.small, color: MG_SUB, marginTop: 1 }}>{t.sched} · {t.area}</div>
                    </div>
                  </button>
                  <button onClick={() => onDeleteTask(t.id)} title="Delete" style={{ border: 'none', background: 'transparent', color: '#C2CBD4', padding: 5, cursor: 'pointer' }}><Icon name="trash-2" size={16} /></button>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={() => onEditTask('new')} style={{ width: '100%', marginTop: d.stack, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1.5px dashed rgba(15,23,42,0.2)', background: '#fff', color: MG_TEAL, borderRadius: d.radius - 4, padding: '15px 0', fontSize: d.body, fontWeight: 700, cursor: 'pointer' }}>
          <Icon name="plus" size={17} /> Create a custom task
        </button>
        <div style={{ height: d.pad }} />
      </div>
    </Screen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// OPTION B — guided starter plan (3 questions → bulk add)
// ════════════════════════════════════════════════════════════════════════════
function CustomTaskPlanner({ d, profile, existingTitles, onBack, onProfile, onAddMany }) {
  const [step, setStep] = useMgS(0);
  const [picked, setPicked] = useMgS(null); // null until we reach review → array of titles
  const suggestions = ctSuggestFor(profile, existingTitles);
  const sel = picked || suggestions.map((s) => s.title);
  const toggle = (title) => setPicked((p) => { const cur = p || suggestions.map((s) => s.title); return cur.includes(title) ? cur.filter((x) => x !== title) : [...cur, title]; });

  return (
    <Screen bg={MG_BG} padTop={SB_H} padBottom={0}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `4px ${d.pad - 6}px 12px` }}>
        <button onClick={step === 0 ? onBack : () => setStep(0)} style={{ border: 'none', background: 'transparent', color: MG_TEAL, padding: '6px', display: 'flex', cursor: 'pointer' }}><Icon name={step === 0 ? 'x' : 'chevron-left'} size={24} strokeWidth={2.2} /></button>
        <span style={{ fontSize: d.body + 1, fontWeight: 700, color: MG_INK }}>Build a starter plan</span>
      </div>

      {step === 0 ? (
        <React.Fragment>
          <div style={{ flex: 1, overflowY: 'auto', padding: `6px ${d.pad}px 120px` }}>
            <h1 style={{ fontSize: d.big - 3, fontWeight: 800, color: MG_INK, letterSpacing: -0.5, margin: '0 0 6px', lineHeight: 1.15 }}>Tell us about your home</h1>
            <p style={{ fontSize: d.body, color: MG_SUB, margin: `0 0 ${d.stack}px`, lineHeight: 1.45 }}>Three quick questions and we’ll line up the upkeep that actually applies to you.</p>
            <CtProfileEditor d={d} profile={profile} onChange={onProfile} />
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(239,241,240,0.95)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
            <div style={{ textAlign: 'center', fontSize: d.small + 1, color: MG_SUB, marginBottom: 10 }}><strong style={{ color: MG_INK }}>{suggestions.length} task{suggestions.length === 1 ? '' : 's'}</strong> match your home</div>
            <button onClick={() => setStep(1)} style={{ width: '100%', border: 'none', background: MG_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}><Icon name="sparkles" size={18} /> See my plan</button>
          </div>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <div style={{ flex: 1, overflowY: 'auto', padding: `6px ${d.pad}px 120px` }}>
            <h1 style={{ fontSize: d.big - 3, fontWeight: 800, color: MG_INK, letterSpacing: -0.5, margin: '0 0 6px' }}>Your starter plan</h1>
            <p style={{ fontSize: d.body, color: MG_SUB, margin: `0 0 ${d.stack}px`, lineHeight: 1.45 }}>Tuned for {ctProfileLabel(profile)}. Untick anything you’d rather skip.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
              {suggestions.map((s) => {
                const on = sel.includes(s.title);
                const cm = ctCat(s.cat);
                return (
                  <button key={s.title} onClick={() => toggle(s.title)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `1.5px solid ${on ? MG_TEAL : 'rgba(15,23,42,0.10)'}`, borderRadius: d.radius - 4, padding: d.cardPad, cursor: 'pointer' }}>
                    <div style={{ width: d.tap, height: d.tap, borderRadius: 9, background: cm.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={cm.icon} size={16} style={{ color: cm.fg }} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: d.body, fontWeight: 700, color: MG_INK, letterSpacing: -0.2 }}>{s.title}</div>
                      <div style={{ fontSize: d.small, color: MG_SUB, marginTop: 1 }}>{s.cat} · {s.sched}</div>
                    </div>
                    <span style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${on ? MG_TEAL : '#CBD5E1'}`, background: on ? MG_TEAL : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{on && <Icon name="check" size={13} strokeWidth={3} style={{ color: '#fff' }} />}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(239,241,240,0.95)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
            <button onClick={() => onAddMany(suggestions.filter((s) => sel.includes(s.title)))} style={{ width: '100%', border: 'none', background: sel.length ? MG_TEAL : '#C9D4D0', color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: sel.length ? 'pointer' : 'default' }}><Icon name="check" size={18} strokeWidth={2.6} /> Add {sel.length} task{sel.length === 1 ? '' : 's'}</button>
          </div>
        </React.Fragment>
      )}
    </Screen>
  );
}

// ── Custom task editor (non-item-specific) ───────────────────────────────────
function CustomTaskEditor({ d, task, onBack, onSave, onDelete }) {
  const editing = !!task;
  const [title, setTitle] = useMgS(task ? task.title : '');
  const [cat, setCat] = useMgS(task ? task.cat : 'Home');
  const initSeasonal = task ? (task.recur === 'seasonal' || /^Each /.test(task.sched || '')) : false;
  const [recur, setRecur] = useMgS(initSeasonal ? 'seasonal' : 'rolling');
  const [every, setEvery] = useMgS(task && task.every ? task.every : (initSeasonal ? 'Every 6 months' : (task ? task.sched : 'Monthly')));
  const [season, setSeason] = useMgS(task && task.season ? task.season : 'fall');
  const [area, setArea] = useMgS(task ? task.area : 'Whole home');
  const sched = recur === 'seasonal' ? `Each ${season}` : every;

  const fieldStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(15,23,42,0.14)', borderRadius: 11, padding: '12px 13px', fontFamily: 'inherit', fontSize: d.body, color: MG_INK, outline: 'none', background: '#fff' };
  const Lbl = ({ children }) => <div style={{ fontSize: 11, fontWeight: 700, color: MG_SUB, letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 0 8px 2px' }}>{children}</div>;
  const save = () => onSave({ id: task ? task.id : 'ct-' + Date.now(), title: title || 'Untitled task', cat, sched, recur, every, season, area });

  return (
    <Screen bg={MG_BG} padBottom={20}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `4px ${d.pad - 2}px 10px` }}>
        <button onClick={onBack} style={{ border: 'none', background: 'transparent', color: MG_SUB, fontSize: d.body, fontWeight: 500, padding: '6px 2px', cursor: 'pointer' }}>Cancel</button>
        <span style={{ fontSize: d.body, fontWeight: 700, color: MG_INK }}>{editing ? 'Edit task' : 'New custom task'}</span>
        <button onClick={save} style={{ border: 'none', background: 'transparent', color: MG_TEAL, fontSize: d.body, fontWeight: 700, padding: '6px 2px', cursor: 'pointer' }}>Save</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.gap}px ${d.pad}px 0`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        <div><Lbl>Task</Lbl><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Schedule pest control" style={fieldStyle} /></div>
        <div>
          <Lbl>Category</Lbl>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {CT_CAT_LIST.map((c) => { const on = cat === c; const cm = ctCat(c); return <button key={c} onClick={() => setCat(c)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1.5px solid ${on ? MG_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? '#E8F2EF' : '#fff', color: on ? MG_TEAL : MG_INK, borderRadius: 99, padding: '8px 12px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}><Icon name={cm.icon} size={14} style={{ color: on ? MG_TEAL : cm.fg }} /> {c}</button>; })}
          </div>
        </div>
        <div>
          <Lbl>Repeats</Lbl>
          <div style={{ display: 'flex', background: '#E7EAE9', borderRadius: 11, padding: 3, gap: 2, marginBottom: d.gap + 2 }}>
            {[{ k: 'rolling', label: 'Every so often' }, { k: 'seasonal', label: 'Each season' }].map((o) => {
              const on = recur === o.k;
              return <button key={o.k} onClick={() => setRecur(o.k)} style={{ flex: 1, border: 'none', borderRadius: 9, padding: '9px 4px', background: on ? '#fff' : 'transparent', color: on ? MG_INK : MG_SUB, fontSize: d.small + 0.5, fontWeight: on ? 700 : 500, boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer' }}>{o.label}</button>;
            })}
          </div>
          {recur === 'rolling' ? (
            <React.Fragment>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {CT_ROLLING.map((s) => { const on = every === s; return <button key={s} onClick={() => setEvery(s)} style={{ border: `1.5px solid ${on ? MG_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? MG_TEAL : '#fff', color: on ? '#fff' : MG_INK, borderRadius: 99, padding: '8px 13px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}>{s}</button>; })}
              </div>
              <div style={{ fontSize: d.small, color: MG_SUB, margin: '8px 0 0 2px', lineHeight: 1.4 }}>Next date rolls forward from when you last marked it done.</div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {CT_SEASONS.map((s) => { const on = season === s.k; return <button key={s.k} onClick={() => setSeason(s.k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1.5px solid ${on ? MG_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? MG_TEAL : '#fff', color: on ? '#fff' : MG_INK, borderRadius: 99, padding: '8px 13px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}><Icon name={s.icon} size={14} style={{ color: on ? '#fff' : MG_TEAL }} /> {s.label}</button>; })}
              </div>
              <div style={{ fontSize: d.small, color: MG_SUB, margin: '8px 0 0 2px', lineHeight: 1.4 }}>Anchored to the calendar — comes due each {season}, every year.</div>
            </React.Fragment>
          )}
        </div>
        <div>
          <Lbl>Where (not an appliance)</Lbl>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {CT_AREAS.map((a) => { const on = area === a; return <button key={a} onClick={() => setArea(a)} style={{ border: `1.5px solid ${on ? MG_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? MG_TEAL : '#fff', color: on ? '#fff' : MG_INK, borderRadius: 99, padding: '8px 13px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}>{a}</button>; })}
          </div>
        </div>
        {editing && <button onClick={() => onDelete(task.id)} style={{ width: '100%', border: '1px solid rgba(220,38,38,0.25)', background: '#fff', color: '#DC2626', borderRadius: d.radius - 4, padding: '14px 0', fontSize: d.body, fontWeight: 700, marginTop: 4, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Icon name="trash-2" size={17} /> Delete task</button>}
        <div style={{ height: d.pad }} />
      </div>
    </Screen>
  );
}

// ── Connector ────────────────────────────────────────────────────────────────
function CustomTasksApp({ d, onBack, startView = 'manager' }) {
  const [tasks, setTasks] = useMgS(CT_SEED);
  const [profile, setProfile] = useMgS({ own: 'own', type: 'house', age: 'mid' });
  const [view, setView] = useMgS({ type: startView });
  const addTask = (t) => setTasks((ts) => [...ts, t]);
  const addMany = (arr) => { setTasks((ts) => [...ts, ...arr.map((s) => ({ id: 'ct-' + Date.now() + Math.random().toString(36).slice(2, 5), title: s.title, cat: s.cat, sched: s.sched, area: 'Whole home' }))]); setView({ type: 'manager' }); };

  if (view.type === 'editor') {
    const task = view.id && view.id !== 'new' ? tasks.find((t) => t.id === view.id) : null;
    return <CustomTaskEditor d={d} task={task}
      onBack={() => setView({ type: 'manager' })}
      onSave={(t) => { setTasks((ts) => ts.some((x) => x.id === t.id) ? ts.map((x) => x.id === t.id ? t : x) : [...ts, t]); setView({ type: 'manager' }); }}
      onDelete={(id) => { setTasks((ts) => ts.filter((x) => x.id !== id)); setView({ type: 'manager' }); }} />;
  }
  if (view.type === 'planner') {
    return <CustomTaskPlanner d={d} profile={profile} existingTitles={tasks.map((t) => t.title)} onBack={() => setView({ type: 'manager' })} onProfile={setProfile} onAddMany={addMany} />;
  }
  return <CustomTasksManager d={d} onBack={onBack} tasks={tasks} profile={profile}
    onAddTask={addTask} onDeleteTask={(id) => setTasks((ts) => ts.filter((t) => t.id !== id))}
    onEditTask={(id) => setView({ type: 'editor', id })} onProfile={setProfile} onPlan={() => setView({ type: 'planner' })} />;
}

Object.assign(window, { RoomsManager, CustomTasksManager, CustomTaskPlanner, CustomTaskEditor, CustomTasksApp, CT_SEED });
