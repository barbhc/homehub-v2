// ── Homehub · Saved answers (folded into the item page) ──────────────────────
// Not a standalone library — the care-guide knowledge now lives ON each item:
// answers you save from Ask, lines pulled from its manual, and notes you jot,
// all scoped to that item and tagged by source. Surfaces: SavedAnswers (a
// section inside Item detail) + AddTipSheet (locked to the item).

const { useState: useCgS } = React;

const CG_INK = '#0B1220', CG_SUB = '#6B7280', CG_TEAL = '#1B6B5A', CG_BG = '#F3F5F4';

// Where each saved answer came from — honest provenance, lightly worn.
const CG_SRC = {
  manual: { icon: 'book-open', label: 'From the manual', fg: '#1B6B5A', bg: '#E8F2EF' },
  ai:     { icon: 'sparkles',  label: 'Saved from Ask',  fg: '#1B6B5A', bg: '#E8F2EF' },
  you:    { icon: 'user',      label: 'Your note',       fg: '#6B7280', bg: '#F1F3F5' },
  web:    { icon: 'globe',     label: 'From the web',    fg: '#5B748F', bg: '#F1F5F8' },
};

// Seed knowledge, scoped per item.
const CG_SEED = [
  { id: 'k1', q: 'How often should I replace the filter?', a: 'Every 90 days under normal use — every 30–60 with pets or allergies. Check it monthly during peak heating and cooling.', item: 'hvac', source: 'manual' },
  { id: 'k2', q: 'What water filter does it take?', a: 'An LG LT1000P. Replace it every 6 months, or when the dispenser indicator turns on.', item: 'fridge', source: 'manual' },
  { id: 'k3', q: 'Why does the ice taste off after a filter change?', a: 'A fresh filter sheds carbon at first. Discard the first batch of ice and wash the bin.', item: 'fridge', source: 'ai' },
  { id: 'k6', q: 'Getting the musty smell out', a: 'Run a monthly tub-clean cycle, wipe the door gasket, and leave the door ajar between loads.', item: 'washer', source: 'ai' },
  { id: 'k7', q: 'Won’t drain — first things to check', a: 'Clean the filter at the bottom of the tub and check the drain hose for kinks before calling service.', item: 'dish', source: 'manual' },
];
function itemSaved(id, all) { return (all || CG_SEED).filter((e) => e.item === id); }

// ════════════════════════════════════════════════════════════════════════════
// SAVED ANSWERS — a section embedded in Item detail (no Screen chrome)
// ════════════════════════════════════════════════════════════════════════════
function SavedAnswers({ d, entries, onAsk, onAdd, onDelete }) {
  const [open, setOpen] = useCgS(null);

  if (!entries.length) {
    return (
      <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', padding: d.cardPad }}>
        <div style={{ fontSize: d.small + 1, color: CG_SUB, lineHeight: 1.45 }}>Nothing saved yet. Save a good answer from Ask, or jot a note you don’t want to forget.</div>
        <div style={{ display: 'flex', gap: 8, marginTop: d.gap + 2 }}>
          <button onClick={onAsk} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: CG_TEAL, color: '#fff', borderRadius: 10, padding: '9px 13px', fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}><Icon name="sparkles" size={14} /> Ask Homehub</button>
          <button onClick={onAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1.5px solid rgba(15,23,42,0.14)', background: '#fff', color: CG_INK, borderRadius: 10, padding: '9px 13px', fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}><Icon name="plus" size={14} /> Add a note</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
      {entries.map((e) => {
        const on = open === e.id;
        const sc = CG_SRC[e.source] || CG_SRC.you;
        return (
          <div key={e.id} style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
            <button onClick={() => setOpen(on ? null : e.id)} style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: d.cardPad, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: d.body, fontWeight: 700, color: CG_INK, letterSpacing: -0.2, lineHeight: 1.3, textWrap: 'pretty' }}>{e.q}</div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: sc.bg, color: sc.fg, borderRadius: 99, padding: '3px 8px', fontSize: 10, fontWeight: 700, letterSpacing: 0.2, marginTop: 7 }}><Icon name={sc.icon} size={10} /> {sc.label}</span>
                </div>
                <Icon name={on ? 'chevron-up' : 'chevron-down'} size={18} style={{ color: '#94A3B8', flexShrink: 0, marginTop: 2 }} />
              </div>
            </button>
            {on && (
              <div style={{ padding: `0 ${d.cardPad}px ${d.cardPad}px` }}>
                <div style={{ fontSize: d.body, color: '#26302D', lineHeight: 1.5, textWrap: 'pretty' }}>{e.a}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: d.gap + 2 }}>
                  <button onClick={onAsk} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid rgba(15,23,42,0.12)', background: '#fff', color: CG_INK, borderRadius: 10, padding: '7px 11px', fontSize: d.small + 0.5, fontWeight: 600, cursor: 'pointer' }}><Icon name="sparkles" size={13} style={{ color: CG_TEAL }} /> Ask a follow-up</button>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => onDelete(e.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: '#B4BEC8', borderRadius: 10, padding: '7px 8px', fontSize: d.small + 0.5, fontWeight: 600, cursor: 'pointer' }}><Icon name="trash-2" size={14} /> Remove</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Add a note (locked to one item when opened from its page) ────────────────
function AddTipSheet({ d, lockItem, onBack, onSave }) {
  const [q, setQ] = useCgS('');
  const [a, setA] = useCgS('');
  const fieldStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(15,23,42,0.14)', borderRadius: 11, padding: '12px 13px', fontFamily: 'inherit', fontSize: d.body, color: CG_INK, outline: 'none', background: '#fff' };
  const Lbl = ({ children }) => <div style={{ fontSize: 11, fontWeight: 700, color: CG_SUB, letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 0 8px 2px' }}>{children}</div>;
  const it = lockItem ? hhItem(lockItem) : null;
  const save = () => onSave({ id: 'k-' + Date.now(), q: q || 'Untitled note', a, item: lockItem, source: 'you' });

  return (
    <Screen bg={CG_BG} padBottom={20}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `4px ${d.pad - 2}px 10px` }}>
        <button onClick={onBack} style={{ border: 'none', background: 'transparent', color: CG_SUB, fontSize: d.body, fontWeight: 500, padding: '6px 2px', cursor: 'pointer' }}>Cancel</button>
        <span style={{ fontSize: d.body, fontWeight: 700, color: CG_INK }}>Add a note</span>
        <button onClick={save} style={{ border: 'none', background: 'transparent', color: CG_TEAL, fontSize: d.body, fontWeight: 700, padding: '6px 2px', cursor: 'pointer' }}>Save</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.gap}px ${d.pad}px 0`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        {it && (
          <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 7, background: '#E8F2EF', color: CG_TEAL, borderRadius: 99, padding: '6px 12px', fontSize: d.small + 1, fontWeight: 600 }}>
            <Icon name={it.icon} size={14} /> Saving to {it.name}
          </div>
        )}
        <div>
          <Lbl>Question or title</Lbl>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Where’s the reset button?" style={fieldStyle} />
        </div>
        <div>
          <Lbl>The answer</Lbl>
          <textarea value={a} onChange={(e) => setA(e.target.value)} rows={4} placeholder="Write it the way you’d want to read it later…" style={{ ...fieldStyle, resize: 'none', lineHeight: 1.5 }} />
        </div>
      </div>
    </Screen>
  );
}

Object.assign(window, { SavedAnswers, AddTipSheet, CG_SEED, CG_SRC, itemSaved });
