// ── Homehub · Desktop flows A — Add item, Onboarding, Auth ───────────────────

const { useState: useFlA } = React;

// ── Add item (modal over a dimmed app) ───────────────────────────────────────
const ADD_METHODS = [
  { id: 'scan', icon: 'scan-line', title: 'Scan the rating label', body: 'The most reliable read — model & serial straight off the sticker.', tag: 'Recommended' },
  { id: 'search', icon: 'keyboard', title: 'Type the brand & model', body: 'Know the model number? Enter it and we fill in the rest.' },
  { id: 'photo', icon: 'camera', title: 'Take a photo', body: 'Snap the appliance — we match against known products.' },
  { id: 'manual', icon: 'file-text', title: 'Upload a manual', body: 'Have the PDF? We read the model, specs and care schedule from it.' },
];
// Add-a-manual flow data (mirrors the mobile app's manual ingestion).
const DT_MANUAL_LABELS = ['Owner’s manual', 'Quick start', 'Warranty', 'Install guide', 'Spec sheet'];
const DT_REVIEW_FOUND = [
  { key: 'specs', icon: 'list', label: 'Specifications', n: 8 },
  { key: 'care', icon: 'sparkles', label: 'Care tips', n: 3 },
  { key: 'howto', icon: 'book-open', label: 'How-to guides', n: 2 },
  { key: 'trouble', icon: 'wrench', label: 'Troubleshooting', n: 4 },
];
function DesktopAddItem({ T, d, onClose, onDone, manualOutcome = 'notfound', manualStart = null }) {
  const [step, setStep] = useFlA('method');
  const [method, setMethod] = useFlA(null);
  const [room, setRoom] = useFlA('Kitchen');
  const [manualFirst, setManualFirst] = useFlA(false);
  const [mSrc, setMSrc] = useFlA('upload');
  const [mRole, setMRole] = useFlA('primary');
  const [mLabel, setMLabel] = useFlA('Owner’s manual');
  const [incl, setIncl] = useFlA(DT_REVIEW_FOUND.map((r) => r.key));
  const [manualPhase, setManualPhase] = useFlA(manualStart); // null → searching → found | notfound
  const [hasManual, setHasManual] = useFlA(false);
  const [viewManual, setViewManual] = useFlA(false);
  const toggleIncl = (k) => setIncl((x) => x.includes(k) ? x.filter((y) => y !== k) : [...x, k]);
  const rooms = [...new Set(HH_ITEMS.map((i) => i.room))];

  // Once the item lands, quietly look for its manual. Many models won't be
  // found — that's expected — so this resolves to a confident match (view / add)
  // or a graceful fall-back to the upload step.
  React.useEffect(() => {
    if (step === 'added' && !manualFirst && manualPhase === null && !hasManual) {
      setManualPhase('searching');
      const t = setTimeout(() => setManualPhase(manualOutcome), 1800);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Reading the manual auto-advances to the parse review.
  React.useEffect(() => {
    if (step !== 'mScan') return;
    const t = setTimeout(() => setStep('mReview'), 1500);
    return () => clearTimeout(t);
  }, [step]);

  const pickMethod = (id) => {
    setMethod(id);
    if (id === 'manual') { setManualFirst(true); setStep('mSource'); }
    else { setManualFirst(false); setStep('confirm'); }
  };

  const Body = () => {
    if (step === 'method') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ADD_METHODS.map((m) => (
          <button key={m.id} onClick={() => pickMethod(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 15, padding: 16, borderRadius: 14, border: `1px solid ${T.line}`, background: T.surface, cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: T.tealWash, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={m.icon} size={22} style={{ color: T.teal }} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{m.title}</span>
                {m.tag && <span style={{ fontSize: 10, fontWeight: 700, color: T.teal, background: T.tealWash, padding: '2px 7px', borderRadius: 5 }}>{m.tag.toUpperCase()}</span>}
              </div>
              <div style={{ fontSize: 13, color: T.sub, marginTop: 3, lineHeight: 1.4 }}>{m.body}</div>
            </div>
            <Icon name="chevron-right" size={18} style={{ color: T.faint }} />
          </button>
        ))}
      </div>
    );

    // ── Add a manual · source + role + label ──
    if (step === 'mSource') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {manualFirst && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: T.tealWash2, border: `1px solid ${T.line}`, borderRadius: 12, padding: '11px 13px' }}>
            <Icon name="info" size={15} style={{ color: T.teal, marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: T.sub, lineHeight: 1.45 }}>We'll read the model, specs and care schedule from the manual — and use it to identify the item.</span>
          </div>
        )}
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
            {DT_MANUAL_LABELS.map((l) => <Pill T={T} key={l} active={mLabel === l} onClick={() => setMLabel(l)}>{l}</Pill>)}
          </div>
        </div>
      </div>
    );

    // ── Reading the manual ──
    if (step === 'mScan') return (
      <div style={{ textAlign: 'center', padding: '26px 0' }}>
        <div style={{ width: 56, height: 56, margin: '0 auto 18px', borderRadius: '50%', border: `3px solid ${T.tealWash}`, borderTopColor: T.teal, animation: 'dtspin .8s linear infinite' }} />
        <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>Reading the manual…</div>
        <div style={{ fontSize: 13.5, color: T.sub, marginTop: 6 }}>Pulling out specs, care tips and fixes from {mLabel}.</div>
        <div style={{ maxWidth: 320, margin: '20px auto 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {[100, 88, 94, 72].map((w, i) => <div key={i} style={{ height: 8, width: w + '%', borderRadius: 4, background: T.dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }} />)}
        </div>
      </div>
    );

    // ── Review the scan ──
    if (step === 'mReview') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: T.tealWash2, border: `1px solid ${T.line}`, borderRadius: 14, padding: 15 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: T.surface, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="file-check" size={20} style={{ color: T.teal }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, letterSpacing: -0.2 }}>Looks like an owner’s manual</div>
            <div style={{ fontSize: 12.5, color: T.teal, marginTop: 1, fontWeight: 600 }}>94% match · 52 pages read</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 9 }}>Add to this item</div>
          <div style={{ border: `1px solid ${T.line}`, borderRadius: 14, overflow: 'hidden' }}>
            {DT_REVIEW_FOUND.map((r, i) => {
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
          <p style={{ fontSize: 12.5, color: T.sub, margin: '12px 2px 0', lineHeight: 1.45 }}>Everything stays editable on the item afterwards — untick anything that doesn’t belong.</p>
        </div>
      </div>
    );

    if (step === 'confirm') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', gap: 15, alignItems: 'center', padding: 16, borderRadius: 14, background: T.surface2, border: `1px solid ${T.line}` }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, background: T.dark ? T.raise : 'linear-gradient(135deg,#EEF3F1,#E0EAE5)', display: 'grid', placeItems: 'center', color: T.teal }}><Icon name="refrigerator" size={30} strokeWidth={1.6} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: T.teal, marginBottom: 4 }}><Icon name="check-circle" size={13} /> {manualFirst ? 'IDENTIFIED FROM MANUAL' : 'CLEAN MATCH'}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>LG LRFVS3006S</div>
            <div style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>French-door refrigerator · 30 cu ft</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Which room?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {rooms.map((r) => <Pill T={T} key={r} active={room === r} onClick={() => setRoom(r)}>{r}</Pill>)}
          </div>
        </div>
      </div>
    );

    return (
      <div style={{ textAlign: 'center', padding: '6px 0' }}>
        <div style={{ width: 64, height: 64, borderRadius: 32, background: T.tealWash, display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}><Icon name="check" size={32} strokeWidth={2.5} style={{ color: T.teal }} /></div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.ink }}>Added to {room}</div>
        <div style={{ fontSize: 13.5, color: T.sub, marginTop: 6, lineHeight: 1.5 }}>{manualFirst ? 'LG Refrigerator is in your home with its manual attached — upkeep, specs and fixes are ready.' : 'LG Refrigerator is in your home. Add the manual and receipt to unlock tailored upkeep and warranty tracking.'}</div>

        <div style={{ textAlign: 'left', marginTop: 20, display: 'flex', flexDirection: 'column', gap: 11 }}>
          {/* manual — background search */}
          {manualFirst || hasManual ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: T.tealWash2, border: `1px solid ${T.line}`, borderRadius: 13, padding: 14 }}>
              <Icon name="check-circle" size={20} style={{ color: T.teal, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Manual added</div>
                <div style={{ fontSize: 12.5, color: T.teal, marginTop: 1, fontWeight: 600 }}>2 maintenance tasks created</div>
              </div>
              <Btn T={T} kind="subtle" size="sm" icon="book-open" onClick={() => setViewManual(true)}>View</Btn>
            </div>
          ) : manualPhase === 'searching' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 13, padding: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: T.tealWash, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2.5px solid ${T.tealWash}`, borderTopColor: T.teal, animation: 'dtspin .8s linear infinite' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Looking for your manual…</div>
                <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2, fontFamily: DT_MONO }}>Searching for LRFVS3006S</div>
              </div>
            </div>
          ) : manualPhase === 'found' ? (
            <div style={{ background: T.surface, border: `1.5px solid ${T.teal}`, borderRadius: 13, padding: 14, boxShadow: T.shadowSm }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: T.tealWash, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="file-check-2" size={19} style={{ color: T.teal }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.teal, background: T.tealWash, borderRadius: 99, padding: '3px 8px', marginBottom: 5 }}><Icon name="sparkles" size={11} /> Manual found</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>LG Refrigerator — Owner’s manual</div>
                  <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>48 pages · matches your model · unlocks maintenance tasks</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 9, marginTop: 13 }}>
                <Btn T={T} kind="subtle" size="sm" icon="book-open" style={{ flex: 1 }} onClick={() => setViewManual(true)}>View</Btn>
                <Btn T={T} size="sm" icon="plus" style={{ flex: 1.3 }} onClick={() => setHasManual(true)}>Add manual</Btn>
              </div>
            </div>
          ) : (
            <button onClick={() => { setManualFirst(false); setStep('mSource'); }} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 12, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 13, padding: 14, cursor: 'pointer' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: T.tealWash, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="book-open" size={19} style={{ color: T.teal }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Add the manual</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: T.teal, background: T.tealWash, borderRadius: 99, padding: '3px 8px' }}><Icon name="unlock" size={11} /> Unlocks maintenance tasks</div>
                <div style={{ fontSize: 12.5, color: T.sub, marginTop: 6, lineHeight: 1.45 }}>We couldn’t find it automatically — paste a link or upload the PDF and we’ll build the right upkeep tasks.</div>
              </div>
              <Icon name="chevron-right" size={18} style={{ color: T.faint, marginTop: 2 }} />
            </button>
          )}

          {/* receipt */}
          <button style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 12, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 13, padding: 14, cursor: 'pointer' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: T.goldSoft, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="receipt" size={19} style={{ color: T.gold }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Add proof of purchase</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: T.gold, background: T.goldSoft, borderRadius: 99, padding: '3px 8px' }}><Icon name="unlock" size={11} /> Unlocks warranty tracking</div>
              <div style={{ fontSize: 12.5, color: T.sub, marginTop: 6, lineHeight: 1.45 }}>Snap the receipt or enter where &amp; when you bought it — we’ll warn you before the warranty lapses.</div>
            </div>
            <Icon name="chevron-right" size={18} style={{ color: T.faint, marginTop: 2 }} />
          </button>
        </div>
      </div>
    );
  };

  const TITLES = {
    method: ['Add an item', 'Identify it — reliable methods first'],
    confirm: ['Add an item', 'Confirm the match'],
    mSource: ['Add a manual', 'Upload or link the PDF'],
    mScan: ['Add a manual', 'Reading the manual…'],
    mReview: ['Review the scan', 'What we pulled out'],
    added: ['All set', ''],
  };
  const [hTitle, hSub] = TITLES[step] || TITLES.method;

  // Footer per step.
  const Footer = () => {
    if (step === 'added') return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 22px', borderTop: `1px solid ${T.line}`, background: T.surface }}>
        <Btn T={T} onClick={onDone}>Done</Btn>
      </div>
    );
    if (step === 'mScan') return (
      <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '16px 22px', borderTop: `1px solid ${T.line}`, background: T.surface }}>
        <Btn T={T} kind="ghost" onClick={() => setStep('mSource')}>Cancel</Btn>
      </div>
    );
    let back, backTo, primary = null;
    if (step === 'method') { back = 'Cancel'; backTo = onClose; }
    else if (step === 'mSource') { back = 'Back'; backTo = () => setStep(manualFirst ? 'method' : 'added'); primary = <Btn T={T} icon="scan-line" onClick={() => setStep('mScan')}>Add &amp; scan</Btn>; }
    else if (step === 'mReview') { back = 'Back'; backTo = () => setStep('mSource'); primary = <Btn T={T} icon="check" onClick={() => setStep(manualFirst ? 'confirm' : 'added')}>Save {incl.length} to item</Btn>; }
    else if (step === 'confirm') { back = 'Back'; backTo = () => setStep(manualFirst ? 'mReview' : 'method'); primary = <Btn T={T} icon="check" onClick={() => setStep('added')}>Add to home</Btn>; }
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 22px', borderTop: `1px solid ${T.line}`, background: T.surface }}>
        <Btn T={T} kind="ghost" onClick={backTo}>{back}</Btn>
        {primary}
      </div>
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(8,12,11,0.45)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <style>{`@keyframes dtspin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 560, maxWidth: '100%', maxHeight: '100%', background: T.bg, borderRadius: 18, boxShadow: T.shadowMd, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: DT_FONT }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${T.line}`, background: T.surface }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>{hTitle}</div>
            {hSub && <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{hSub}</div>}
          </div>
          <IconBtn T={T} name="x" onClick={onClose} />
        </div>
        <div style={{ padding: 22, overflowY: 'auto' }}><Body /></div>
        <Footer />
      </div>
      {viewManual && typeof DesktopManualViewer !== 'undefined' && (
        <DesktopManualViewer T={T} d={d} manual={{ name: 'LG Refrigerator — Owner’s manual', pages: 48, label: 'Owner’s manual' }} item={hhItem('fridge')} onClose={() => setViewManual(false)} onAsk={() => setViewManual(false)} />
      )}
    </div>
  );
}

// ── Onboarding (centered wizard) ─────────────────────────────────────────────
const OB_STEPS = ['welcome', 'type', 'matters', 'item', 'done'];
const OB_TYPES = [['house', 'Single-family'], ['building', 'Apartment'], ['building-2', 'Condo'], ['home', 'Townhouse']];
const OB_MATTERS = [['shield-check', 'Surprise repairs'], ['leaf', 'Seasonal upkeep'], ['sparkles', 'Keeping it clean'], ['book-open', 'Manuals handy']];
function DesktopOnboarding({ T, d, startStep = 0 }) {
  const [i, setI] = useFlA(startStep);
  const [type, setType] = useFlA('Single-family');
  const [matters, setMatters] = useFlA(['Surprise repairs']);
  const step = OB_STEPS[i];
  const toggle = (m) => setMatters((x) => x.includes(m) ? x.filter((v) => v !== m) : [...x, m]);

  return (
    <div style={{ width: '100%', height: '100%', background: T.bg, display: 'grid', placeItems: 'center', fontFamily: DT_FONT, padding: 24 }}>
      <div style={{ width: 600, maxWidth: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}><Wordmark T={T} size={30} /></div>
        <Card T={T} d={d} pad={36} raised>
          {step === 'welcome' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: 20, background: T.tealWash, display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}><Icon name="house" size={34} style={{ color: T.teal }} /></div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: T.ink, letterSpacing: -0.6, margin: 0 }}>Welcome to Homehub</h1>
              <p style={{ fontSize: 15, color: T.sub, lineHeight: 1.55, maxWidth: 420, margin: '12px auto 0' }}>The calm place for everything in your home — what you own, what needs doing, and the manuals that explain it all.</p>
            </div>
          )}
          {step === 'type' && (
            <div>
              <h2 style={{ fontSize: 23, fontWeight: 800, color: T.ink, letterSpacing: -0.4, margin: 0 }}>What kind of home?</h2>
              <p style={{ fontSize: 14, color: T.sub, margin: '6px 0 22px' }}>This helps us suggest the right upkeep.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
                {OB_TYPES.map(([ic, label]) => (
                  <button key={label} onClick={() => setType(label)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 16, borderRadius: 14, border: `1.5px solid ${type === label ? T.teal : T.line}`, background: type === label ? T.tealWash2 : T.surface, cursor: 'pointer' }}>
                    <Icon name={ic} size={22} style={{ color: T.teal }} /><span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 'matters' && (
            <div>
              <h2 style={{ fontSize: 23, fontWeight: 800, color: T.ink, letterSpacing: -0.4, margin: 0 }}>What matters most?</h2>
              <p style={{ fontSize: 14, color: T.sub, margin: '6px 0 22px' }}>Pick a few — your Home will lead with these.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
                {OB_MATTERS.map(([ic, label]) => {
                  const on = matters.includes(label);
                  return (
                    <button key={label} onClick={() => toggle(label)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 16, borderRadius: 14, border: `1.5px solid ${on ? T.teal : T.line}`, background: on ? T.tealWash2 : T.surface, cursor: 'pointer' }}>
                      <Icon name={ic} size={22} style={{ color: T.teal }} /><span style={{ fontSize: 15, fontWeight: 700, color: T.ink, flex: 1, textAlign: 'left' }}>{label}</span>
                      {on && <Icon name="check" size={18} style={{ color: T.teal }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {step === 'item' && (
            <div>
              <h2 style={{ fontSize: 23, fontWeight: 800, color: T.ink, letterSpacing: -0.4, margin: 0 }}>Add your first item</h2>
              <p style={{ fontSize: 14, color: T.sub, margin: '6px 0 22px' }}>Start with something big — your furnace, fridge or water heater. Scan it, type the model, snap a photo, or upload its manual.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {ADD_METHODS.map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, border: `1px solid ${T.line}` }}>
                    <div style={{ width: 42, height: 42, borderRadius: 11, background: T.tealWash, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={m.icon} size={20} style={{ color: T.teal }} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>{m.title}</span>
                        {m.tag && <span style={{ fontSize: 9.5, fontWeight: 700, color: T.teal, background: T.tealWash, padding: '2px 6px', borderRadius: 5 }}>{m.tag.toUpperCase()}</span>}
                      </div>
                      <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{m.body}</div>
                    </div>
                    <Icon name="chevron-right" size={18} style={{ color: T.faint, flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {step === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: 36, background: T.tealWash, display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}><Icon name="check" size={36} strokeWidth={2.5} style={{ color: T.teal }} /></div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: T.ink, letterSpacing: -0.6, margin: 0 }}>You're all set</h1>
              <p style={{ fontSize: 15, color: T.sub, lineHeight: 1.55, maxWidth: 420, margin: '12px auto 0' }}>Your Home leads with {matters.slice(0, 2).join(' and ').toLowerCase()}. Add more items any time to unlock tailored upkeep.</p>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 30 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {OB_STEPS.map((_, k) => <span key={k} style={{ width: k === i ? 22 : 7, height: 7, borderRadius: 4, background: k === i ? T.teal : T.line2, transition: 'all .2s' }} />)}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {i > 0 && <Btn T={T} kind="ghost" onClick={() => setI((v) => Math.max(0, v - 1))}>Back</Btn>}
              <Btn T={T} iconRight={i === OB_STEPS.length - 1 ? undefined : 'arrow-right'} onClick={() => setI((v) => Math.min(OB_STEPS.length - 1, v + 1))}>{i === OB_STEPS.length - 1 ? 'Enter Homehub' : i === 0 ? 'Get started' : 'Continue'}</Btn>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Auth (split screen) ──────────────────────────────────────────────────────
function DesktopAuth({ T, d, mode: initMode = 'signin' }) {
  const [mode, setMode] = useFlA(initMode);
  const isReset = mode === 'reset';
  const isCreate = mode === 'create';
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', fontFamily: DT_FONT, background: T.bg }}>
      {/* brand panel */}
      <div style={{ width: '46%', background: T.dark ? T.raise : '#0E2E27', color: '#fff', padding: 48, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: '#fff', display: 'grid', placeItems: 'center' }}><Icon name="house" size={17} strokeWidth={2.4} style={{ color: '#0E2E27' }} /></div>
          <span style={{ fontSize: 19, fontWeight: 800 }}>Homehub</span>
        </div>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1, lineHeight: 1.1, margin: 0 }}>Your home,<br />managed effortlessly.</h1>
          <p style={{ fontSize: 15.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginTop: 16, maxWidth: 360 }}>Track what you own, never miss upkeep, and ask any question about your home — grounded in your own manuals.</p>
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>© Homehub</div>
      </div>
      {/* form */}
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 40 }}>
        <div style={{ width: 360, maxWidth: '100%' }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: T.ink, letterSpacing: -0.5, margin: 0 }}>{isReset ? 'Reset password' : isCreate ? 'Create your account' : 'Welcome back'}</h2>
          <p style={{ fontSize: 14, color: T.sub, margin: '8px 0 26px' }}>{isReset ? "We'll email you a reset link." : isCreate ? 'Start your home in two minutes.' : 'Sign in to your home.'}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isCreate && <AuthInput T={T} label="Full name" placeholder="Barb Haynes" />}
            <AuthInput T={T} label="Email" placeholder="you@email.com" />
            {!isReset && <AuthInput T={T} label="Password" placeholder="••••••••" type />}
            <Btn T={T} size="lg" style={{ width: '100%', marginTop: 4 }}>{isReset ? 'Send reset link' : isCreate ? 'Create account' : 'Sign in'}</Btn>
            {!isReset && !isCreate && (
              <button onClick={() => setMode('reset')} style={{ alignSelf: 'center', border: 'none', background: 'none', color: T.teal, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Forgot your password?</button>
            )}
            {!isReset && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
                <div style={{ flex: 1, height: 1, background: T.line }} /><span style={{ fontSize: 12, color: T.faint }}>or</span><div style={{ flex: 1, height: 1, background: T.line }} />
              </div>
            )}
            {!isReset && (
              <button onClick={() => {}} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, border: 'none', background: '#000', color: '#fff', borderRadius: 11, padding: '12px 0', fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff" aria-hidden="true" style={{ display: 'block', marginTop: -2 }}><path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.23 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.02 2.29-1.27 3.14-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.73-1.05-2.76-4.16zM14.6 4.59c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44z" /></svg>
                {isCreate ? 'Sign up with Apple' : 'Continue with Apple'}
              </button>
            )}
            {!isReset && <Btn T={T} kind="ghost" icon="mail" style={{ width: '100%' }}>Continue with a magic link</Btn>}
          </div>
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13.5, color: T.sub }}>
            {isCreate || isReset ? <>Have an account? <button onClick={() => setMode('signin')} style={{ border: 'none', background: 'none', color: T.teal, fontWeight: 700, cursor: 'pointer' }}>Sign in</button></>
              : <>New here? <button onClick={() => setMode('create')} style={{ border: 'none', background: 'none', color: T.teal, fontWeight: 700, cursor: 'pointer' }}>Create an account</button></>}
          </div>
        </div>
      </div>
    </div>
  );
}
function AuthInput({ T, label, placeholder, type }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.sub, display: 'block', marginBottom: 6 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', height: 46, padding: '0 14px', borderRadius: 11, border: `1px solid ${T.line2}`, background: T.surface, fontSize: 14.5, color: T.faint }}>{placeholder}</div>
    </label>
  );
}

// ── Member invite ────────────────────────────────────────────────────────────
const INVITE_ROLES = [
  { k: 'member', label: 'Member', sub: 'Can view and complete tasks, add items & manuals.' },
  { k: 'owner', label: 'Co-owner', sub: 'Full access — can invite others and manage the home.' },
];
const INVITE_PENDING = [{ email: 'sam@haynes.family', role: 'Member' }];
function DesktopInviteModal({ T, d, onClose }) {
  const [step, setStep] = useFlA('form');
  const [role, setRole] = useFlA('member');
  const link = 'homehub.app/join/haynes-3f9k2';
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(8,12,11,0.45)', display: 'grid', placeItems: 'center', padding: 24, fontFamily: DT_FONT }}>
      <div style={{ width: 520, maxWidth: '100%', maxHeight: '100%', background: T.bg, borderRadius: 18, boxShadow: T.shadowMd, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${T.line}`, background: T.surface }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>{step === 'sent' ? 'Invite sent' : 'Invite to your home'}</div>
            {step !== 'sent' && <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>They’ll get access to the Haynes home</div>}
          </div>
          <IconBtn T={T} name="x" onClick={onClose} />
        </div>

        <div style={{ padding: 22, overflowY: 'auto' }}>
          {step === 'sent' ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: 30, background: T.tealWash, display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}><Icon name="mail-check" size={28} style={{ color: T.teal }} /></div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.ink }}>Invite on its way</div>
              <div style={{ fontSize: 13.5, color: T.sub, marginTop: 6, lineHeight: 1.5, maxWidth: 360, marginInline: 'auto' }}>We emailed an invite to join the Haynes home as a {role === 'owner' ? 'co-owner' : 'member'}. You can also share the link below.</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.fieldBg, border: `1px solid ${T.line2}`, borderRadius: 11, padding: '11px 13px', marginTop: 18 }}>
                <Icon name="link" size={16} style={{ color: T.faint }} />
                <span style={{ flex: 1, fontSize: 13.5, color: T.ink, fontFamily: DT_MONO, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{link}</span>
                <Btn T={T} kind="soft" size="sm" icon="copy">Copy</Btn>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <label style={{ display: 'block' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: T.sub, display: 'block', marginBottom: 6 }}>Email address</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, height: 46, padding: '0 14px', borderRadius: 11, border: `1.5px solid ${T.teal}`, background: T.surface }}>
                  <Icon name="mail" size={16} style={{ color: T.faint }} />
                  <span style={{ flex: 1, fontSize: 14.5, color: T.faint }}>name@email.com</span>
                </div>
              </label>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: T.sub, marginBottom: 9 }}>Role</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {INVITE_ROLES.map((r) => {
                    const on = role === r.k;
                    return (
                      <button key={r.k} onClick={() => setRole(r.k)} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left', background: on ? T.tealWash2 : T.surface, border: `1.5px solid ${on ? T.teal : T.line}`, borderRadius: 13, padding: 14, cursor: 'pointer' }}>
                        <span style={{ width: 20, height: 20, borderRadius: 10, marginTop: 1, border: `2px solid ${on ? T.teal : T.line2}`, background: on ? T.teal : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{on && <Icon name="check" size={12} strokeWidth={3} style={{ color: '#fff' }} />}</span>
                        <div><div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>{r.label}</div><div style={{ fontSize: 12.5, color: T.sub, marginTop: 2, lineHeight: 1.4 }}>{r.sub}</div></div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 9 }}>Pending</div>
                <div style={{ border: `1px solid ${T.line}`, borderRadius: 12, overflow: 'hidden' }}>
                  {INVITE_PENDING.map((p) => (
                    <div key={p.email} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px' }}>
                      <Avatar T={T} initials={p.email[0].toUpperCase()} size={30} />
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{p.email}</div><div style={{ fontSize: 11.5, color: T.faint }}>{p.role} · invite sent</div></div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.gold, background: T.goldSoft, padding: '3px 8px', borderRadius: 6 }}>PENDING</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 22px', borderTop: `1px solid ${T.line}`, background: T.surface }}>
          {step === 'sent'
            ? <><Btn T={T} kind="ghost" onClick={() => setStep('form')}>Invite another</Btn><Btn T={T} onClick={onClose}>Done</Btn></>
            : <><Btn T={T} kind="ghost" onClick={onClose}>Cancel</Btn><Btn T={T} icon="send" onClick={() => setStep('sent')}>Send invite</Btn></>}
        </div>
      </div>
    </div>
  );
}

// Accept-invite / join screen (the recipient's side).
function DesktopJoinInvite({ T, d }) {
  return (
    <div style={{ width: '100%', height: '100%', background: T.bg, display: 'grid', placeItems: 'center', fontFamily: DT_FONT, padding: 24 }}>
      <div style={{ width: 460, maxWidth: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}><Wordmark T={T} size={28} /></div>
        <Card T={T} d={d} pad={36} raised style={{ textAlign: 'center' }}>
          <Avatar T={T} initials="BH" size={56} />
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.teal, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 16 }}>You’re invited</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: T.ink, letterSpacing: -0.5, margin: '8px 0 0' }}>Join the Haynes home</h1>
          <p style={{ fontSize: 14.5, color: T.sub, lineHeight: 1.55, margin: '12px auto 0', maxWidth: 360 }}>Barb invited you as a <strong style={{ color: T.ink }}>member</strong>. You’ll see the home’s items, upkeep and manuals — and can pitch in on tasks.</p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', margin: '20px 0', fontSize: 13, color: T.sub }}>
            {[['package', '25 items'], ['users', '3 members']].map(([ic, t]) => <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name={ic} size={15} style={{ color: T.teal }} /> {t}</span>)}
          </div>
          <Btn T={T} size="lg" icon="arrow-right" style={{ width: '100%' }}>Accept &amp; join</Btn>
          <button style={{ marginTop: 12, border: 'none', background: 'none', color: T.sub, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Decline</button>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { DesktopAddItem, DesktopOnboarding, DesktopAuth, DesktopInviteModal, DesktopJoinInvite, ADD_METHODS });
