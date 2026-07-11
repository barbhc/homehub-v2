// ── Homehub · Item management (manuals · troubleshooting · activity) ─────────
// The "deep" management layer that sits behind the Item-detail read views:
//   · ManualsManager — add / scan / relabel / set role / rescan / delete docs,
//     with a short parse-review of what each scan pulled out.
//   · Troubleshoot   — expandable symptom → cause → fix, backed by the manual,
//     with a "still stuck? ask Homehub" escape hatch.
//   · ActivityLog    — typed history grouped by day.
// Same calm teal system; loads after hh-items.jsx (uses itemExtras).

const { useState: useImS } = React;

const IM_INK = '#0B1220', IM_SUB = '#6B7280', IM_TEAL = '#1B6B5A', IM_BG = '#F3F5F4', IM_AMBER = '#B4791F', IM_RUST = '#C2410C';
const MANUAL_LABELS = ['Owner’s manual', 'Quick start', 'Warranty', 'Install guide', 'Spec sheet'];

// What a scan "finds" — mock counts, but enough to make the review feel real.
const REVIEW_FOUND = [
  { key: 'specs', icon: 'list', label: 'Specifications', n: 8 },
  { key: 'care', icon: 'sparkles', label: 'Care tips', n: 3 },
  { key: 'howto', icon: 'book-open', label: 'How-to guides', n: 2 },
  { key: 'trouble', icon: 'wrench', label: 'Troubleshooting', n: 4 },
];

function imStatus(d, m) {
  if (m.status === 'parsing') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: d.small, color: IM_TEAL, fontWeight: 600 }}><span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(27,107,90,0.25)', borderTopColor: IM_TEAL, animation: 'imspin .8s linear infinite' }} /> Scanning…</span>;
  if (m.status === 'failed') return <span style={{ fontSize: d.small, color: IM_RUST, fontWeight: 600 }}>Couldn’t read it — tap Rescan</span>;
  return <span style={{ fontSize: d.small, color: IM_SUB }}>Scanned · {m.pages} pages</span>;
}

