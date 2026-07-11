// ── Homehub · Smart Add — parse & review (simplified) ───────────────────────
// The desktop flow reviews raw chunks AND tasks in an editor — heavy. These are
// calmer takes on "we read your manual, here's what we'll set up": from a light
// summary, to a tasks-only confirm, to a near-zero-friction auto with a peek.

const { useState: usePrS } = React;

const PR_INK = '#0B1220', PR_SUB = '#6B7280', PR_TEAL = '#1B6B5A', PR_BG = '#F3F5F4';

const PARSE_TASKS = [
  { id: 'p1', name: 'Replace the water filter', freq: 'Every 6 months', tier: 'essential' },
  { id: 'p2', name: 'Clean the condenser coils', freq: 'Twice a year', tier: 'essential' },
  { id: 'p3', name: 'Replace the air filter', freq: 'Every 6 months', tier: 'recommended' },
];
const PARSE_CARE = ['Wipe the door gaskets monthly', 'Keep 1 in. clearance for airflow', 'Run fresh water after a filter change', 'Vacuum the rear vents seasonally'];
const PARSE_TROUBLE = ['Water dispenses slowly', 'Ice tastes off', 'Fridge runs warm', 'Door won’t seal'];
const PARSE_SPECS = [{ k: 'Capacity', v: '30 cu ft' }, { k: 'Width', v: '35.75 in' }, { k: 'Energy use', v: '643 kWh/yr' }, { k: 'Water filter', v: 'LT1000P' }];
const PARSE_COUNTS = { care: PARSE_CARE.length, trouble: 4, specs: 8 };

function PrBar({ d, onBack, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `2px ${d.pad - 6}px 8px`, borderBottom: '0.5px solid rgba(15,23,42,0.06)' }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: PR_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 4px', cursor: 'pointer' }}><Icon name="chevron-left" size={22} strokeWidth={2.4} /> Add item</button>
      <span style={{ fontSize: d.body, fontWeight: 700, color: PR_INK }}>{title}</span>
      <div style={{ width: 64 }} />
    </div>
  );
}
function PrTitle({ d, k, sub }) {
  return (
    <div style={{ marginBottom: d.stack }}>
      <h1 style={{ fontSize: d.big - 2, fontWeight: 800, color: PR_INK, letterSpacing: -0.5, margin: 0, lineHeight: 1.12 }}>{k}</h1>
      {sub && <p style={{ fontSize: d.body, color: PR_SUB, margin: '6px 0 0', lineHeight: 1.4 }}>{sub}</p>}
    </div>
  );
}
function PrCTA({ d, label, onClick, icon }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(243,245,244,0.95)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
      <button onClick={onClick} style={{ width: '100%', border: 'none', background: PR_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>{icon && <Icon name={icon} size={18} strokeWidth={2.6} />} {label}</button>
    </div>
  );
}

// ── Parsing progress (shared) ────────────────────────────────────────────────
function ParseProgress({ d }) {
  const steps = [{ t: 'Uploaded', done: true }, { t: 'Reading the manual', active: true }, { t: 'Pulling out tasks & guides', done: false }];
  return (
    <Screen bg="#FFFFFF" padTop={SB_H} padBottom={0}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `0 ${d.pad + 8}px` }}>
        <div style={{ position: 'relative', width: 70, height: 70, marginBottom: 26 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid rgba(27,107,90,0.18)', borderTopColor: PR_TEAL, animation: 'prspin 0.9s linear infinite' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="file-text" size={28} style={{ color: PR_TEAL }} /></div>
        </div>
        <h1 style={{ fontSize: d.h2 + 2, fontWeight: 800, color: PR_INK, letterSpacing: -0.3, margin: 0 }}>Reading your manual…</h1>
        <p style={{ fontSize: d.body, color: PR_SUB, margin: '8px 0 24px' }}>This takes a few seconds.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignSelf: 'stretch', padding: `0 ${d.pad}px` }}>
          {steps.map((s) => (
            <div key={s.t} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              {s.done ? <Icon name="check-circle" size={20} style={{ color: PR_TEAL }} />
                : s.active ? <div style={{ width: 18, height: 18, borderRadius: 9, border: '2px solid rgba(27,107,90,0.25)', borderTopColor: PR_TEAL, animation: 'prspin 0.8s linear infinite' }} />
                : <div style={{ width: 18, height: 18, borderRadius: 9, border: '2px solid #D6DBDA' }} />}
              <span style={{ fontSize: d.body, color: s.done || s.active ? PR_INK : '#9AA6A2', fontWeight: s.active ? 600 : 500 }}>{s.t}</span>
            </div>
          ))}
        </div>
      </div>
      <style>{'@keyframes prspin{to{transform:rotate(360deg)}}'}</style>
    </Screen>
  );
}

