// ── Homehub · Advanced surfaces ─────────────────────────────────────────────
// Things that appear only as the home grows (Standard → Advanced): recurring
// maintenance reminders, and deep-clean how-to guides. Same calm teal system.

const ADV_INK = '#0B1220', ADV_SUB = '#6B7280', ADV_TEAL = '#1B6B5A', ADV_GOLD = '#8A5A12';

// ── Unified home-upkeep model ────────────────────────────────────────────────
// One object powers both surfaces: the Settings catalog (“Custom tasks”) and
// the Home “Home upkeep” slice. A task is just a scheduled, recurring, home-
// level job. The only real variation is how its next date is computed:
//   · rolling  — a fixed interval from when it was last done (“every 3 months”)
//   · seasonal — anchored to a time of year (“each fall”), calendar-pinned
// “Seasonal” is therefore a cadence + a category tag, never a separate system.
const UP_CATS = {
  Safety:  { icon: 'shield-check',   fg: '#8A5A12', bg: '#FBF3E2' },
  HVAC:    { icon: 'wind',           fg: '#1B6B5A', bg: '#EAF3EF' },
  Pest:    { icon: 'bug',            fg: '#7A5B3A', bg: '#F4EFE9' },
  Outdoor: { icon: 'trees',          fg: '#5B7A3A', bg: '#ECF4E6' },
  Home:    { icon: 'house',          fg: '#1B6B5A', bg: '#EAF3EF' },
};
function upCat(c) { return UP_CATS[c] || UP_CATS.Home; }
// schedule label from the cadence model
function upSched(t) { return t.recur === 'seasonal' ? `Each ${t.season}` : t.every; }
function upDueLabel(due) {
  if (due <= 0) return 'Due now';
  if (due <= 10) return `Due in ${due} days`;
  if (due <= 45) return `Due in ${Math.round(due / 7)} wks`;
  return `Due in ${Math.round(due / 30)} mo`;
}

const HH_UPKEEP = [
  { id: 'up1', title: 'Test smoke & CO alarms', cat: 'Safety', recur: 'rolling', every: 'Every 6 months', area: 'Whole home', due: 12 },
  { id: 'up2', title: 'Service the furnace', cat: 'HVAC', recur: 'seasonal', season: 'fall', area: 'Whole home', due: 38 },
  { id: 'up3', title: 'Quarterly pest control', cat: 'Pest', recur: 'rolling', every: 'Every 3 months', area: 'Whole home', due: 26 },
];
// Suggestions not yet on the schedule — surfaced on Home as one-tap adds.
const HH_UPKEEP_SUGGEST = [
  { id: 'us1', title: 'Clean the dryer vent', cat: 'Safety', recur: 'rolling', every: 'Yearly', area: 'Whole home', due: 60 },
  { id: 'us2', title: 'Winterize outdoor faucets', cat: 'Outdoor', recur: 'seasonal', season: 'fall', area: 'Exterior', due: 44 },
];
// Legacy export kept so anything still reading HH_MAINT keeps working.
const HH_MAINT = HH_UPKEEP.map((t) => ({ name: t.title, freq: upSched(t), icon: upCat(t.cat).icon, when: upDueLabel(t.due) }));

const HH_GUIDES = [
  { name: 'Deep-clean the oven', mins: 45, icon: 'flame' },
  { name: 'Descale the kettle', mins: 20, icon: 'droplets' },
  { name: 'Refresh the washer', mins: 30, icon: 'washing-machine' },
];

