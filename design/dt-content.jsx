// ── Homehub · Desktop content atoms ──────────────────────────────────────────
// Shared pieces used across desktop screens: the task how-to blocks, notice
// cards, task rows. All theme-aware (read T) so they work in light + dark.

// Resolve a task's how-to detail, with graceful fallbacks for the fuller dataset.
function dtDetail(task) {
  let det = hhDetail(task.id);
  if (!det.steps || !det.steps.length) {
    const alt = HH_TASKS.find((s) => s.item === task.item);
    if (alt) det = hhDetail(alt.id);
  }
  if (!det.steps || !det.steps.length) {
    const ex = itemExtras(task.item);
    const h = ex.howto && ex.howto[0];
    det = { why: (ex.care && ex.care[0]) || '', supplies: [], time: task.mins, steps: h ? h.steps : [], manual: null };
  }
  return det;
}

function WhyNote({ T, text }) {
  if (!text) return null;
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: T.dark ? T.surface2 : '#F1F5F4', borderRadius: 12, padding: '11px 13px' }}>
      <Icon name="info" size={15} style={{ color: T.teal, marginTop: 1, flexShrink: 0 }} />
      <span style={{ fontSize: 13.5, color: T.dark ? T.sub : '#3A4A45', lineHeight: 1.45, textWrap: 'pretty' }}>{text}</span>
    </div>
  );
}

function SuppliesRow({ T, supplies }) {
  if (!supplies || !supplies.length) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>You'll need</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {supplies.map((s) => (
          <span key={s.name} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, border: `1px solid ${T.line2}`, borderRadius: 10, padding: '7px 11px', fontSize: 13, color: T.ink, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {s.name}{s.spec && <span style={{ color: T.sub, fontWeight: 500 }}>· {s.spec}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function StepsList({ T, steps, columns = 1 }) {
  const [done, setDone] = React.useState([]);
  if (!steps || !steps.length) return null;
  const toggle = (i) => setDone((x) => x.includes(i) ? x.filter((n) => n !== i) : [...x, i]);
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>Steps</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 11, columnGap: 28 }}>
        {steps.map((s, i) => {
          const on = done.includes(i);
          return (
            <div key={i} onClick={() => toggle(i)} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', cursor: 'pointer' }}>
              <span style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, marginTop: 1, border: `2px solid ${on ? T.teal : T.line2}`, background: on ? T.teal : 'transparent', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
                {on ? <Icon name="check" size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span style={{ fontSize: 14, color: on ? T.faint : T.ink, lineHeight: 1.4, textDecoration: on ? 'line-through' : 'none', textWrap: 'pretty' }}>{s}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ManualSnippet({ T, manual }) {
  if (!manual) return null;
  return (
    <div style={{ borderLeft: `3px solid ${T.teal}`, background: T.dark ? T.surface2 : '#EEF4F2', borderRadius: '0 12px 12px 0', padding: '11px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <Icon name="book-open" size={14} style={{ color: T.teal }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, color: T.teal, letterSpacing: 0.5, textTransform: 'uppercase' }}>From your manual</span>
      </div>
      <div style={{ fontSize: 14, color: T.dark ? T.ink : '#2B3A36', lineHeight: 1.45, fontStyle: 'italic' }}>“{manual.quote}”</div>
      <div style={{ fontSize: 12.5, color: T.sub, marginTop: 5 }}>{manual.src}</div>
    </div>
  );
}

// Notice card (warranty / recall) — calm tones, never alarmist.
function noticeTone(T, kind) {
  return kind === 'recall'
    ? { icon: 'megaphone', fg: T.slate, bg: T.slateSoft, label: 'Safety notice' }
    : { icon: 'shield-check', fg: T.gold, bg: T.goldSoft, label: 'Warranty' };
}
function NoticeCard({ T, n, onClick, compact }) {
  const tn = noticeTone(T, n.kind);
  if (compact) {
    return (
      <button onClick={onClick} style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 11, alignItems: 'center', background: tn.bg, border: `1px solid ${T.line}`, borderRadius: 12, padding: '11px 13px', cursor: 'pointer' }}>
        <Icon name={tn.icon} size={17} style={{ color: tn.fg, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.ink, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</span>
        <Icon name="chevron-right" size={16} style={{ color: tn.fg }} />
      </button>
    );
  }
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start', background: tn.bg, border: `1px solid ${T.line}`, borderRadius: 14, padding: 15, cursor: 'pointer' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: T.surface, border: `1px solid ${T.line}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={tn.icon} size={18} style={{ color: tn.fg }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: tn.fg, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 }}>{tn.label}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: -0.2 }}>{n.title}</div>
        <div style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.45, marginTop: 3, textWrap: 'pretty' }}>{n.body}</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 9, fontSize: 12.5, fontWeight: 700, color: tn.fg }}>{n.action} <Icon name="arrow-right" size={13} /></span>
      </div>
    </button>
  );
}

// A task row used in tables & item detail.
function TaskListRow({ T, task, showItem = true, onDone, onOpen, last }) {
  const item = hhItem(task.item);
  const overdue = task.due < 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 16px', borderTop: `1px solid ${T.line}`, position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, background: dtTier(T, task.tier).fg }} />
      <button onClick={onDone} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex' }}><CheckBox T={T} done={false} size={20} /></button>
      <div style={{ flex: 1, minWidth: 0, cursor: onOpen ? 'pointer' : 'default' }} onClick={onOpen}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, letterSpacing: -0.2 }}>{task.name}</div>
        <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>{showItem ? `${item.name} · ${item.room}` : `${task.mins} min`}</div>
      </div>
      <TierChip T={T} tier={task.tier} />
      <div style={{ width: 96, textAlign: 'right' }}><DueText T={T} due={task.due} /></div>
      <Btn T={T} kind="soft" size="sm" icon="check" onClick={onDone} style={{ padding: '7px 11px' }}>Done</Btn>
    </div>
  );
}