// ════════════════════════════════════════════════════════════════════════════
// MANUALS MANAGER  (full-screen overlay pushed from Item detail)
// ════════════════════════════════════════════════════════════════════════════
function ManualsManager({ d, item, onClose, onOpenManual }) {
  const [manuals, setManuals] = useImS(() => itemExtras(item.id).manuals.map((m) => ({ ...m })));
  const [menuId, setMenuId] = useImS(null);
  const [view, setView] = useImS('list'); // list · add · review
  const [reviewName, setReviewName] = useImS(null);

  const patch = (name, p) => setManuals((ms) => ms.map((m) => m.name === name ? { ...m, ...p } : m));
  const rescan = (m) => { patch(m.name, { status: 'parsing' }); setMenuId(null); setTimeout(() => patch(m.name, { status: 'parsed' }), 1500); };
  const remove = (m) => { setManuals((ms) => ms.filter((x) => x.name !== m.name)); setMenuId(null); };
  const makePrimary = (m) => { setManuals((ms) => ms.map((x) => ({ ...x, role: x.name === m.name ? 'primary' : 'reference' }))); setMenuId(null); };
  const relabel = (m, label) => patch(m.name, { label });

  const addManual = ({ role, label }) => {
    const name = `${item.brand} ${item.model} — ${label}`;
    const m = { name, pages: 52, role: manuals.some((x) => x.role === 'primary') ? role : 'primary', label, status: 'parsing' };
    setManuals((ms) => [...ms, m]);
    setView('list');
    setTimeout(() => { patch(name, { status: 'parsed' }); setReviewName(name); setView('review'); }, 1600);
  };

  // ── ADD ──
  if (view === 'add') {
    return <AddManualSheet d={d} onBack={() => setView('list')} onAdd={addManual} />;
  }
  // ── REVIEW ──
  if (view === 'review') {
    return <ManualReview d={d} name={reviewName} onDone={() => setView('list')} />;
  }

  // ── LIST ──
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: IM_BG, display: 'flex', flexDirection: 'column', paddingTop: SB_H }}>
      <style>{'@keyframes imspin{to{transform:rotate(360deg)}}'}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `2px ${d.pad - 6}px 8px` }}>
        <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: IM_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 4px', cursor: 'pointer' }}>
          <Icon name="chevron-left" size={22} strokeWidth={2.4} /> {item.short || item.name}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `4px ${d.pad}px ${d.pad}px` }}>
        <h1 style={{ fontSize: d.big - 2, fontWeight: 800, color: IM_INK, letterSpacing: -0.5, margin: '0 0 3px' }}>Manuals &amp; docs</h1>
        <p style={{ fontSize: d.small + 1, color: IM_SUB, margin: '0 0 16px', lineHeight: 1.4 }}>Scanned docs power this item’s tasks, specs and fixes.</p>

        {manuals.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', padding: `${d.cardPad + 8}px ${d.cardPad}px`, textAlign: 'center', marginBottom: d.stack }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}><Icon name="file-text" size={24} style={{ color: IM_TEAL }} /></div>
            <div style={{ fontSize: d.body, fontWeight: 700, color: IM_INK }}>No manual yet</div>
            <div style={{ fontSize: d.small + 1, color: IM_SUB, marginTop: 4, lineHeight: 1.4 }}>Add one and we’ll pull out the upkeep tasks, specs and fixes automatically.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
            {manuals.map((m) => {
              const open = menuId === m.name;
              return (
                <div key={m.name} style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: d.cardPad }}>
                    <button onClick={() => m.status === 'parsed' && onOpenManual && onOpenManual(m)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: m.status === 'parsed' ? 'pointer' : 'default' }}>
                      <div style={{ width: d.tap + 6, height: d.tap + 6, borderRadius: 10, background: '#FBF1EC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="file-text" size={18} style={{ color: IM_RUST }} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: d.body - 0.5, fontWeight: 700, color: IM_INK, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
                          {m.role === 'primary' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: IM_TEAL, background: '#E8F2EF', borderRadius: 99, padding: '2px 7px' }}><Icon name="star" size={10} /> Primary</span>}
                          {imStatus(d, m)}
                        </div>
                      </div>
                    </button>
                    <button onClick={() => setMenuId(open ? null : m.name)} style={{ flexShrink: 0, border: 'none', background: open ? '#EEF2F1' : 'transparent', borderRadius: 9, color: IM_SUB, padding: 7, cursor: 'pointer' }}><Icon name="ellipsis" size={18} /></button>
                  </div>
                  {open && (
                    <div style={{ borderTop: '0.5px solid rgba(15,23,42,0.07)', padding: d.cardPad, background: '#FBFCFC', display: 'flex', flexDirection: 'column', gap: d.gap }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: IM_SUB, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 7 }}>Label</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {MANUAL_LABELS.map((l) => {
                            const on = m.label === l;
                            return <button key={l} onClick={() => relabel(m, l)} style={{ border: `1px solid ${on ? IM_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? '#E8F2EF' : '#fff', color: on ? IM_TEAL : IM_INK, borderRadius: 99, padding: '6px 11px', fontSize: d.small, fontWeight: 600, cursor: 'pointer' }}>{l}</button>;
                          })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        {m.role !== 'primary' && <button onClick={() => makePrimary(m)} style={imActionStyle(d)}><Icon name="star" size={14} /> Make primary</button>}
                        <button onClick={() => rescan(m)} style={imActionStyle(d)}><Icon name="rotate-cw" size={14} /> Rescan</button>
                        <div style={{ flex: 1 }} />
                        <button onClick={() => remove(m)} style={{ ...imActionStyle(d), color: '#DC2626', borderColor: 'rgba(220,38,38,0.22)' }}><Icon name="trash-2" size={14} /> Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button onClick={() => setView('add')} style={{ width: '100%', marginTop: d.stack, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1.5px dashed rgba(15,23,42,0.2)', background: '#fff', color: IM_TEAL, borderRadius: d.radius - 4, padding: '15px 0', fontSize: d.body, fontWeight: 700, cursor: 'pointer' }}>
          <Icon name="plus" size={17} /> Add a manual
        </button>
      </div>
    </div>
  );
}

function imActionStyle(d) {
  return { display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid rgba(15,23,42,0.14)', background: '#fff', color: IM_INK, borderRadius: 10, padding: '9px 12px', fontSize: d.small + 0.5, fontWeight: 600, cursor: 'pointer' };
}

// ── Add a manual ─────────────────────────────────────────────────────────────
function AddManualSheet({ d, onBack, onAdd }) {
  const [src, setSrc] = useImS('upload'); // upload · link
  const [role, setRole] = useImS('primary');
  const [label, setLabel] = useImS('Owner’s manual');

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 72, background: IM_BG, display: 'flex', flexDirection: 'column', paddingTop: SB_H }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `2px ${d.pad - 6}px 8px` }}>
        <button onClick={onBack} style={{ border: 'none', background: 'transparent', color: IM_SUB, fontSize: d.body, fontWeight: 600, padding: '6px 8px', cursor: 'pointer' }}>Cancel</button>
        <span style={{ fontSize: d.body, fontWeight: 700, color: IM_INK }}>Add a manual</span>
        <span style={{ width: 52 }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: `6px ${d.pad}px 110px` }}>
        {/* source */}
        <div style={{ display: 'flex', background: '#E7EAE9', borderRadius: 11, padding: 3, gap: 2, marginBottom: d.stack }}>
          {[{ k: 'upload', label: 'Upload PDF' }, { k: 'link', label: 'Paste a link' }].map((o) => {
            const on = src === o.k;
            return <button key={o.k} onClick={() => setSrc(o.k)} style={{ flex: 1, border: 'none', borderRadius: 9, padding: '9px 4px', background: on ? '#fff' : 'transparent', color: on ? IM_INK : IM_SUB, fontSize: d.small + 1, fontWeight: on ? 700 : 500, boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer' }}>{o.label}</button>;
          })}
        </div>

        {src === 'upload' ? (
          <button style={{ width: '100%', border: '1.5px dashed rgba(15,23,42,0.2)', background: '#fff', borderRadius: d.radius, padding: '34px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: d.stack }}>
            <Icon name="file-up" size={28} style={{ color: IM_TEAL }} />
            <span style={{ fontSize: d.body, fontWeight: 600, color: IM_INK }}>Choose a PDF</span>
            <span style={{ fontSize: d.small, color: IM_SUB }}>or drag it here · up to 25 MB</span>
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid rgba(15,23,42,0.12)', borderRadius: 11, padding: '12px 13px', marginBottom: d.stack }}>
            <Icon name="link" size={16} style={{ color: '#9AA6A2', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: d.body, color: '#9AA6A2' }}>https://… or a support-page URL</span>
          </div>
        )}

        {/* role */}
        <div style={{ fontSize: 11, fontWeight: 700, color: IM_SUB, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Role</div>
        <div style={{ display: 'flex', gap: d.gap, marginBottom: d.stack }}>
          {[{ k: 'primary', label: 'Primary', sub: 'The main reference' }, { k: 'reference', label: 'Reference', sub: 'Extra / supporting' }].map((o) => {
            const on = role === o.k;
            return (
              <button key={o.k} onClick={() => setRole(o.k)} style={{ flex: 1, textAlign: 'left', background: on ? '#E8F2EF' : '#fff', border: `1.5px solid ${on ? IM_TEAL : 'rgba(15,23,42,0.10)'}`, borderRadius: d.radius - 4, padding: d.cardPad, cursor: 'pointer' }}>
                <div style={{ fontSize: d.body, fontWeight: 700, color: on ? IM_TEAL : IM_INK }}>{o.label}</div>
                <div style={{ fontSize: d.small, color: IM_SUB, marginTop: 2 }}>{o.sub}</div>
              </button>
            );
          })}
        </div>

        {/* label */}
        <div style={{ fontSize: 11, fontWeight: 700, color: IM_SUB, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>Label</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {MANUAL_LABELS.map((l) => {
            const on = label === l;
            return <button key={l} onClick={() => setLabel(l)} style={{ border: `1.5px solid ${on ? IM_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? IM_TEAL : '#fff', color: on ? '#fff' : IM_INK, borderRadius: 99, padding: '8px 13px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}>{l}</button>;
          })}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(243,245,244,0.95)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
        <button onClick={() => onAdd({ role, label })} style={{ width: '100%', border: 'none', background: IM_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
          <Icon name="scan-line" size={18} strokeWidth={2.4} /> Add &amp; scan
        </button>
      </div>
    </div>
  );
}

// ── Parse review — what the scan pulled out ─────────────────────────────────
function ManualReview({ d, name, onDone }) {
  const [incl, setIncl] = useImS(REVIEW_FOUND.map((r) => r.key));
  const toggle = (k) => setIncl((x) => x.includes(k) ? x.filter((y) => y !== k) : [...x, k]);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 72, background: IM_BG, display: 'flex', flexDirection: 'column', paddingTop: SB_H }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `2px ${d.pad - 6}px 8px` }}>
        <span style={{ fontSize: d.body, fontWeight: 700, color: IM_INK }}>Review the scan</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: `6px ${d.pad}px 110px` }}>
        {/* classification */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#E8F2EF', border: '1px solid #D4E7E0', borderRadius: d.radius - 4, padding: d.cardPad, marginBottom: d.stack }}>
          <div style={{ width: d.tap + 6, height: d.tap + 6, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="file-check" size={19} style={{ color: IM_TEAL }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: d.body, fontWeight: 700, color: IM_INK, letterSpacing: -0.2 }}>Looks like an owner’s manual</div>
            <div style={{ fontSize: d.small + 0.5, color: IM_TEAL, marginTop: 1, fontWeight: 600 }}>94% match · 52 pages read</div>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: IM_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>Add to this item</div>
        <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
          {REVIEW_FOUND.map((r, i) => {
            const on = incl.includes(r.key);
            return (
              <button key={r.key} onClick={() => toggle(r.key)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none', padding: `${d.rowPy}px ${d.cardPad}px`, cursor: 'pointer' }}>
                <div style={{ width: d.tap, height: d.tap, borderRadius: 9, background: '#EEF2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={r.icon} size={16} style={{ color: IM_TEAL }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: d.body, fontWeight: 600, color: IM_INK }}>{r.label}</div>
                  <div style={{ fontSize: d.small, color: IM_SUB, marginTop: 1 }}>{r.n} found</div>
                </div>
                <span style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${on ? IM_TEAL : '#CBD5E1'}`, background: on ? IM_TEAL : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{on && <Icon name="check" size={13} strokeWidth={3} style={{ color: '#fff' }} />}</span>
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: d.small + 0.5, color: IM_SUB, margin: `${d.stack}px 2px 0`, lineHeight: 1.4 }}>Everything stays editable on the item afterwards — untick anything that doesn’t belong.</p>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(243,245,244,0.95)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
        <button onClick={onDone} style={{ width: '100%', border: 'none', background: IM_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
          <Icon name="check" size={18} strokeWidth={2.6} /> Save {incl.length} to item
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TROUBLESHOOT  (expandable symptom → cause → fix; used in the Fix-it tab)
// ════════════════════════════════════════════════════════════════════════════
function Troubleshoot({ d, items, onFix, onOpenManual }) {
  const [open, setOpen] = useImS(items && items.length ? items[0].symptom : null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
      {(items || []).map((t) => {
        const on = open === t.symptom;
        return (
          <div key={t.symptom} style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
            <button onClick={() => setOpen(on ? null : t.symptom)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, border: 'none', background: 'transparent', padding: d.cardPad, textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ width: d.tap, height: d.tap, borderRadius: 9, background: '#FBF1EC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="wrench" size={16} style={{ color: IM_RUST }} /></div>
              <span style={{ flex: 1, minWidth: 0, fontSize: d.body, fontWeight: 700, color: IM_INK, letterSpacing: -0.2 }}>{t.symptom}</span>
              <Icon name={on ? 'chevron-up' : 'chevron-down'} size={18} style={{ color: '#94A3B8', flexShrink: 0 }} />
            </button>
            {on && (
              <div style={{ padding: `0 ${d.cardPad}px ${d.cardPad}px`, display: 'flex', flexDirection: 'column', gap: d.gap }}>
                {t.cause && (
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: IM_SUB, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Likely cause</div>
                    <div style={{ fontSize: d.small + 1.5, color: '#4C5650', lineHeight: 1.45, textWrap: 'pretty' }}>{t.cause}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: IM_TEAL, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Try this</div>
                  <div style={{ fontSize: d.body, color: '#26302D', lineHeight: 1.45, textWrap: 'pretty' }}>{t.fix}</div>
                </div>
                {t.page && (
                  <button onClick={() => onOpenManual && onOpenManual(t.page)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', border: '1px solid rgba(15,23,42,0.12)', background: '#fff', color: IM_INK, borderRadius: 10, padding: '8px 12px', fontSize: d.small + 0.5, fontWeight: 600, cursor: 'pointer' }}>
                    <Icon name="book-open" size={14} style={{ color: IM_TEAL }} /> See manual · p.{t.page}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button onClick={onFix} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', background: '#11211C', color: '#fff', borderRadius: d.radius - 4, padding: '15px 0', fontSize: d.body, fontWeight: 700, cursor: 'pointer' }}>
        <Icon name="sparkles" size={17} style={{ color: '#9FE7D2' }} /> {items && items.length ? 'Still stuck? Ask Homehub' : 'Describe the problem to Homehub'}
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ACTIVITY LOG  (typed history grouped by day)
// ════════════════════════════════════════════════════════════════════════════
const ACT_KIND = {
  complete: { icon: 'check-circle', fg: '#1B6B5A', bg: '#E8F2EF' },
  manual:   { icon: 'file-text', fg: '#C2410C', bg: '#FBF1EC' },
  warranty: { icon: 'shield-check', fg: '#9A7B3A', bg: '#FAF6EC' },
  recall:   { icon: 'megaphone', fg: '#5B748F', bg: '#F1F5F8' },
  tier:     { icon: 'flag', fg: '#6B7280', bg: '#F1F3F5' },
  add:      { icon: 'plus-circle', fg: '#6B7280', bg: '#F1F3F5' },
};

function ActivityLog({ d, history }) {
  const groups = [];
  (history || []).forEach((h) => {
    const last = groups[groups.length - 1];
    if (last && last.date === h.date) last.items.push(h);
    else groups.push({ date: h.date, items: [h] });
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: d.stack - 2 }}>
      {groups.map((g) => (
        <div key={g.date}>
          <div style={{ fontSize: 11, fontWeight: 700, color: IM_SUB, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 7, paddingLeft: 2 }}>{g.date}</div>
          <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
            {g.items.map((h, i) => {
              const k = ACT_KIND[h.kind] || ACT_KIND.add;
              return (
                <div key={h.text + i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>
                  <div style={{ width: d.tap, height: d.tap, borderRadius: 9, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={k.icon} size={16} style={{ color: k.fg }} /></div>
                  <span style={{ flex: 1, fontSize: d.body, color: IM_INK, fontWeight: 500 }}>{h.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { ManualsManager, AddManualSheet, ManualReview, Troubleshoot, ActivityLog });