// ── Task toggle row (shared by summary + tasks variants) ─────────────────────
function PrTaskRow({ d, t, on, onToggle, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: last ? 'none' : '0.5px solid rgba(15,23,42,0.07)', opacity: on ? 1 : 0.5 }}>
      <button onClick={onToggle} style={{ width: d.tap, height: d.tap, borderRadius: d.tap / 2, flexShrink: 0, border: `2px solid ${on ? PR_TEAL : '#CBD5E1'}`, background: on ? PR_TEAL : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>{on && <Icon name="check" size={15} strokeWidth={3} style={{ color: '#fff' }} />}</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: d.body, fontWeight: 600, color: PR_INK, letterSpacing: -0.2, textDecoration: on ? 'none' : 'line-through' }}>{t.name}</div>
        <div style={{ fontSize: d.small, color: PR_SUB, marginTop: 2 }}>{TIER[t.tier].label}</div>
      </div>
      <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid rgba(15,23,42,0.12)', background: '#fff', borderRadius: 99, padding: '5px 10px', fontSize: d.small, fontWeight: 600, color: PR_INK, cursor: 'pointer', whiteSpace: 'nowrap' }}>{t.freq} <Icon name="chevron-down" size={12} style={{ color: '#9AA6A2' }} /></button>
    </div>
  );
}