// Appears at Standard+ — the due-soon slice of home upkeep, now LIVE: each row
// can be checked off (reschedules) or snoozed, exactly like an appliance task.
// Plus a suggestion the home likely needs, addable to the schedule in one tap.
function HomeUpkeep({ d, onManage }) {
  const [items, setItems] = React.useState(
    HH_UPKEEP.filter((t) => t.due <= 50).sort((a, b) => a.due - b.due).map((t) => ({ ...t }))
  );
  const [doneIds, setDoneIds] = React.useState([]);
  const [suggestIdx, setSuggestIdx] = React.useState(0);
  const [adding, setAdding] = React.useState(false);
  const suggestion = HH_UPKEEP_SUGGEST[suggestIdx];

  const complete = (id) => setDoneIds((x) => x.includes(id) ? x.filter((n) => n !== id) : [...x, id]);
  const snooze = (id) => setItems((xs) => xs.map((t) => t.id === id ? { ...t, due: t.due + 14 } : t).sort((a, b) => a.due - b.due));
  const addSuggestion = () => {
    setItems((xs) => [...xs, { ...suggestion }].sort((a, b) => a.due - b.due));
    setAdding(false);
    setSuggestIdx((i) => i + 1);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9, paddingLeft: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: ADV_SUB, letterSpacing: 0.6, textTransform: 'uppercase' }}>Home upkeep</span>
        <button onClick={onManage} style={{ border: 'none', background: 'transparent', fontSize: d.small, color: ADV_TEAL, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Manage</button>
      </div>
      <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
        {items.map((m, i) => {
          const cm = upCat(m.cat);
          const done = doneIds.includes(m.id);
          const seasonal = m.recur === 'seasonal';
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none', opacity: done ? 0.6 : 1 }}>
              <button onClick={() => complete(m.id)} aria-label="Mark done" style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', flexShrink: 0, display: 'flex', marginTop: 1 }}>
                <span style={{ width: 24, height: 24, borderRadius: 12, border: `2px solid ${done ? ADV_TEAL : 'rgba(15,23,42,0.22)'}`, background: done ? ADV_TEAL : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{done && <Icon name="check" size={13} strokeWidth={3} style={{ color: '#fff' }} />}</span>
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: d.body, fontWeight: 600, color: ADV_INK, letterSpacing: -0.2, lineHeight: 1.25, textDecoration: done ? 'line-through' : 'none', textWrap: 'pretty' }}>
                  {seasonal && <Icon name="leaf" size={13} style={{ color: ADV_GOLD, marginRight: 5, verticalAlign: '-2px' }} />}{m.title}
                </div>
                <div style={{ fontSize: d.small, color: done ? ADV_SUB : (m.due <= 10 ? ADV_GOLD : ADV_SUB), marginTop: 3 }}>
                  {done ? 'Done' : `${upSched(m)} · ${upDueLabel(m.due)}`}
                </div>
              </div>
              {!done && (
                <button onClick={() => snooze(m.id)} aria-label="Snooze 2 weeks" title="Snooze 2 weeks" style={{ border: 'none', background: 'transparent', color: '#8A93A0', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: -8, marginRight: -8 }}><Icon name="alarm-clock" size={18} /></button>
              )}
            </div>
          );
        })}

        {/* suggestion → add to schedule */}
        {suggestion && (
          <div style={{ borderTop: '0.5px solid rgba(15,23,42,0.07)', background: '#FBFCFB' }}>
            {!adding ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px` }}>
                <div style={{ width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}><Icon name="sparkles" size={16} style={{ color: ADV_TEAL }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: d.body, fontWeight: 600, color: ADV_INK, letterSpacing: -0.2, lineHeight: 1.25, textWrap: 'pretty' }}>{suggestion.title}</div>
                  <div style={{ fontSize: d.small, color: ADV_SUB, marginTop: 3 }}>Suggested · {upSched(suggestion)}</div>
                </div>
                <button onClick={() => setAdding(true)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, border: '1.5px solid rgba(27,107,90,0.3)', background: '#fff', color: ADV_TEAL, borderRadius: 99, padding: '7px 13px', fontSize: d.small + 0.5, fontWeight: 700, cursor: 'pointer', marginTop: -1 }}><Icon name="plus" size={14} strokeWidth={2.6} /> Add</button>
              </div>
            ) : (
              <div style={{ padding: `${d.cardPad}px` }}>
                <div style={{ fontSize: d.small + 1, color: ADV_INK, fontWeight: 600, marginBottom: 8 }}>Add “{suggestion.title}” to your schedule?</div>
                <div style={{ fontSize: d.small, color: ADV_SUB, marginBottom: 12 }}>Repeats {upSched(suggestion).toLowerCase()} · {suggestion.area}</div>
                <div style={{ display: 'flex', gap: d.gap }}>
                  <button onClick={addSuggestion} style={{ flex: 1, border: 'none', background: ADV_TEAL, color: '#fff', borderRadius: 11, padding: '11px 0', fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}>Add to schedule</button>
                  <button onClick={() => setAdding(false)} style={{ border: '1.5px solid rgba(15,23,42,0.14)', background: '#fff', color: ADV_INK, borderRadius: 11, padding: '11px 16px', fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}>Not now</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Back-compat alias — older callers used MaintenanceReminders.
function MaintenanceReminders({ d, onManage }) { return <HomeUpkeep d={d} onManage={onManage} />; }

// Appears at Advanced — comprehensive cleaning guides as a browsable rail.
function DeepCleanGuides({ d, onOpen }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9, paddingLeft: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: ADV_SUB, letterSpacing: 0.6, textTransform: 'uppercase' }}>Deep-clean guides</span>
        <button onClick={onOpen} style={{ border: 'none', background: 'transparent', fontSize: d.small, color: ADV_TEAL, fontWeight: 600, cursor: 'pointer', padding: 0 }}>All</button>
      </div>
      <div style={{ display: 'flex', gap: d.gap, overflowX: 'auto', margin: `0 -${d.pad}px`, padding: `2px ${d.pad}px` }}>
        {HH_GUIDES.map((g) => (
          <button key={g.name} onClick={onOpen} style={{ flexShrink: 0, width: 132, textAlign: 'left', border: 'none', background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', padding: d.cardPad - 1, cursor: 'pointer' }}>
            <div style={{ width: d.tap + 8, height: d.tap + 8, borderRadius: 12, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 11 }}><Icon name={g.icon} size={20} style={{ color: ADV_TEAL }} /></div>
            <div style={{ fontSize: d.body - 0.5, fontWeight: 700, color: ADV_INK, letterSpacing: -0.2, lineHeight: 1.2 }}>{g.name}</div>
            <div style={{ fontSize: d.small, color: ADV_SUB, marginTop: 4 }}>{g.mins} min guide</div>
          </button>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { HomeUpkeep, MaintenanceReminders, DeepCleanGuides, HH_MAINT, HH_UPKEEP, HH_UPKEEP_SUGGEST, UP_CATS, upCat, upSched, upDueLabel, HH_GUIDES });
