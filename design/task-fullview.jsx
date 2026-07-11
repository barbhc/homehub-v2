// ── Homehub · Task full-view explorations ───────────────────────────────────
// Three directions for the "Open full view" task screen, each enriching the
// inline how-to with: depth (troubleshooting, manual link, recurrence), doing-
// it affordances (checkable steps, add-to-list, reassign / snooze / skip), and
// the user's own notes. No timer. Same calm teal system as the app.
//   A · Do-it mode      — action-first; progress + big checkable steps
//   B · Reference       — info-first; everything visible, scannable
//   C · Sectioned tabs  — tidy; Steps / Fix it / Details

const { useState: useFvS } = React;
const FV_INK = '#0B1220', FV_SUB = '#6B7280', FV_TEAL = '#1B6B5A', FV_FAINT = '#9AA6A2', FV_AMBER = '#B4791F';

const FV_MEMBERS = [
  { id: 'barb', name: 'Barb', initials: 'BH' },
  { id: 'dave', name: 'Dave', initials: 'DH' },
  { id: 'maya', name: 'Maya', initials: 'MH' },
];
// Per-task notes + recurrence (mock — would be user data).
const FV_NOTES = {
  s1: 'Filters are in the garage cabinet, top shelf. The 16×25×1 3-pack from the hardware store is cheaper than ordering online.',
};
const FV_RECUR = {
  s1: { every: 'Every 90 days', next: 'Sep 12' },
  s2: { every: 'Twice a year', next: 'Nov 3' },
  s3: { every: 'Monthly', next: 'Aug 14' },
};

function fvTask(taskId) {
  const task = HH_TASKS.find((t) => t.id === taskId) || HH_TASKS[0];
  return { task, item: hhItem(task.item), det: hhDetail(task.id), ex: itemExtras(task.item) };
}

// ── shared atoms ─────────────────────────────────────────────────────────────
function FvNav({ d, onBack = () => {}, title = 'Today', right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `2px ${d.pad - 6}px 8px` }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: FV_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 4px', cursor: 'pointer' }}>
        <Icon name="chevron-left" size={22} strokeWidth={2.4} /> {title}
      </button>
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

function FvLabel({ children, style }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: FV_SUB, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 9, ...style }}>{children}</div>;
}

function FvWhy({ d, text }) {
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#F1F5F4', borderRadius: 12, padding: '11px 13px' }}>
      <Icon name="info" size={15} style={{ color: FV_TEAL, marginTop: 1, flexShrink: 0 }} />
      <span style={{ fontSize: d.small + 1, color: '#3A4A45', lineHeight: 1.45, textWrap: 'pretty' }}>{text}</span>
    </div>
  );
}