function CountCard({ d, icon, label, count, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid rgba(15,23,42,0.07)', borderRadius: d.radius - 4, padding: `${d.rowPy}px ${d.cardPad}px` }}>
      <div style={{ width: d.tap + 4, height: d.tap + 4, borderRadius: 10, background: '#EEF2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={18} style={{ color: PR_TEAL }} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: d.body, fontWeight: 600, color: PR_INK }}>{count} {label}</div>
        <div style={{ fontSize: d.small, color: PR_SUB, marginTop: 1 }}>{note}</div>
      </div>
      <Icon name="check" size={18} style={{ color: PR_TEAL }} />
    </div>
  );
}

// variant: 'summary' | 'tasks' | 'auto'
function ParseReview({ d, variant = 'summary', onBack, onDone }) {
  const [off, setOff] = usePrS([]);
  const [open, setOpen] = usePrS(false);
  const toggle = (id) => setOff((o) => o.includes(id) ? o.filter((x) => x !== id) : [...o, id]);
  const kept = PARSE_TASKS.length - off.length;

  // ── C · auto (lowest friction) ──
  if (variant === 'auto') {
    return (
      <Screen bg="#FFFFFF" padTop={SB_H} padBottom={0}>
        <PrBar d={d} onBack={onBack} title="From your manual" />
        <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 100px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: d.stack }}>
            <div style={{ width: d.tap + 16, height: d.tap + 16, borderRadius: '50%', background: '#E8F2EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="check" size={24} strokeWidth={2.8} style={{ color: PR_TEAL }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: d.h2 + 2, fontWeight: 800, color: PR_INK, letterSpacing: -0.3, margin: 0, lineHeight: 1.1 }}>Read your LG manual</h1>
              <div style={{ fontSize: d.small + 1, color: PR_SUB, marginTop: 3 }}>Everything’s set up for you.</div>
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: d.radius - 4, overflow: 'hidden' }}>
            {[['list-checks', '3 maintenance tasks', 'Scheduled & tracked'], ['book-open', '4 care tips', 'On the item’s Guides tab'], ['wrench', '4 fixes', 'Troubleshooting added'], ['file-text', '8 specs', 'Pulled from the manual']].map((r, i, a) => (
              <div key={r[1]} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: i === a.length - 1 ? 'none' : '0.5px solid rgba(15,23,42,0.07)' }}>
                <Icon name={r[0]} size={18} style={{ color: PR_TEAL, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: d.body, fontWeight: 600, color: PR_INK }}>{r[1]}</span>
                <span style={{ fontSize: d.small, color: PR_SUB }}>{r[2]}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setOpen((v) => !v)} style={{ width: '100%', marginTop: d.gap + 2, border: '1px solid rgba(15,23,42,0.12)', background: '#fff', borderRadius: 12, padding: '12px 0', fontSize: d.small + 1, fontWeight: 700, color: PR_TEAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
            {open ? 'Hide details' : 'Review the tasks'} <Icon name={open ? 'chevron-up' : 'chevron-down'} size={15} />
          </button>
          {open && (
            <div style={{ marginTop: d.gap, background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: d.radius - 4, overflow: 'hidden' }}>
              {PARSE_TASKS.map((t, i) => <PrTaskRow key={t.id} d={d} t={t} on={!off.includes(t.id)} onToggle={() => toggle(t.id)} last={i === PARSE_TASKS.length - 1} />)}
            </div>
          )}
        </div>
        <PrCTA d={d} label="Done" onClick={onDone} />
      </Screen>
    );
  }

  // ── B · tasks-only confirm ──
  if (variant === 'tasks') {
    return (
      <Screen bg={PR_BG} padTop={SB_H} padBottom={0}>
        <PrBar d={d} onBack={onBack} title="Review tasks" />
        <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 100px` }}>
          <PrTitle d={d} k="Set up these tasks?" sub="We pulled these from your LG manual. Untoggle any you don’t want, or tap a schedule to tweak it." />
          <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
            {PARSE_TASKS.map((t, i) => <PrTaskRow key={t.id} d={d} t={t} on={!off.includes(t.id)} onToggle={() => toggle(t.id)} last={i === PARSE_TASKS.length - 1} />)}
          </div>
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: d.stack, padding: `0 2px` }}>
            <Icon name="info" size={15} style={{ color: '#9AA6A2', marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: d.small + 0.5, color: PR_SUB, lineHeight: 1.45 }}>Care tips, troubleshooting and specs are saved to the item automatically — no review needed.</span>
          </div>
        </div>
        <PrCTA d={d} label={kept === 0 ? 'Skip for now' : `Set up ${kept} task${kept === 1 ? '' : 's'}`} icon={kept === 0 ? null : 'check'} onClick={onDone} />
      </Screen>
    );
  }

  // ── A · summary → full review & edit (parsing can be wrong on the first pass) ──
  return <ParseReviewSummary d={d} onBack={onBack} onDone={onDone} />;
}

// ── A · editable review ──────────────────────────────────────────────────────
function EditStrRow({ d, value, onRemove, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `${d.rowPy - 2}px ${d.cardPad}px`, borderBottom: last ? 'none' : '0.5px solid rgba(15,23,42,0.07)' }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: d.small + 1.5, color: '#26302D', lineHeight: 1.35 }}>{value}</div>
      <button onClick={onRemove} style={{ border: 'none', background: 'transparent', padding: 4, cursor: 'pointer', flexShrink: 0 }}><Icon name="x" size={15} style={{ color: '#9AA6A2' }} /></button>
    </div>
  );
}
function AddRow({ d, label, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: `${d.rowPy - 1}px ${d.cardPad}px`, borderTop: '0.5px solid rgba(15,23,42,0.07)', color: PR_TEAL, cursor: 'pointer' }}>
      <Icon name="plus" size={16} /><span style={{ fontSize: d.small + 1, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function ParseReviewSummary({ d, onBack, onDone }) {
  const FREQS = ['Every 3 months', 'Every 6 months', 'Twice a year', 'Yearly'];
  const TIERS = ['essential', 'recommended', 'optional'];
  const [tasks, setTasks] = usePrS(PARSE_TASKS.map((t) => ({ ...t, on: true, check: t.id === 'p3' })));
  const [editId, setEditId] = usePrS(null);
  const [care, setCare] = usePrS(PARSE_CARE.slice());
  const [trouble, setTrouble] = usePrS(PARSE_TROUBLE.slice());
  const [specs, setSpecs] = usePrS(PARSE_SPECS.slice());
  const [grp, setGrp] = usePrS(null);
  const patch = (id, p) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const remove = (id) => { setTasks((ts) => ts.filter((t) => t.id !== id)); setEditId(null); };
  const kept = tasks.filter((t) => t.on).length;

  const Chips = ({ options, value, onPick, labelOf }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
      {options.map((o) => {
        const on = value === o;
        return <button key={o} onClick={() => onPick(o)} style={{ border: `1px solid ${on ? PR_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? PR_TEAL : '#fff', color: on ? '#fff' : PR_INK, borderRadius: 99, padding: '7px 12px', fontSize: d.small, fontWeight: 600, cursor: 'pointer' }}>{labelOf ? labelOf(o) : o}</button>;
      })}
    </div>
  );

  const GroupCard = ({ id, icon, label, items, set, kv }) => {
    const open = grp === id;
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.07)', borderRadius: d.radius - 4, overflow: 'hidden' }}>
        <div onClick={() => setGrp(open ? null : id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, cursor: 'pointer' }}>
          <div style={{ width: d.tap + 2, height: d.tap + 2, borderRadius: 9, background: '#EEF2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={17} style={{ color: PR_TEAL }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: d.body, fontWeight: 600, color: PR_INK }}>{items.length} {label}</div>
            <div style={{ fontSize: d.small, color: PR_SUB, marginTop: 1 }}>Saved to the item · tap to review</div>
          </div>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} style={{ color: '#94A3B8' }} />
        </div>
        {open && (
          <div style={{ borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
            {kv
              ? items.map((s, i) => (
                <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `${d.rowPy - 2}px ${d.cardPad}px`, borderBottom: i === items.length - 1 ? 'none' : '0.5px solid rgba(15,23,42,0.07)' }}>
                  <span style={{ fontSize: d.small + 1, color: PR_SUB, width: 96, flexShrink: 0 }}>{s.k}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: d.small + 1.5, color: PR_INK, fontWeight: 600 }}>{s.v}</span>
                  <button onClick={() => set(items.filter((_, j) => j !== i))} style={{ border: 'none', background: 'transparent', padding: 4, cursor: 'pointer' }}><Icon name="x" size={15} style={{ color: '#9AA6A2' }} /></button>
                </div>
              ))
              : items.map((s, i) => <EditStrRow key={i} d={d} value={s} onRemove={() => set(items.filter((_, j) => j !== i))} last={false} />)}
            <AddRow d={d} label={`Add ${kv ? 'a spec' : 'one'}`} onClick={() => set(kv ? [...items, { k: 'New', v: '—' }] : [...items, 'New note'])} />
          </div>
        )}
      </div>
    );
  };

  return (
    <Screen bg={PR_BG} padTop={SB_H} padBottom={0}>
      <PrBar d={d} onBack={onBack} title="Review & edit" />
      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 100px` }}>
        <PrTitle d={d} k="Here’s what we found" sub="We read your LG manual automatically. Give it a quick check — fix or remove anything that looks off." />

        {/* parsing caveat */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#FBF7EF', border: '1px solid #EFE6CE', borderRadius: d.radius - 4, padding: `${d.rowPy}px ${d.cardPad}px`, marginBottom: d.stack }}>
          <Icon name="scan-search" size={18} style={{ color: '#9A7B3A', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: d.small + 0.5, color: '#5A5046', lineHeight: 1.4 }}>Auto-reading isn’t perfect. Everything here is editable — tap to adjust, or remove what doesn’t belong.</span>
        </div>

        {/* tasks — editable */}
        <div style={{ fontSize: 12, fontWeight: 700, color: PR_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>Upkeep tasks · {kept} on</div>
        <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden', marginBottom: d.stack }}>
          {tasks.map((t, i) => {
            const open = editId === t.id;
            return (
              <div key={t.id} style={{ borderBottom: i === tasks.length - 1 ? 'none' : '0.5px solid rgba(15,23,42,0.07)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, opacity: t.on ? 1 : 0.5 }}>
                  <button onClick={() => patch(t.id, { on: !t.on })} style={{ width: d.tap, height: d.tap, borderRadius: d.tap / 2, flexShrink: 0, border: `2px solid ${t.on ? PR_TEAL : '#CBD5E1'}`, background: t.on ? PR_TEAL : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>{t.on && <Icon name="check" size={15} strokeWidth={3} style={{ color: '#fff' }} />}</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: d.body, fontWeight: 600, color: PR_INK, letterSpacing: -0.2, textDecoration: t.on ? 'none' : 'line-through' }}>{t.name}</span>
                      {t.check && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: '#9A7B3A', background: '#FAF1DE', borderRadius: 99, padding: '2px 7px' }}>Check this</span>}
                    </div>
                    <div style={{ fontSize: d.small, color: PR_SUB, marginTop: 2 }}>{t.freq} · {TIER[t.tier].label}</div>
                  </div>
                  <button onClick={() => setEditId(open ? null : t.id)} style={{ width: d.tap, height: d.tap, borderRadius: 9, border: `1px solid ${open ? PR_TEAL : 'rgba(15,23,42,0.12)'}`, background: open ? '#EAF3EF' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}><Icon name="pencil" size={15} style={{ color: open ? PR_TEAL : '#64748B' }} /></button>
                </div>
                {open && (
                  <div style={{ padding: `2px ${d.cardPad}px ${d.cardPad}px`, background: '#FBFCFC', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: d.small, fontWeight: 600, color: PR_SUB, marginBottom: 6 }}>Task name</div>
                      <div style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.14)', borderRadius: 10, padding: '10px 12px', fontSize: d.body, color: PR_INK }}>{t.name}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: d.small, fontWeight: 600, color: PR_SUB, marginBottom: 7 }}>How often</div>
                      <Chips options={FREQS} value={t.freq} onPick={(v) => patch(t.id, { freq: v })} />
                    </div>
                    <div>
                      <div style={{ fontSize: d.small, fontWeight: 600, color: PR_SUB, marginBottom: 7 }}>Priority</div>
                      <Chips options={TIERS} value={t.tier} onPick={(v) => patch(t.id, { tier: v })} labelOf={(o) => TIER[o].label} />
                    </div>
                    <button onClick={() => remove(t.id)} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: '#DC2626', fontSize: d.small + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 0', cursor: 'pointer' }}><Icon name="trash-2" size={15} /> Remove task</button>
                  </div>
                )}
              </div>
            );
          })}
          <AddRow d={d} label="Add a task" onClick={() => setTasks((ts) => [...ts, { id: 'p' + (ts.length + 1) + Date.now(), name: 'New task', freq: 'Every 6 months', tier: 'recommended', on: true }])} />
        </div>

        {/* also saved — reviewable & editable */}
        <div style={{ fontSize: 12, fontWeight: 700, color: PR_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>Also saved to the item</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
          <GroupCard id="care" icon="book-open" label="care tips" items={care} set={setCare} />
          <GroupCard id="trouble" icon="wrench" label="fixes" items={trouble} set={setTrouble} />
          <GroupCard id="specs" icon="file-text" label="specs" items={specs} set={setSpecs} kv />
        </div>
      </div>
      <PrCTA d={d} label="Add to LG Refrigerator" icon="check" onClick={onDone} />
    </Screen>
  );
}

Object.assign(window, { ParseProgress, ParseReview, PARSE_TASKS });
