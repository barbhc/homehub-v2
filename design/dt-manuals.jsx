// ── Homehub · Desktop manuals — viewer + manager ────────────────────────────
// The read + manage layer behind the item-detail Manuals card:
//   · DesktopManualViewer  — a faux PDF reader with "Ask about this page".
//   · DesktopManualsManager — add / relabel / set role / rescan / delete,
//     with a parse-review of what each scan pulled out (reuses DT_REVIEW_FOUND).

const { useState: useMnS } = React;

// ── Manual viewer (reader overlay) ───────────────────────────────────────────
function DesktopManualViewer({ T, d, manual, item, onClose, onAsk }) {
  const lines = [100, 92, 96, 78, 88, 64, 94, 70, 84];
  const m = manual || { name: `${item ? item.name : 'Item'} — Manual`, pages: 48 };
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(8,12,11,0.55)', display: 'grid', placeItems: 'center', padding: 24, fontFamily: DT_FONT }}>
      <div style={{ width: 920, maxWidth: '100%', height: '100%', maxHeight: 760, background: T.dark ? '#10110F' : '#2B302E', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: T.shadowMd }}>
        {/* toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Icon name="file-text" size={18} style={{ color: '#9FE7D2' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(m.name || 'Manual').split('—')[0].trim()}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{m.label || 'Owner’s manual'} · Page 14 of {m.pages || 48}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button title="Search" style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="search" size={16} style={{ color: 'rgba(255,255,255,0.8)' }} /></button>
            <button title="Download" style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="download" size={16} style={{ color: 'rgba(255,255,255,0.8)' }} /></button>
            <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 13px', borderRadius: 9, border: 'none', background: '#1B6B5A', color: '#fff', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Done</button>
          </div>
        </div>
        {/* page */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 28, display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 620, maxWidth: '100%', height: 'fit-content', background: '#fff', borderRadius: 6, padding: '40px 44px', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9AA6A2', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 16 }}>Maintenance · Water filter</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A', letterSpacing: -0.4, marginBottom: 16 }}>Replacing the water filter</div>
            <p style={{ fontSize: 13.5, color: '#3A3A3A', lineHeight: 1.75, margin: '0 0 18px' }}>Replace the filter every 6 months, or when the indicator light turns on, to keep water and ice tasting fresh. Use only genuine LT1000P cartridges — third-party filters can leak or restrict flow.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
              {lines.map((w, i) => <div key={i} style={{ height: 8, width: w + '%', borderRadius: 4, background: '#ECEEF0' }} />)}
            </div>
            <div style={{ height: 160, borderRadius: 6, background: 'repeating-linear-gradient(45deg,#F1F3F4,#F1F3F4 10px,#E7EAEC 10px,#E7EAEC 20px)', display: 'grid', placeItems: 'center', fontSize: 12, color: '#9AA6A2', fontFamily: DT_MONO }}>fig. 12 — filter housing</div>
          </div>
        </div>
        {/* ask bar */}
        <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={onAsk} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', background: '#1B6B5A', color: '#fff', borderRadius: 12, padding: '13px 0', fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            <Icon name="sparkles" size={17} /> Ask Homehub about this page
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manuals manager (overlay) ────────────────────────────────────────────────
function DesktopManualsManager({ T, d, item, onClose, onOpenManual }) {
  const seed = (itemExtras(item.id).manuals || []).map((m) => ({ ...m }));
  const [manuals, setManuals] = useMnS(seed);
  const [view, setView] = useMnS('list');
  const [menuId, setMenuId] = useMnS(null);
  // add-flow state
  const [mSrc, setMSrc] = useMnS('upload');
  const [mRole, setMRole] = useMnS(seed.some((x) => x.role === 'primary') ? 'reference' : 'primary');
  const [mLabel, setMLabel] = useMnS('Owner’s manual');
  const [incl, setIncl] = useMnS((typeof DT_REVIEW_FOUND !== 'undefined' ? DT_REVIEW_FOUND : []).map((r) => r.key));
  const toggleIncl = (k) => setIncl((x) => x.includes(k) ? x.filter((y) => y !== k) : [...x, k]);
  const labels = typeof DT_MANUAL_LABELS !== 'undefined' ? DT_MANUAL_LABELS : ['Owner’s manual', 'Quick start', 'Warranty', 'Install guide', 'Spec sheet'];
  const found = typeof DT_REVIEW_FOUND !== 'undefined' ? DT_REVIEW_FOUND : [];

  React.useEffect(() => {
    if (view !== 'scan') return;
    const t = setTimeout(() => setView('review'), 1400);
    return () => clearTimeout(t);
  }, [view]);

  const setPrimary = (name) => { setManuals((ms) => ms.map((m) => ({ ...m, role: m.name === name ? 'primary' : (m.role === 'primary' ? 'reference' : m.role) }))); setMenuId(null); };
  const removeManual = (name) => { setManuals((ms) => ms.filter((m) => m.name !== name)); setMenuId(null); };
  const commitAdd = () => {
    const name = `${item.brand} ${item.model} — ${mLabel}`;
    const role = manuals.some((x) => x.role === 'primary') ? mRole : 'primary';
    setManuals((ms) => [...ms, { name, pages: 52, role, label: mLabel, status: 'parsed' }]);
    setView('list');
  };

  let title = 'Manuals & docs', sub = `${manuals.length} on ${item.name}`;
  if (view === 'add') { title = 'Add a manual'; sub = 'Upload or link the PDF'; }
  else if (view === 'scan') { title = 'Add a manual'; sub = 'Reading the manual…'; }
  else if (view === 'review') { title = 'Review the scan'; sub = 'What we pulled out'; }

  const Body = () => {
    if (view === 'list') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {manuals.length === 0 && <div style={{ textAlign: 'center', color: T.sub, fontSize: 13.5, padding: '18px 0' }}>No manuals yet — add one to unlock tasks, specs & fixes.</div>}
        {manuals.map((m) => (
          <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 13, border: `1px solid ${T.line}`, background: T.surface, position: 'relative' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: T.claySoft, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="file-text" size={18} style={{ color: T.clay }} /></div>
            <button onClick={() => onOpenManual && onOpenManual(m)} style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label || m.name}</span>
                {m.role === 'primary' && <span style={{ fontSize: 9.5, fontWeight: 700, color: T.teal, background: T.tealWash, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>PRIMARY</span>}
              </div>
              <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>PDF · {m.pages} pages</div>
            </button>
            <button onClick={() => setMenuId(menuId === m.name ? null : m.name)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.line}`, background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}><Icon name="more-horizontal" size={16} style={{ color: T.sub }} /></button>
            {menuId === m.name && (
              <div style={{ position: 'absolute', right: 12, top: 52, zIndex: 5, width: 180, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, boxShadow: T.shadowMd, overflow: 'hidden' }}>
                {[['Open', 'book-open', () => { setMenuId(null); onOpenManual && onOpenManual(m); }], ['Set as primary', 'star', () => setPrimary(m.name)], ['Rescan', 'refresh-cw', () => setMenuId(null)], ['Delete', 'trash-2', () => removeManual(m.name)]].map(([label, icon, fn], i) => (
                  <button key={label} onClick={fn} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', border: 'none', borderTop: i ? `1px solid ${T.line}` : 'none', background: 'transparent', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: label === 'Delete' ? T.clay : T.ink, fontFamily: 'inherit', textAlign: 'left' }}>
                    <Icon name={icon} size={15} style={{ color: label === 'Delete' ? T.clay : T.sub }} /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <button onClick={() => setView('add')} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 14, borderRadius: 13, border: `1.5px dashed ${T.line2}`, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: T.tealWash, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="plus" size={18} style={{ color: T.teal }} /></div>
          <div><div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Add a manual</div><div style={{ fontSize: 12.5, color: T.sub, marginTop: 1 }}>Unlocks tasks, specs & fixes</div></div>
        </button>
      </div>
    );

    if (view === 'add') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', background: T.surface2, borderRadius: 11, padding: 3, gap: 2, border: `1px solid ${T.line}` }}>
          {[{ k: 'upload', label: 'Upload PDF' }, { k: 'link', label: 'Paste a link' }].map((o) => {
            const on = mSrc === o.k;
            return <button key={o.k} onClick={() => setMSrc(o.k)} style={{ flex: 1, border: 'none', borderRadius: 9, padding: '9px 4px', background: on ? T.surface : 'transparent', color: on ? T.ink : T.sub, fontSize: 13.5, fontWeight: on ? 700 : 500, boxShadow: on ? T.shadowSm : 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{o.label}</button>;
          })}
        </div>
        {mSrc === 'upload' ? (
          <button style={{ width: '100%', border: `1.5px dashed ${T.line2}`, background: T.surface, borderRadius: 16, padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
            <Icon name="file-up" size={28} style={{ color: T.teal }} />
            <span style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>Choose a PDF</span>
            <span style={{ fontSize: 12.5, color: T.sub }}>or drag it here · up to 25 MB</span>
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: T.fieldBg, border: `1px solid ${T.line2}`, borderRadius: 11, padding: '13px 14px' }}>
            <Icon name="link" size={16} style={{ color: T.faint, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 14, color: T.faint }}>https://… or a support-page URL</span>
          </div>
        )}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>Role</div>
          <div style={{ display: 'flex', gap: 12 }}>
            {[{ k: 'primary', label: 'Primary', sub: 'The main reference' }, { k: 'reference', label: 'Reference', sub: 'Extra / supporting' }].map((o) => {
              const on = mRole === o.k;
              return (
                <button key={o.k} onClick={() => setMRole(o.k)} style={{ flex: 1, textAlign: 'left', background: on ? T.tealWash2 : T.surface, border: `1.5px solid ${on ? T.teal : T.line}`, borderRadius: 13, padding: 15, cursor: 'pointer' }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: on ? T.teal : T.ink }}>{o.label}</div>
                  <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{o.sub}</div>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>Label</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {labels.map((l) => <Pill T={T} key={l} active={mLabel === l} onClick={() => setMLabel(l)}>{l}</Pill>)}
          </div>
        </div>
      </div>
    );

    if (view === 'scan') return (
      <div style={{ textAlign: 'center', padding: '26px 0' }}>
        <div style={{ width: 56, height: 56, margin: '0 auto 18px', borderRadius: '50%', border: `3px solid ${T.tealWash}`, borderTopColor: T.teal, animation: 'dtspin .8s linear infinite' }} />
        <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>Reading the manual…</div>
        <div style={{ fontSize: 13.5, color: T.sub, marginTop: 6 }}>Pulling out specs, care tips and fixes from {mLabel}.</div>
      </div>
    );

    // review
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: T.tealWash2, border: `1px solid ${T.line}`, borderRadius: 14, padding: 15 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: T.surface, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="file-check" size={20} style={{ color: T.teal }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, letterSpacing: -0.2 }}>Looks like an owner’s manual</div>
            <div style={{ fontSize: 12.5, color: T.teal, marginTop: 1, fontWeight: 600 }}>94% match · 52 pages read</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 9 }}>Add to {item.name}</div>
          <div style={{ border: `1px solid ${T.line}`, borderRadius: 14, overflow: 'hidden' }}>
            {found.map((r, i) => {
              const on = incl.includes(r.key);
              return (
                <button key={r.key} onClick={() => toggleIncl(r.key)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, background: T.surface, border: 'none', borderTop: i ? `1px solid ${T.line}` : 'none', padding: '13px 15px', cursor: 'pointer' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: T.surface2, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={r.icon} size={16} style={{ color: T.teal }} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{r.label}</div>
                    <div style={{ fontSize: 12, color: T.sub, marginTop: 1 }}>{r.n} found</div>
                  </div>
                  <span style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${on ? T.teal : T.line2}`, background: on ? T.teal : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{on && <Icon name="check" size={13} strokeWidth={3} style={{ color: '#fff' }} />}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const Footer = () => {
    if (view === 'list') return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 22px', borderTop: `1px solid ${T.line}`, background: T.surface }}>
        <Btn T={T} kind="ghost" onClick={onClose}>Close</Btn>
        <Btn T={T} icon="plus" onClick={() => setView('add')}>Add a manual</Btn>
      </div>
    );
    if (view === 'add') return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 22px', borderTop: `1px solid ${T.line}`, background: T.surface }}>
        <Btn T={T} kind="ghost" onClick={() => setView('list')}>Back</Btn>
        <Btn T={T} icon="scan-line" onClick={() => setView('scan')}>Add & scan</Btn>
      </div>
    );
    if (view === 'scan') return (
      <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '16px 22px', borderTop: `1px solid ${T.line}`, background: T.surface }}>
        <Btn T={T} kind="ghost" onClick={() => setView('add')}>Cancel</Btn>
      </div>
    );
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 22px', borderTop: `1px solid ${T.line}`, background: T.surface }}>
        <Btn T={T} kind="ghost" onClick={() => setView('add')}>Back</Btn>
        <Btn T={T} icon="check" onClick={commitAdd}>Save {incl.length} to item</Btn>
      </div>
    );
  };

  return (
    <div onClick={() => setMenuId(null)} style={{ position: 'absolute', inset: 0, zIndex: 75, background: 'rgba(8,12,11,0.45)', display: 'grid', placeItems: 'center', padding: 24, fontFamily: DT_FONT }}>
      <style>{`@keyframes dtspin{to{transform:rotate(360deg)}}`}</style>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: '100%', maxHeight: '100%', background: T.bg, borderRadius: 18, boxShadow: T.shadowMd, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${T.line}`, background: T.surface }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>{title}</div>
            <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{sub}</div>
          </div>
          <IconBtn T={T} name="x" onClick={onClose} />
        </div>
        <div style={{ padding: 22, overflowY: 'auto' }}><Body /></div>
        <Footer />
      </div>
    </div>
  );
}

Object.assign(window, { DesktopManualViewer, DesktopManualsManager });
