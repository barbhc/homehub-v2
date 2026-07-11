// ── Homehub · Add-item flow ─────────────────────────────────────────────────
// Low-effort by design. The item is added the moment a match is confirmed;
// everything else is optional and can be done later — each follow-up shows what
// it unlocks (receipt → warranty tracking, manual → maintenance tasks).
//
// Visual recognition is fallible, so the method order leads with the reliable
// signals (the rating label, typed model) and frames the photo honestly. A
// photo resolves to one of three realistic outcomes:
//   · a few possible matches → the user picks  (step 6)
//   · nothing confident      → narrow it down   (step 7)
//   · (a clean single match is still possible from a label scan)
// Steps: method → capture → [candidates | narrow → type] → confirm → ADDED.

const { useState: useAdS } = React;

const AD_INK = '#0B1220', AD_SUB = '#6B7280', AD_TEAL = '#1B6B5A', AD_GOLD = '#9A7B3A', AD_AMBER = '#B4791F';

// Reliable signals first; the photo is framed as quick-but-approximate.
const AD_METHODS = [
  { id: 'scan', icon: 'scan-line', label: 'Scan the rating label', sub: 'Reads the exact model & serial in one shot' },
  { id: 'search', icon: 'keyboard', label: 'Enter brand & model', sub: 'Type what’s printed on the label or spec sheet' },
  { id: 'photo', icon: 'camera', label: 'Take a photo', sub: 'Quick — best for identifying the kind of item' },
  { id: 'manual', icon: 'file-text', label: 'Upload a manual', sub: 'We’ll pull the model and details from the PDF' },
];
const AD_ROOMS = ['Kitchen', 'Laundry', 'Utility', 'Living room', 'Garage'];

// What a single photo of a French-door fridge could plausibly be — near-identical
// twins are exactly why a photo alone can’t be trusted.
const AD_CANDIDATES = [
  { id: 'lrfvs', name: 'LG French-Door Refrigerator', model: 'LRFVS3006S', note: 'InstaView · counter-depth', strength: 'likely' },
  { id: 'lrfvc', name: 'LG French-Door Refrigerator', model: 'LRFVC2406S', note: 'Standard depth', strength: 'maybe' },
  { id: 'lrmvs', name: 'LG InstaView Refrigerator', model: 'LRMVS3006S', note: 'Craft Ice', strength: 'maybe' },
];

function AddProgress({ d, phase, onBack, atStart }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `4px ${d.pad - 6}px 12px` }}>
      <button onClick={onBack} style={{ border: 'none', background: 'transparent', color: AD_TEAL, padding: '6px', display: 'flex', cursor: 'pointer' }}>
        <Icon name={atStart ? 'x' : 'chevron-left'} size={24} strokeWidth={2.2} />
      </button>
      <div style={{ flex: 1, display: 'flex', gap: 5, justifyContent: 'center' }}>
        {['method', 'identify', 'confirm'].map((s, i) => (
          <span key={s} style={{ height: 4, borderRadius: 2, flex: 1, maxWidth: 44, background: i <= phase ? AD_TEAL : 'rgba(15,23,42,0.12)', transition: 'background .2s' }} />
        ))}
      </div>
      <div style={{ width: 36 }} />
    </div>
  );
}

function AddCTA({ d, label, onClick, icon, disabled }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
      <button onClick={disabled ? undefined : onClick} style={{ width: '100%', border: 'none', background: disabled ? '#C9D4D0' : AD_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, letterSpacing: -0.1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer' }}>
        {icon && <Icon name={icon} size={18} strokeWidth={2.6} />} {label}
      </button>
    </div>
  );
}

// Small subnav for the optional follow-up screens (receipt / manual).
function AddSubBar({ d, onBack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: `2px ${d.pad - 6}px 8px`, borderBottom: '0.5px solid rgba(15,23,42,0.06)' }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: AD_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 4px', cursor: 'pointer' }}>
        <Icon name="chevron-left" size={22} strokeWidth={2.4} /> Item added
      </button>
    </div>
  );
}

function Field({ d, label, value, placeholder, hint, mono }) {
  return (
    <div style={{ marginBottom: d.gap + 2 }}>
      <div style={{ fontSize: d.small + 0.5, fontWeight: 600, color: AD_SUB, marginBottom: 6 }}>{label}</div>
      <div style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.12)', borderRadius: 11, padding: '12px 13px', fontSize: d.body, color: value ? AD_INK : '#9AA6A2', fontFamily: mono ? 'ui-monospace, monospace' : undefined }}>{value || placeholder}</div>
      {hint && <div style={{ fontSize: d.small, color: AD_SUB, margin: '5px 2px 0', lineHeight: 1.35 }}>{hint}</div>}
    </div>
  );
}