// ── Empty / incomplete states ────────────────────────────────────────────────
// "Good to know" only earns its place once items carry purchase details. These
// nudges replace it when there's nothing real to surface yet — encouraging the
// user to add an item, or to complete the purchase details on items they have.

// No items at all — there's nothing to track.
function GoodToKnowNoItems({ T, d, onAdd }) {
  return (
    <Card T={T} d={d} style={{ borderStyle: 'dashed', borderColor: T.line2, textAlign: 'center' }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: T.tealWash, display: 'grid', placeItems: 'center', margin: '2px auto 12px' }}>
        <Icon name="package-plus" size={22} style={{ color: T.teal }} />
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>Nothing to track yet</div>
      <div style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.5, margin: '5px 0 14px' }}>Add an item and Homehub will watch its warranty and flag any recalls — surfaced calmly, right here.</div>
      <Btn T={T} kind="soft" size="sm" icon="plus" onClick={onAdd} style={{ width: '100%' }}>Add your first item</Btn>
    </Card>
  );
}

// Items exist, but some are missing the purchase details that power warranties.
function AddDetailsNudge({ T, d, items, onAdd, onOpenItem }) {
  const n = items.length;
  return (
    <Card T={T} d={d} style={{ borderStyle: 'dashed', borderColor: T.line2 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: T.goldSoft, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="receipt" size={19} style={{ color: T.gold }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: -0.2 }}>Finish setting up {n} item{n === 1 ? '' : 's'}</div>
          <div style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.5, marginTop: 3 }}>Add a purchase date or receipt and Homehub can track {n === 1 ? 'its' : 'their'} warranty and catch recalls for you.</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '12px 0' }}>
        {items.slice(0, 3).map((it) => (
          <button key={it.id} onClick={() => onOpenItem && onOpenItem(it.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: `1px solid ${T.line}`, background: T.surface2, cursor: 'pointer', textAlign: 'left' }}>
            <ItemThumb T={T} icon={it.icon} size={30} radius={8} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.gold }}>Add details</span>
            <Icon name="chevron-right" size={15} style={{ color: T.faint }} />
          </button>
        ))}
      </div>
      <Btn T={T} kind="soft" size="sm" icon="receipt" onClick={onAdd} style={{ width: '100%' }}>Add purchase details</Btn>
    </Card>
  );
}

// Per-item rail prompt (item detail) when an item has no warranty/purchase record.
function WarrantyEmptyRail({ T, d, onAdd }) {
  return (
    <Card T={T} d={d} style={{ borderStyle: 'dashed', borderColor: T.line2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Icon name="shield-off" size={17} style={{ color: T.faint }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>No warranty on file</span>
      </div>
      <div style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.5, marginBottom: 12 }}>Add the purchase date or receipt and Homehub will track coverage and flag recalls for this item.</div>
      <Btn T={T} kind="soft" size="sm" icon="receipt" onClick={onAdd} style={{ width: '100%' }}>Add purchase details</Btn>
    </Card>
  );
}

Object.assign(window, { dtDetail, WhyNote, SuppliesRow, StepsList, ManualSnippet, noticeTone, NoticeCard, TaskListRow, GoodToKnowNoItems, AddDetailsNudge, WarrantyEmptyRail });