// Supplies with an "add to shopping list" affordance.
function FvSupplies({ d, supplies }) {
  const [added, setAdded] = useFvS(false);
  if (!supplies || !supplies.length) return null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <FvLabel style={{ marginBottom: 0 }}>You’ll need</FvLabel>
        <button onClick={() => setAdded((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: added ? FV_TEAL : FV_TEAL, fontSize: d.small + 0.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
          <Icon name={added ? 'check' : 'plus'} size={14} strokeWidth={2.6} /> {added ? 'Added to list' : 'Add to list'}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {supplies.map((s) => (
          <span key={s.name} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, border: `1px solid ${added ? 'rgba(27,107,90,0.3)' : 'rgba(15,23,42,0.12)'}`, background: added ? '#EAF3EF' : '#fff', borderRadius: 10, padding: '7px 11px', fontSize: d.small + 1, color: FV_INK, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {s.name}{s.spec && <span style={{ color: FV_SUB, fontWeight: 500 }}>· {s.spec}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

// Steps — read mode (numbered) or checkable (tick as you go), controllable.
function FvSteps({ d, steps, checkable, done, toggle, hideLabel }) {
  const [local, setLocal] = useFvS([]);
  const checked = done || local;
  const flip = toggle || ((i) => setLocal((x) => x.includes(i) ? x.filter((n) => n !== i) : [...x, i]));
  return (
    <div>
      {!hideLabel && <FvLabel>{checkable ? 'Steps — tick as you go' : 'Steps'}</FvLabel>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
        {steps.map((s, i) => {
          const on = checked.includes(i);
          return (
            <div key={i} onClick={checkable ? () => flip(i) : undefined} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', cursor: checkable ? 'pointer' : 'default' }}>
              <span style={{ width: 23, height: 23, borderRadius: checkable ? 12 : 7, flexShrink: 0, marginTop: 1, border: `2px solid ${on ? FV_TEAL : 'rgba(15,23,42,0.18)'}`, background: on ? FV_TEAL : checkable ? 'transparent' : '#EAF3EF', color: on ? '#fff' : FV_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700 }}>
                {on ? <Icon name="check" size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span style={{ flex: 1, fontSize: d.body, color: on ? FV_SUB : '#26302D', lineHeight: 1.4, textDecoration: on ? 'line-through' : 'none', textWrap: 'pretty', paddingTop: 1 }}>{s}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FvManualCard({ d, manual, onOpen, compact }) {
  if (!manual) return null;
  if (compact) {
    return (
      <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, border: '1px solid rgba(15,23,42,0.10)', background: '#fff', borderRadius: 12, padding: '11px 13px', cursor: 'pointer' }}>
        <Icon name="book-open" size={16} style={{ color: FV_TEAL, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: d.small + 1, color: FV_INK, fontWeight: 600 }}>{manual.src}</span>
        <span style={{ fontSize: d.small, color: FV_TEAL, fontWeight: 700, whiteSpace: 'nowrap' }}>Open ›</span>
      </button>
    );
  }
  return (
    <div style={{ borderLeft: `3px solid ${FV_TEAL}`, background: '#EEF4F2', borderRadius: '0 12px 12px 0', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <Icon name="book-open" size={14} style={{ color: FV_TEAL }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, color: FV_TEAL, letterSpacing: 0.5, textTransform: 'uppercase' }}>From your manual</span>
      </div>
      <div style={{ fontSize: d.body, color: '#2B3A36', lineHeight: 1.45, fontStyle: 'italic' }}>“{manual.quote}”</div>
      <button onClick={onOpen} style={{ marginTop: 9, display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: '#fff', color: FV_TEAL, borderRadius: 9, padding: '8px 12px', fontSize: d.small + 0.5, fontWeight: 700, cursor: 'pointer' }}>
        <Icon name="external-link" size={13} /> Open {manual.src}
      </button>
    </div>
  );
}

// "If it goes wrong" — reuses the app's Troubleshoot accordion when available.
function FvTrouble({ d, items, onOpenManual, startOpen }) {
  if (!items || !items.length) return null;
  if (typeof Troubleshoot !== 'undefined') {
    return <Troubleshoot d={d} items={items} onFix={() => {}} onOpenManual={onOpenManual} />;
  }
  return null;
}

function FvNote({ d, note }) {
  const [editing, setEditing] = useFvS(false);
  if (!note && !editing) {
    return (
      <button onClick={() => setEditing(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', border: '1.5px dashed rgba(15,23,42,0.18)', background: 'transparent', color: FV_SUB, borderRadius: 12, padding: '11px 15px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}>
        <Icon name="sticky-note" size={15} style={{ color: FV_TEAL }} /> Add a note
      </button>
    );
  }
  return (
    <div style={{ background: '#FBFCF8', border: '1px solid #E6ECD9', borderRadius: 14, padding: '13px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, color: '#7C8A5A', letterSpacing: 0.5, textTransform: 'uppercase' }}><Icon name="sticky-note" size={13} /> Your note</div>
        <button style={{ border: 'none', background: 'transparent', color: FV_TEAL, fontSize: d.small + 0.5, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
      </div>
      <div style={{ fontSize: d.body, color: '#3A4030', lineHeight: 1.45, textWrap: 'pretty' }}>{note}</div>
    </div>
  );
}

// Assignee row with a quick reassign picker.
function FvAssign({ d, big }) {
  const [who, setWho] = useFvS('barb');
  const [open, setOpen] = useFvS(false);
  const cur = FV_MEMBERS.find((m) => m.id === who);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, border: '1px solid rgba(15,23,42,0.10)', background: '#fff', borderRadius: 13, padding: big ? '13px 15px' : '11px 13px', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ width: 30, height: 30, borderRadius: 15, background: '#EAF3EF', color: FV_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{cur.initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: FV_SUB, letterSpacing: 0.4, textTransform: 'uppercase' }}>Assigned to</div>
          <div style={{ fontSize: d.body, fontWeight: 700, color: FV_INK }}>{cur.name}</div>
        </div>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} style={{ color: FV_FAINT }} />
      </button>
      {open && (
        <div style={{ marginTop: 7, border: '1px solid rgba(15,23,42,0.10)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          {FV_MEMBERS.map((m, i) => (
            <button key={m.id} onClick={() => { setWho(m.id); setOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', border: 'none', borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none', background: m.id === who ? '#F4F8F6' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 26, height: 26, borderRadius: 13, background: '#EAF3EF', color: FV_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{m.initials}</div>
              <span style={{ flex: 1, fontSize: d.body, fontWeight: 600, color: FV_INK }}>{m.name}</span>
              {m.id === who && <Icon name="check" size={16} strokeWidth={2.6} style={{ color: FV_TEAL }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Recurrence chip-row.
function FvRecur({ d, taskId }) {
  const r = FV_RECUR[taskId] || FV_RECUR.s1;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: '11px 13px' }}>
      <Icon name="repeat" size={16} style={{ color: FV_TEAL, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: d.small + 1, color: FV_INK, fontWeight: 600 }}>Repeats {r.every.toLowerCase()}</span>
      <span style={{ fontSize: d.small + 0.5, color: FV_SUB }}>Next: {r.next}</span>
    </div>
  );
}

// Sticky action bar with a secondary overflow (snooze / skip / reassign).
function FvSticky({ d, onMore, more, onComplete }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(12px + env(safe-area-inset-bottom))`, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.08)' }}>
      {more && (
        <div style={{ display: 'flex', gap: d.gap, marginBottom: 10 }}>
          {[['alarm-clock', 'Snooze'], ['skip-forward', 'Skip'], ['user-round', 'Reassign']].map(([ic, l]) => (
            <button key={l} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1px solid rgba(15,23,42,0.12)', background: '#fff', color: FV_INK, borderRadius: 12, padding: '11px 0', fontSize: d.small + 0.5, fontWeight: 700, cursor: 'pointer' }}>
              <Icon name={ic} size={15} /> {l}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: d.gap }}>
        <button onClick={onComplete} style={{ flex: 1, border: 'none', background: FV_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
          <Icon name="check" size={18} strokeWidth={2.6} /> Mark done
        </button>
        <button onClick={onMore} style={{ border: '1.5px solid rgba(15,23,42,0.14)', background: '#fff', color: FV_INK, borderRadius: 14, padding: '15px 17px', fontSize: d.body + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
          <Icon name={more ? 'chevron-down' : 'ellipsis'} size={18} />
        </button>
      </div>
    </div>
  );
}

// ── Completion: confirm the next date (P2-7 option B) ────────────────────────
const FV_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FV_INT_DAYS = { 'Weekly': 7, 'Monthly': 30, 'Every 3 months': 91, 'Every 6 months': 182, 'Yearly': 365 };
const FV_SEASON_MONTH = { spring: 2, summer: 5, fall: 8, winter: 11 };
function fvFmt(dt) { return `${FV_MONTHS[dt.getMonth()]} ${dt.getDate()}`; }
function fvAddDays(base, n) { const x = new Date(base); x.setDate(x.getDate() + n); return x; }
function fvNextDate(task, base = new Date()) {
  if (task && task.recur === 'seasonal') {
    const m = FV_SEASON_MONTH[task.season] ?? 8;
    let dt = new Date(base.getFullYear(), m, 15);
    if (dt <= base) dt = new Date(base.getFullYear() + 1, m, 15);
    return dt;
  }
  return fvAddDays(base, FV_INT_DAYS[(task && task.every)] || 91);
}
function fvRel(dt, base = new Date()) {
  const days = Math.round((dt - base) / 86400000);
  if (days <= 0) return 'today';
  if (days < 14) return `in ${days} days`;
  if (days < 56) return `in ${Math.round(days / 7)} weeks`;
  if (days < 365) return `in ${Math.round(days / 30)} months`;
  return 'in a year';
}
// Bottom sheet shown on Mark done — review/adjust the computed next date.
function FvConfirmDone({ d, task, onClose, onConfirm }) {
  const [whenDone, setWhenDone] = useFvS('today');
  const [bump, setBump] = useFvS(0);
  const seasonal = task && task.recur === 'seasonal';
  const base = whenDone === 'today' ? new Date() : fvAddDays(new Date(), -5);
  const next = fvAddDays(fvNextDate(task, base), bump * 7);
  return (
    <React.Fragment>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(8,12,11,0.4)', zIndex: 40 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 41, background: '#fff', borderRadius: '20px 20px 0 0', padding: `18px ${d.pad}px calc(18px + env(safe-area-inset-bottom))`, boxShadow: '0 -8px 30px rgba(0,0,0,0.18)' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(15,23,42,0.15)', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ width: 30, height: 30, borderRadius: 15, background: FV_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="check" size={17} strokeWidth={3} style={{ color: '#fff' }} /></span>
          <div style={{ fontSize: d.big - 5, fontWeight: 800, color: FV_INK, letterSpacing: -0.4 }}>Nice work</div>
        </div>
        <div style={{ fontSize: d.small + 1, color: FV_SUB, marginBottom: 16 }}>When did you do it?</div>
        <div style={{ display: 'flex', gap: 9, marginBottom: 18 }}>
          {[['today', 'Today'], ['earlier', 'A few days ago']].map(([k, l]) => (
            <button key={k} onClick={() => setWhenDone(k)} style={{ flex: 1, border: `1.5px solid ${whenDone === k ? FV_TEAL : 'rgba(15,23,42,0.14)'}`, background: whenDone === k ? '#EAF3EF' : '#fff', color: whenDone === k ? FV_TEAL : FV_INK, borderRadius: 12, padding: '12px 0', fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F4F6F5', borderRadius: 14, padding: '14px 16px', marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: FV_SUB, letterSpacing: 0.4, textTransform: 'uppercase' }}>Next due{seasonal ? ' · seasonal' : ''}</div>
            <div style={{ fontSize: d.body + 3, fontWeight: 800, color: FV_TEAL, letterSpacing: -0.4, marginTop: 2 }}>{fvFmt(next)} · {fvRel(next)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setBump((b) => b - 1)} aria-label="Earlier" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid rgba(15,23,42,0.14)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="minus" size={16} /></button>
            <button onClick={() => setBump((b) => b + 1)} aria-label="Later" style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid rgba(15,23,42,0.14)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={16} /></button>
          </div>
        </div>
        <button onClick={onConfirm} style={{ width: '100%', border: 'none', background: FV_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, cursor: 'pointer' }}>Confirm</button>
      </div>
    </React.Fragment>
  );
}

function FvHeader({ d, task, item, big }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <ItemGlyph icon={item.icon} size={d.tap + (big ? 26 : 18)} bg="#EAF3EF" fg={FV_TEAL} radius={big ? 16 : 13} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <TierChip tier={task.tier} d={d} />
          <h1 style={{ fontSize: d.big - (big ? 2 : 4), fontWeight: 800, color: FV_INK, letterSpacing: -0.5, lineHeight: 1.1, margin: '8px 0 0', textWrap: 'balance' }}>{task.name}</h1>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 14, fontSize: d.small + 1, color: FV_SUB }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="clock" size={15} /> {fvTask(task.id).det.time} min</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="map-pin" size={15} /> {item.name} · {item.room}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="calendar" size={15} /> {dueLabel(task.due)}</span>
      </div>
    </div>
  );
}

// Reuse TierChip if global, else a local fallback.
function TierChip({ tier, d }) {
  const tc = TIER[tier];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: tc.soft, color: tc.dot, borderRadius: 99, padding: '4px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: tc.dot }} />{tc.label}
    </span>
  );
}

Object.assign(window, { fvTask, FvNav, FvLabel, FvWhy, FvSupplies, FvSteps, FvManualCard, FvTrouble, FvNote, FvAssign, FvRecur, FvSticky, FvHeader, FvConfirmDone, fvNextDate, fvFmt, fvRel });