function BenefitBanner({ d, icon, color, soft, border, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: soft, border: `1px solid ${border}`, borderRadius: d.radius - 4, padding: `${d.rowPy}px ${d.cardPad}px`, marginBottom: d.stack }}>
      <Icon name={icon} size={20} style={{ color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: d.small + 1, color: '#4C5650', lineHeight: 1.4 }}>{text}</div>
    </div>
  );
}

// Tiny captured-photo chip, used atop the candidate / narrow screens.
function PhotoStrip({ d, icon, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: d.radius - 4, padding: 8, marginBottom: d.stack }}>
      <div style={{ width: 46, height: 46, borderRadius: 9, background: '#0E1B17', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={24} strokeWidth={1.3} style={{ color: 'rgba(159,231,210,0.55)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: d.small + 1, fontWeight: 700, color: AD_INK }}>{label}</div>
        <div style={{ fontSize: d.small, color: AD_SUB, marginTop: 1 }}>Tap to retake</div>
      </div>
      <Icon name="camera" size={17} style={{ color: AD_SUB, marginRight: 4 }} />
    </div>
  );
}

function AddItemFlow({ d, onClose, onDone, startStep = 0, startMethod = 'scan', itemId = 'fridge', manualOutcome = 'notfound', manualStart = null }) {
  const [step, setStep] = useAdS(startStep);
  const [method, setMethod] = useAdS(startMethod);
  const [room, setRoom] = useAdS('Kitchen');
  const [busy, setBusy] = useAdS(false);
  const [hasReceipt, setHasReceipt] = useAdS(false);
  const [hasManual, setHasManual] = useAdS(false);
  const [manualPhase, setManualPhase] = useAdS(manualStart); // null → searching → found | notfound
  const [viewManual, setViewManual] = useAdS(false);
  const [picked, setPicked] = useAdS('lrfvs');          // selected candidate on step 6
  const [match, setMatch] = useAdS(null);               // resolved { model, source }
  const [confirmFrom, setConfirmFrom] = useAdS('label'); // back-target hint for confirm
  const [typeFrom, setTypeFrom] = useAdS('method');      // back-target hint for type entry
  const it = hhItem(itemId);

  // Once the item lands, quietly look for its manual in the background. Many
  // models won't be found — that's expected — so this resolves to either a
  // confident match (offer to view / add) or a graceful fall-back to upload.
  React.useEffect(() => {
    if (step === 3 && manualPhase === null && !hasManual) {
      setManualPhase('searching');
      const t = setTimeout(() => setManualPhase(manualOutcome), 1800);
      return () => clearTimeout(t);
    }
  }, [step]);

  const go = (n) => setStep(n);

  // Recognition is simulated. The reliable paths land a clean match; the photo
  // path lands on the ambiguous "a few possible matches" screen.
  const run = (target, ms = 1100) => { setBusy(true); setTimeout(() => { setBusy(false); go(target); }, ms); };

  const resolve = (model, source, from) => { setMatch({ model, source }); setConfirmFrom(from); go(2); };

  const back = () => {
    if (step === 0) return onClose();
    if (step === 1) return go(0);
    if (step === 6) return go(1);
    if (step === 7) return go(6);
    if (step === 8) return go(typeFrom === 'narrow' ? 7 : 0);
    if (step === 2) return go(confirmFrom === 'candidates' ? 6 : confirmFrom === 'type' ? 8 : 1);
    return go(step - 1);
  };

  const Title = ({ k, sub }) => (
    <div style={{ marginBottom: d.stack }}>
      <h1 style={{ fontSize: d.big - 2, fontWeight: 800, color: AD_INK, letterSpacing: -0.5, margin: 0, lineHeight: 1.12 }}>{k}</h1>
      {sub && <p style={{ fontSize: d.body, color: AD_SUB, margin: '6px 0 0', lineHeight: 1.4 }}>{sub}</p>}
    </div>
  );

  // ════ ADDED — item is in the home; optional completion with clear payoffs ════
  if (step === 3) {
    const OptionCard = ({ done, icon, iconBg, iconFg, title, unlock, sub, doneTitle, doneSub, onClick }) => (
      done ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F1F6F4', border: '1px solid #D9E7E1', borderRadius: d.radius - 4, padding: d.cardPad }}>
          <Icon name="check-circle" size={22} style={{ color: AD_TEAL, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: d.body, fontWeight: 700, color: AD_INK, letterSpacing: -0.2 }}>{doneTitle}</div>
            <div style={{ fontSize: d.small, color: AD_TEAL, marginTop: 1, fontWeight: 600 }}>{doneSub}</div>
          </div>
        </div>
      ) : (
        <button onClick={onClick} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 13, background: '#fff', border: '1px solid rgba(15,23,42,0.10)', borderRadius: d.radius - 4, padding: d.cardPad, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', cursor: 'pointer' }}>
          <div style={{ width: d.tap + 8, height: d.tap + 8, borderRadius: 11, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={19} style={{ color: iconFg }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: d.body, fontWeight: 700, color: AD_INK, letterSpacing: -0.2 }}>{title}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: AD_TEAL, background: '#E8F2EF', borderRadius: 99, padding: '3px 8px' }}><Icon name="unlock" size={11} /> {unlock}</div>
            <div style={{ fontSize: d.small + 0.5, color: AD_SUB, marginTop: 6, lineHeight: 1.4 }}>{sub}</div>
          </div>
          <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4', marginTop: 4 }} />
        </button>
      )
    );

    const manualObj = { name: `${it.name} — Owner’s manual`, pages: 48, label: 'Owner’s manual' };
    const modelStr = (match && match.model) || it.model;

    // The manual card adapts to the background search: searching → found → upload.
    const ManualCard = () => {
      if (hasManual) return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F1F6F4', border: '1px solid #D9E7E1', borderRadius: d.radius - 4, padding: d.cardPad }}>
          <Icon name="check-circle" size={22} style={{ color: AD_TEAL, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: d.body, fontWeight: 700, color: AD_INK, letterSpacing: -0.2 }}>Manual added</div>
            <div style={{ fontSize: d.small, color: AD_TEAL, marginTop: 1, fontWeight: 600 }}>2 maintenance tasks created</div>
          </div>
          <button onClick={() => setViewManual(true)} style={{ border: '1px solid rgba(15,23,42,0.12)', background: '#fff', borderRadius: 9, padding: '7px 12px', fontSize: d.small, fontWeight: 700, color: AD_TEAL, cursor: 'pointer' }}>View</button>
        </div>
      );

      if (manualPhase === 'searching') return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: '#fff', border: '1px solid rgba(15,23,42,0.10)', borderRadius: d.radius - 4, padding: d.cardPad }}>
          <div style={{ width: d.tap + 8, height: d.tap + 8, borderRadius: 11, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2.5px solid rgba(27,107,90,0.25)', borderTopColor: AD_TEAL, animation: 'adspin 0.8s linear infinite' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: d.body, fontWeight: 700, color: AD_INK, letterSpacing: -0.2 }}>Looking for your manual…</div>
            <div style={{ fontSize: d.small, color: AD_SUB, marginTop: 3, fontFamily: 'ui-monospace, monospace' }}>Searching for {modelStr}</div>
          </div>
          <style>{'@keyframes adspin{to{transform:rotate(360deg)}}'}</style>
        </div>
      );

      if (manualPhase === 'found') return (
        <div style={{ background: '#fff', border: `1.5px solid ${AD_TEAL}`, borderRadius: d.radius - 4, padding: d.cardPad, boxShadow: '0 2px 12px rgba(27,107,90,0.10)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
            <div style={{ width: d.tap + 8, height: d.tap + 8, borderRadius: 11, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="file-check-2" size={20} style={{ color: AD_TEAL }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: AD_TEAL, background: '#E8F2EF', borderRadius: 99, padding: '3px 8px', marginBottom: 6 }}><Icon name="sparkles" size={11} /> Manual found</div>
              <div style={{ fontSize: d.body, fontWeight: 700, color: AD_INK, letterSpacing: -0.2 }}>{it.name} — Owner’s manual</div>
              <div style={{ fontSize: d.small, color: AD_SUB, marginTop: 2 }}>48 pages · matches your model · unlocks maintenance tasks</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: d.gap, marginTop: d.cardPad - 2 }}>
            <button onClick={() => setViewManual(true)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1.5px solid rgba(15,23,42,0.14)', background: '#fff', color: AD_INK, borderRadius: 12, padding: '12px 0', fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}><Icon name="book-open" size={16} /> View</button>
            <button onClick={() => setHasManual(true)} style={{ flex: 1.3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 'none', background: AD_TEAL, color: '#fff', borderRadius: 12, padding: '12px 0', fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}><Icon name="plus" size={16} strokeWidth={2.6} /> Add manual</button>
          </div>
        </div>
      );

      // notfound (or initial fallback): the manual couldn't be found — upload it.
      return (
        <button onClick={() => go(5)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 13, background: '#fff', border: '1px solid rgba(15,23,42,0.10)', borderRadius: d.radius - 4, padding: d.cardPad, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', cursor: 'pointer' }}>
          <div style={{ width: d.tap + 8, height: d.tap + 8, borderRadius: 11, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="book-open" size={19} style={{ color: AD_TEAL }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: d.body, fontWeight: 700, color: AD_INK, letterSpacing: -0.2 }}>Add the manual</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: AD_TEAL, background: '#E8F2EF', borderRadius: 99, padding: '3px 8px' }}><Icon name="unlock" size={11} /> Unlocks maintenance tasks</div>
            <div style={{ fontSize: d.small + 0.5, color: AD_SUB, marginTop: 6, lineHeight: 1.4 }}>We couldn’t find it automatically — paste a link or upload the PDF and we’ll build the right upkeep tasks.</div>
          </div>
          <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4', marginTop: 4 }} />
        </button>
      );
    };

    return (
      <Screen bg="#F7F8F8" padTop={SB_H} padBottom={0}>
        <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 100px` }}>
          {/* success */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: d.stack }}>
            <div style={{ width: d.tap + 16, height: d.tap + 16, borderRadius: '50%', background: '#E8F2EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="check" size={24} strokeWidth={2.8} style={{ color: AD_TEAL }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: d.h2 + 3, fontWeight: 800, color: AD_INK, letterSpacing: -0.4, margin: 0, lineHeight: 1.1 }}>{it.name} added</h1>
              <div style={{ fontSize: d.small + 1, color: AD_SUB, marginTop: 2 }}>It’s in your home, in {room}.</div>
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: AD_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>
            Finish setting up · optional
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
            <ManualCard />
            <OptionCard done={hasReceipt} icon="receipt" iconBg="#FAF6EC" iconFg={AD_GOLD}
              title="Add proof of purchase" unlock="Unlocks warranty tracking"
              sub="Snap the receipt or enter where & when you bought it — we’ll warn you before the warranty lapses."
              doneTitle="Purchase details added" doneSub="Warranty tracked until Jul 9, 2026"
              onClick={() => go(4)} />
          </div>

          <p style={{ fontSize: d.small + 0.5, color: AD_SUB, textAlign: 'center', margin: `${d.stack}px 8px 0`, lineHeight: 1.4 }}>
            No rush — you can add these anytime from the item’s page.
          </p>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(247,248,248,0.94)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)', display: 'flex', gap: d.gap }}>
          <button onClick={() => { setStep(0); setMethod('scan'); setHasReceipt(false); setHasManual(false); setManualPhase(null); setRoom('Kitchen'); setMatch(null); }} style={{ border: '1.5px solid rgba(15,23,42,0.14)', background: '#fff', color: AD_INK, borderRadius: 14, padding: '15px 18px', fontSize: d.body, fontWeight: 700, cursor: 'pointer' }}>Add another</button>
          <button onClick={onDone} style={{ flex: 1, border: 'none', background: AD_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, cursor: 'pointer' }}>{hasReceipt || hasManual ? 'View item' : 'Done — view item'}</button>
        </div>
        {viewManual && <ManualViewer d={d} manual={manualObj} item={it} onClose={() => setViewManual(false)} />}
      </Screen>
    );
  }

  // ════ RECEIPT / PURCHASE DETAILS (optional) ════
  if (step === 4) {
    return (
      <Screen bg="#F7F8F8" padTop={SB_H} padBottom={0}>
        <AddSubBar d={d} onBack={() => go(3)} />
        <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 100px` }}>
          <Title k="Proof of purchase" sub="Add a receipt and we’ll track the warranty for you." />
          <BenefitBanner d={d} icon="shield-check" color={AD_GOLD} soft="#FAF6EC" border="#EFE6CE"
            text={<span><strong style={{ color: AD_INK }}>Unlocks warranty tracking</strong> — we’ll remind you before coverage ends.</span>} />

          {/* receipt capture */}
          <div style={{ display: 'flex', gap: d.gap, marginBottom: d.stack }}>
            <button onClick={() => setHasReceipt(true)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid rgba(15,23,42,0.10)', borderRadius: d.radius - 4, padding: `${d.cardPad}px 4px`, cursor: 'pointer' }}>
              <Icon name="camera" size={22} style={{ color: AD_TEAL }} /><span style={{ fontSize: d.small + 1, fontWeight: 600, color: AD_INK }}>Photograph it</span>
            </button>
            <button onClick={() => setHasReceipt(true)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid rgba(15,23,42,0.10)', borderRadius: d.radius - 4, padding: `${d.cardPad}px 4px`, cursor: 'pointer' }}>
              <Icon name="file-up" size={22} style={{ color: AD_TEAL }} /><span style={{ fontSize: d.small + 1, fontWeight: 600, color: AD_INK }}>Upload</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: `0 0 ${d.stack}px` }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(15,23,42,0.10)' }} />
            <span style={{ fontSize: d.small, color: AD_SUB, fontWeight: 600 }}>or enter manually</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(15,23,42,0.10)' }} />
          </div>

          <Field d={d} label="Where you bought it" placeholder="e.g. Best Buy, Costco…" />
          <Field d={d} label="Purchase date" placeholder="Select a date" />
          <Field d={d} label="Price paid" placeholder="$0.00" />
        </div>
        <AddCTA d={d} label="Save & track warranty" icon="check" onClick={() => { setHasReceipt(true); go(3); }} />
      </Screen>
    );
  }

  // ════ MANUAL (optional) — link or upload, since auto-find is unreliable ════
  if (step === 5) {
    return (
      <Screen bg="#F7F8F8" padTop={SB_H} padBottom={0}>
        <AddSubBar d={d} onBack={() => go(3)} />
        <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 100px` }}>
          <Title k="Add the manual" sub="Paste a link to it, or upload the PDF." />
          <BenefitBanner d={d} icon="list-checks" color={AD_TEAL} soft="#EAF3EF" border="#D4E7E0"
            text={<span><strong style={{ color: AD_INK }}>Unlocks maintenance tasks</strong> — we build the right upkeep schedule from your model.</span>} />

          <div style={{ fontSize: d.small + 0.5, fontWeight: 600, color: AD_SUB, marginBottom: 6 }}>Link to the manual</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid rgba(15,23,42,0.12)', borderRadius: 11, padding: '12px 13px', marginBottom: d.stack }}>
            <Icon name="link" size={16} style={{ color: '#9AA6A2', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: d.body, color: '#9AA6A2' }}>https://…</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: `0 0 ${d.stack}px` }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(15,23,42,0.10)' }} />
            <span style={{ fontSize: d.small, color: AD_SUB, fontWeight: 600 }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(15,23,42,0.10)' }} />
          </div>

          <button onClick={() => setHasManual(true)} style={{ width: '100%', border: '1.5px dashed rgba(15,23,42,0.2)', background: '#fff', borderRadius: d.radius, padding: '30px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
            <Icon name="file-up" size={28} style={{ color: AD_TEAL }} />
            <span style={{ fontSize: d.body, fontWeight: 600, color: AD_INK }}>Upload a PDF</span>
            <span style={{ fontSize: d.small, color: AD_SUB }}>or drag it here</span>
          </button>
        </div>
        <AddCTA d={d} label="Save & build tasks" icon="check" onClick={() => { setHasManual(true); go(3); }} />
      </Screen>
    );
  }

  // ════ CANDIDATES — a photo matched a few look-alikes; the user chooses ════
  if (step === 6) {
    const Cand = ({ c }) => {
      const on = picked === c.id;
      const likely = c.strength === 'likely';
      return (
        <button onClick={() => setPicked(c.id)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 13, background: '#fff', border: `1.5px solid ${on ? AD_TEAL : 'rgba(15,23,42,0.10)'}`, borderRadius: d.radius - 4, padding: d.cardPad, boxShadow: on ? '0 2px 10px rgba(27,107,90,0.10)' : '0 1px 2px rgba(15,23,42,0.04)', cursor: 'pointer' }}>
          <div style={{ width: d.tap + 14, height: d.tap + 14, borderRadius: 12, background: 'linear-gradient(135deg,#EAF3EF,#DCE9E4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="refrigerator" size={24} strokeWidth={1.5} style={{ color: AD_TEAL }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: d.body, fontWeight: 700, color: AD_INK, letterSpacing: -0.2 }}>{c.name}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: likely ? AD_TEAL : AD_SUB, background: likely ? '#E8F2EF' : '#EEF1F0', borderRadius: 99, padding: '2px 7px' }}>{likely ? 'Most likely' : 'Possible'}</span>
            </div>
            <div style={{ fontSize: d.small + 1, color: AD_SUB, marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>{c.model}</div>
            <div style={{ fontSize: d.small, color: AD_SUB, marginTop: 2 }}>{c.note}</div>
          </div>
          <span style={{ width: 20, height: 20, borderRadius: 11, border: `2px solid ${on ? AD_TEAL : '#CBD5E1'}`, background: on ? AD_TEAL : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{on && <Icon name="check" size={12} strokeWidth={3} style={{ color: '#fff' }} />}</span>
        </button>
      );
    };
    return (
      <Screen bg="#F7F8F8" padTop={SB_H} padBottom={0}>
        <AddProgress d={d} phase={1} onBack={back} />
        <div style={{ flex: 1, overflowY: 'auto', padding: `4px ${d.pad}px 150px` }}>
          <Title k="Is it one of these?" sub="Your photo is close to a few models. Pick the closest match — you can fine-tune the details after." />
          <PhotoStrip d={d} icon={it.icon} label="From your photo" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
            {AD_CANDIDATES.map((c) => <Cand key={c.id} c={c} />)}
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `10px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(247,248,248,0.95)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
          <button onClick={() => go(7)} style={{ width: '100%', border: 'none', background: 'transparent', color: AD_TEAL, fontSize: d.small + 1, fontWeight: 700, padding: '8px 0 12px', cursor: 'pointer' }}>None of these match</button>
          <button onClick={() => { const c = AD_CANDIDATES.find((x) => x.id === picked); resolve(c.model, 'photo', 'candidates'); }} style={{ width: '100%', border: 'none', background: AD_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <Icon name="check" size={18} strokeWidth={2.6} /> Use this model
          </button>
        </div>
      </Screen>
    );
  }

  // ════ NARROW IT DOWN — no confident match; offer the reliable signals ════
  if (step === 7) {
    const Route = ({ icon, title, sub, badge, onClick }) => (
      <button onClick={onClick} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 13, background: '#fff', border: '1px solid rgba(15,23,42,0.10)', borderRadius: d.radius - 4, padding: d.cardPad, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', cursor: 'pointer' }}>
        <div style={{ width: d.tap + 10, height: d.tap + 10, borderRadius: 12, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={20} style={{ color: AD_TEAL }} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: d.body, fontWeight: 700, color: AD_INK, letterSpacing: -0.2 }}>{title}</span>
            {badge && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: AD_TEAL, background: '#E8F2EF', borderRadius: 99, padding: '2px 7px' }}>{badge}</span>}
          </div>
          <div style={{ fontSize: d.small, color: AD_SUB, marginTop: 2 }}>{sub}</div>
        </div>
        <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4' }} />
      </button>
    );
    return (
      <Screen bg="#F7F8F8" padTop={SB_H} padBottom={0}>
        <AddProgress d={d} phase={1} onBack={back} />
        <div style={{ flex: 1, overflowY: 'auto', padding: `4px ${d.pad}px ${d.pad}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: d.stack }}>
            <div style={{ width: d.tap + 12, height: d.tap + 12, borderRadius: '50%', background: '#FBF1DD', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="search-x" size={22} style={{ color: AD_AMBER }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: d.big - 3, fontWeight: 800, color: AD_INK, letterSpacing: -0.4, margin: 0, lineHeight: 1.12 }}>Couldn’t pin it down</h1>
              <p style={{ fontSize: d.small + 1, color: AD_SUB, margin: '3px 0 0', lineHeight: 1.4 }}>The photo wasn’t enough to be sure. These get us an exact match:</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
            <Route icon="scan-line" title="Scan the rating label" sub="The sticker with model & serial — exact every time" onClick={() => { setMethod('scan'); go(1); }} />
            <Route icon="keyboard" title="Enter brand & model" sub="Type what’s printed on the label" onClick={() => { setTypeFrom('narrow'); go(8); }} />
            <Route icon="file-text" title="Upload a manual" sub="We’ll pull the model and details from the PDF" onClick={() => { setMethod('manual'); go(1); }} />
            <Route icon="camera" title="Retake the photo" sub="Better light, fill the frame, include the label" onClick={() => { setMethod('photo'); go(1); }} />
          </div>

          {/* where to find the label */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: d.radius - 4, padding: `${d.rowPy}px ${d.cardPad}px`, marginTop: d.stack }}>
            <Icon name="info" size={17} style={{ color: AD_TEAL, flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: d.small + 0.5, color: '#4C5650', lineHeight: 1.45 }}>The rating label is usually inside the door, on the back, or behind a kick-plate near the floor.</span>
          </div>
        </div>
      </Screen>
    );
  }

  // ════ TYPE ENTRY — brand & model ════
  if (step === 8) {
    return (
      <Screen bg="#F7F8F8" padTop={SB_H} padBottom={0}>
        <AddProgress d={d} phase={1} onBack={back} />
        <div style={{ flex: 1, overflowY: 'auto', padding: `4px ${d.pad}px 96px` }}>
          <Title k="Enter brand & model" sub="Even just the brand helps — we’ll match the rest." />
          <Field d={d} label="Brand" placeholder="e.g. LG, Bosch, Samsung…" />
          <Field d={d} label="Model number" placeholder="e.g. LRFVS3006S" hint="Usually printed on the rating label, near the serial number." mono />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: d.small, color: AD_SUB, fontWeight: 600 }}>Can’t find it?</span>
            <button onClick={() => { setMethod('scan'); go(1); }} style={{ border: 'none', background: 'transparent', color: AD_TEAL, fontSize: d.small, fontWeight: 700, padding: 0, cursor: 'pointer' }}>Scan the label instead</button>
          </div>
        </div>
        <AddCTA d={d} label="Find item" icon="search" onClick={() => resolve(it.model, 'typed', 'type')} />
      </Screen>
    );
  }

  // ════ steps 0–2 ════
  let body, cta;

  if (step === 0) {
    body = (
      <React.Fragment>
        <Title k="Add an item" sub="How would you like to identify it?" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
          {AD_METHODS.map((m) => {
            const on = method === m.id;
            return (
              <button key={m.id} onClick={() => setMethod(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, background: '#fff', border: `1.5px solid ${on ? AD_TEAL : 'rgba(15,23,42,0.10)'}`, borderRadius: d.radius - 4, padding: d.cardPad, boxShadow: on ? '0 2px 10px rgba(27,107,90,0.10)' : '0 1px 2px rgba(15,23,42,0.04)', textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ width: d.tap + 10, height: d.tap + 10, borderRadius: 12, background: on ? AD_TEAL : '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={m.icon} size={20} style={{ color: on ? '#fff' : AD_TEAL }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: d.body, fontWeight: 700, color: AD_INK, letterSpacing: -0.2 }}>{m.label}</span>
                    {m.badge && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: AD_TEAL, background: '#E8F2EF', borderRadius: 99, padding: '2px 7px' }}>{m.badge}</span>}
                  </div>
                  <div style={{ fontSize: d.small, color: AD_SUB, marginTop: 2 }}>{m.sub}</div>
                </div>
                <span style={{ width: 20, height: 20, borderRadius: 11, border: `2px solid ${on ? AD_TEAL : '#CBD5E1'}`, background: on ? AD_TEAL : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{on && <Icon name="check" size={12} strokeWidth={3} style={{ color: '#fff' }} />}</span>
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: d.small + 0.5, color: AD_SUB, margin: `${d.stack}px 2px 0`, lineHeight: 1.45 }}>
          The label and model number give the most reliable match. A photo is quick, but lighting and angle can leave us guessing.
        </p>
      </React.Fragment>
    );
    cta = <AddCTA d={d} label="Continue" onClick={() => { if (method === 'search') { setTypeFrom('method'); go(8); } else go(1); }} />;
  }

  if (step === 1) {
    const isManual = method === 'manual';
    const isScan = method === 'scan';
    body = (
      <React.Fragment>
        <Title k={isManual ? 'Upload the manual' : isScan ? 'Scan the rating label' : 'Take a photo'} sub={isManual ? 'Choose a PDF — we’ll read the model and details.' : isScan ? 'Point at the sticker with the model & serial — usually inside the door, on the back, or behind a kick-plate.' : 'Frame the whole appliance. A photo identifies the kind of item; for an exact model, the label is more reliable.'} />
        {isManual ? (
          <button onClick={() => run(2)} style={{ width: '100%', border: '1.5px dashed rgba(15,23,42,0.2)', background: '#fff', borderRadius: d.radius, padding: '38px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <Icon name="file-up" size={30} style={{ color: AD_TEAL }} />
            <span style={{ fontSize: d.body, fontWeight: 600, color: AD_INK }}>Choose a PDF</span>
            <span style={{ fontSize: d.small, color: AD_SUB }}>or drag it here</span>
          </button>
        ) : (
          <React.Fragment>
            <div style={{ position: 'relative', borderRadius: d.radius, overflow: 'hidden', background: '#0E1B17', aspectRatio: '3/4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={isScan ? 'tag' : it.icon} size={84} strokeWidth={1.1} style={{ color: 'rgba(159,231,210,0.4)' }} />
              {[0, 1, 2, 3].map((i) => (
                <span key={i} style={{ position: 'absolute', top: i < 2 ? 18 : 'auto', bottom: i >= 2 ? 18 : 'auto', left: i % 2 === 0 ? 18 : 'auto', right: i % 2 === 1 ? 18 : 'auto', width: 30, height: 30, border: '3px solid rgba(255,255,255,0.85)', borderRadius: 4, borderTop: i < 2 ? undefined : 'none', borderBottom: i >= 2 ? undefined : 'none', borderLeft: i % 2 === 0 ? undefined : 'none', borderRight: i % 2 === 1 ? undefined : 'none' }} />
              ))}
              {isScan && <span style={{ position: 'absolute', left: 18, right: 18, height: 2, background: '#9FE7D2', boxShadow: '0 0 10px #9FE7D2' }} />}
              <button onClick={() => run(isScan ? 2 : 6)} style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', width: 62, height: 62, borderRadius: '50%', background: '#fff', border: '4px solid rgba(255,255,255,0.4)', cursor: 'pointer' }} aria-label="Capture" />
            </div>

            {/* honest capture guidance */}
            <div style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: d.radius - 4, padding: `${d.rowPy + 1}px ${d.cardPad}px`, marginTop: d.stack }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: AD_SUB, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 9 }}>{isScan ? 'For a clean read' : 'For the best read'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(isScan
                  ? [['sun', 'Good, even light — no glare on the sticker'], ['scan-line', 'Fill the frame with the label'], ['type', 'Keep the model & serial text sharp']]
                  : [['sun', 'Good, even lighting — avoid glare and shadow'], ['maximize', 'Fill the frame with the whole appliance'], ['tag', 'Include the brand logo, and the rating label if you can']]
                ).map(([ic, tx]) => (
                  <div key={tx} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Icon name={ic} size={16} style={{ color: AD_TEAL, flexShrink: 0 }} />
                    <span style={{ fontSize: d.small + 1, color: '#4C5650', lineHeight: 1.35 }}>{tx}</span>
                  </div>
                ))}
              </div>
            </div>
          </React.Fragment>
        )}
      </React.Fragment>
    );
    cta = null;
  }

  if (step === 2) {
    const m = match || { model: it.model, source: 'label' };
    const SOURCE = {
      label: { icon: 'scan-line', text: 'Matched from the rating label' },
      photo: { icon: 'camera', text: 'You picked this from your photo' },
      typed: { icon: 'keyboard', text: 'From the model you entered' },
    };
    const src = SOURCE[m.source] || SOURCE.label;
    body = (
      <React.Fragment>
        <Title k="Confirm the match" sub="Check it’s right, pick a room, and it’s in." />
        <div style={{ background: '#fff', borderRadius: d.radius, boxShadow: '0 2px 14px rgba(11,26,22,0.07)', padding: d.cardPad + 2, marginBottom: d.stack }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: d.tap + 26, height: d.tap + 26, borderRadius: 14, background: 'linear-gradient(135deg,#EAF3EF,#DCE9E4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={it.icon} size={30} strokeWidth={1.5} style={{ color: AD_TEAL }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#E8F2EF', color: AD_TEAL, borderRadius: 99, padding: '3px 9px', fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 5 }}><Icon name={src.icon} size={11} /> {src.text}</div>
              <div style={{ fontSize: d.h2, fontWeight: 800, color: AD_INK, letterSpacing: -0.3, lineHeight: 1.1 }}>{it.name}</div>
              <div style={{ fontSize: d.small + 1, color: AD_SUB, marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>{m.model}</div>
            </div>
            <button style={{ border: '1px solid rgba(15,23,42,0.12)', background: '#fff', borderRadius: 9, padding: '6px 10px', fontSize: d.small, fontWeight: 600, color: AD_INK, cursor: 'pointer' }}>Edit</button>
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: AD_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>Which room?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {AD_ROOMS.map((r) => {
            const on = room === r;
            return <button key={r} onClick={() => setRoom(r)} style={{ border: `1px solid ${on ? AD_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? AD_TEAL : '#fff', color: on ? '#fff' : AD_INK, borderRadius: 99, padding: '9px 15px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}>{r}</button>;
          })}
          <button style={{ border: '1px dashed rgba(15,23,42,0.22)', background: 'transparent', color: AD_SUB, borderRadius: 99, padding: '9px 14px', fontSize: d.small + 1, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><Icon name="plus" size={14} /> New</button>
        </div>
        <p style={{ fontSize: d.small + 0.5, color: AD_SUB, margin: `${d.stack}px 0 0`, lineHeight: 1.4 }}>
          Not quite right? <button onClick={() => go(7)} style={{ border: 'none', background: 'transparent', color: AD_TEAL, fontWeight: 700, padding: 0, fontSize: d.small + 0.5, cursor: 'pointer' }}>Try another way</button> — or tap Edit to fix the details.
        </p>
      </React.Fragment>
    );
    cta = <AddCTA d={d} label="Add to my home" icon="check" onClick={() => go(3)} />;
  }

  return (
    <Screen bg="#F7F8F8" padTop={SB_H} padBottom={0}>
      <AddProgress d={d} phase={step === 0 ? 0 : step === 2 ? 2 : 1} onBack={back} atStart={step === 0} />
      <div style={{ flex: 1, overflowY: 'auto', padding: `4px ${d.pad}px ${cta ? 96 : d.pad}px` }}>{body}</div>
      {cta}
      {busy && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(247,248,248,0.92)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 60 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(27,107,90,0.25)', borderTopColor: AD_TEAL, animation: 'adspin 0.8s linear infinite' }} />
          <div style={{ fontSize: d.body, fontWeight: 600, color: AD_INK }}>{method === 'photo' ? 'Looking for a match…' : 'Reading the details…'}</div>
          <style>{'@keyframes adspin{to{transform:rotate(360deg)}}'}</style>
        </div>
      )}
    </Screen>
  );
}

Object.assign(window, { AddItemFlow });
