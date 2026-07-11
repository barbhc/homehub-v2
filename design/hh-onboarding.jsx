// ── Homehub · Onboarding ────────────────────────────────────────────────────
// First-run: welcome → home profile (type · tenure · concerns · preferred mode)
// → add first item → done. Every question step has Back / Next / Skip for now,
// mirroring OnboardingProfile + OnboardingInventory. Answers feel optional.

const { useState: useObS } = React;

const OB_INK = '#0B1220', OB_SUB = '#6B7280', OB_TEAL = '#1B6B5A', OB_BG = '#F3F5F4';
const OB_STEPS = 5; // question/add steps (welcome + done sit outside the bar)

const OB_TYPES = [
  { id: 'house', icon: 'house', label: 'House' },
  { id: 'apartment', icon: 'building-2', label: 'Apartment' },
  { id: 'condo', icon: 'building', label: 'Condo' },
  { id: 'townhouse', icon: 'house-plus', label: 'Townhouse' },
];
const OB_TENURE = ['Just moved in', 'Under a year', '1–5 years', '5+ years'];
const OB_CONCERNS = [
  { id: 'upkeep', icon: 'list-checks', label: 'Staying on top of upkeep' },
  { id: 'warranty', icon: 'shield-check', label: 'Tracking warranties' },
  { id: 'manuals', icon: 'book-open', label: 'Keeping manuals handy' },
  { id: 'clean', icon: 'sparkles', label: 'Knowing how to clean things' },
  { id: 'notsure', icon: 'circle-help', label: 'Not sure yet' },
];
const OB_MODES = [
  { id: 'tasks', icon: 'check-check', label: 'Show me what’s due', sub: 'Open to today’s tasks' },
  { id: 'ask', icon: 'sparkles', label: 'Let me ask questions', sub: 'Open to the assistant' },
  { id: 'balance', icon: 'layout-grid', label: 'A balance of both', sub: 'A calm overview' },
];

function ObChip({ d, on, onClick, children, icon }) {
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1.5px solid ${on ? OB_TEAL : 'rgba(15,23,42,0.12)'}`, background: on ? '#E8F2EF' : '#fff', color: on ? OB_TEAL : OB_INK, borderRadius: 14, padding: `${d.rowPy}px ${d.cardPad}px`, fontSize: d.body, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
      {icon && <Icon name={icon} size={18} style={{ color: on ? OB_TEAL : OB_SUB, flexShrink: 0 }} />}
      <span style={{ flex: 1 }}>{children}</span>
      {on && <Icon name="check" size={16} strokeWidth={3} />}
    </button>
  );
}

function OnboardingFlow({ d, onDone, onAddItem, startStep = 0 }) {
  const [step, setStep] = useObS(startStep); // 0 welcome · 1..5 questions/add · 6 done
  const [type, setType] = useObS(null);
  const [tenure, setTenure] = useObS(null);
  const [concerns, setConcerns] = useObS([]);
  const [mode, setMode] = useObS(null);

  const toggleConcern = (id) => setConcerns((c) => {
    if (id === 'notsure') return c.includes('notsure') ? [] : ['notsure'];
    const next = c.filter((x) => x !== 'notsure');
    return next.includes(id) ? next.filter((x) => x !== id) : [...next, id];
  });

  const Title = ({ k, sub }) => (
    <div style={{ marginBottom: d.stack }}>
      <h1 style={{ fontSize: d.big - 1, fontWeight: 800, color: OB_INK, letterSpacing: -0.6, margin: 0, lineHeight: 1.12, textWrap: 'balance' }}>{k}</h1>
      {sub && <p style={{ fontSize: d.body, color: OB_SUB, margin: '7px 0 0', lineHeight: 1.4 }}>{sub}</p>}
    </div>
  );

  // ── welcome ──
  if (step === 0) {
    return (
      <Screen bg={OB_BG} padTop={SB_H} padBottom={0}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: `0 ${d.pad + 6}px` }}>
          <div style={{ width: 76, height: 76, borderRadius: 22, background: 'linear-gradient(150deg,#1B6B5A,#2D9B82)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}><Icon name="house" size={36} strokeWidth={1.8} style={{ color: '#fff' }} /></div>
          <h1 style={{ fontSize: d.big + 1, fontWeight: 800, color: OB_INK, letterSpacing: -0.6, margin: 0 }}>Welcome to Homehub</h1>
          <p style={{ fontSize: d.body + 1, color: OB_SUB, margin: '12px 0 0', lineHeight: 1.5, maxWidth: 300 }}>The calm way to look after your home — upkeep, manuals, and warranties, all in one place. A few quick questions to set things up.</p>
        </div>
        <div style={{ padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, display: 'flex', flexDirection: 'column', gap: d.gap }}>
          <button onClick={() => setStep(1)} style={{ width: '100%', border: 'none', background: OB_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, cursor: 'pointer' }}>Get started</button>
          <button onClick={() => onDone({ concerns, mode, type, tenure })} style={{ width: '100%', border: 'none', background: 'transparent', color: OB_SUB, padding: '10px 0 2px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}>I’ll explore on my own</button>
        </div>
      </Screen>
    );
  }

  // ── done ──
  if (step === 6) {
    return (
      <Screen bg="#FFFFFF" padTop={SB_H} padBottom={0}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: `0 ${d.pad + 6}px` }}>
          <div style={{ width: 78, height: 78, borderRadius: '50%', background: '#E8F2EF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}><Icon name="check" size={40} strokeWidth={2.6} style={{ color: OB_TEAL }} /></div>
          <h1 style={{ fontSize: d.big, fontWeight: 800, color: OB_INK, letterSpacing: -0.5, margin: 0 }}>You’re all set, Barb</h1>
          <p style={{ fontSize: d.body, color: OB_SUB, margin: '10px 0 0', lineHeight: 1.5, maxWidth: 290 }}>Homehub is tuned to your home. Add items anytime and we’ll handle the reminders, manuals and warranties.</p>
        </div>
        <div style={{ padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))` }}>
          <button onClick={() => onDone({ concerns, mode, type, tenure })} style={{ width: '100%', border: 'none', background: OB_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, cursor: 'pointer' }}>Go to Homehub</button>
        </div>
      </Screen>
    );
  }

  // ── question steps ──
  let body;
  if (step === 1) {
    body = (
      <React.Fragment>
        <Title k="What kind of home is it?" sub="So we suggest the right upkeep." />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: d.gap }}>
          {OB_TYPES.map((o) => (
            <button key={o.id} onClick={() => setType(o.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, border: `1.5px solid ${type === o.id ? OB_TEAL : 'rgba(15,23,42,0.12)'}`, background: type === o.id ? '#E8F2EF' : '#fff', borderRadius: d.radius - 2, padding: d.cardPad, cursor: 'pointer' }}>
              <Icon name={o.icon} size={24} style={{ color: type === o.id ? OB_TEAL : OB_SUB }} />
              <span style={{ fontSize: d.body, fontWeight: 700, color: OB_INK }}>{o.label}</span>
            </button>
          ))}
        </div>
      </React.Fragment>
    );
  } else if (step === 2) {
    body = (
      <React.Fragment>
        <Title k="Do you own or rent?" />
        <div style={{ display: 'flex', gap: d.gap, marginBottom: d.stack }}>
          {['Own', 'Rent'].map((o) => <ObChip key={o} d={d} on={tenure && tenure.own === o} onClick={() => setTenure((t) => ({ ...(t || {}), own: o }))}>{o}</ObChip>)}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: OB_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>How long have you been here?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap - 2 }}>
          {OB_TENURE.map((o) => <ObChip key={o} d={d} on={tenure && tenure.dur === o} onClick={() => setTenure((t) => ({ ...(t || {}), dur: o }))}>{o}</ObChip>)}
        </div>
      </React.Fragment>
    );
  } else if (step === 3) {
    body = (
      <React.Fragment>
        <Title k="What matters most to you?" sub="Pick any — we’ll lead with these." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap - 2 }}>
          {OB_CONCERNS.map((o) => <ObChip key={o.id} d={d} icon={o.icon} on={concerns.includes(o.id)} onClick={() => toggleConcern(o.id)}>{o.label}</ObChip>)}
        </div>
      </React.Fragment>
    );
  } else if (step === 4) {
    body = (
      <React.Fragment>
        <Title k="How do you like to start?" sub="You can change this anytime in Settings." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
          {OB_MODES.map((o) => (
            <button key={o.id} onClick={() => setMode(o.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, border: `1.5px solid ${mode === o.id ? OB_TEAL : 'rgba(15,23,42,0.12)'}`, background: mode === o.id ? '#E8F2EF' : '#fff', borderRadius: d.radius - 2, padding: d.cardPad, cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: d.tap + 10, height: d.tap + 10, borderRadius: 12, background: mode === o.id ? OB_TEAL : '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={o.icon} size={20} style={{ color: mode === o.id ? '#fff' : OB_TEAL }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: d.body, fontWeight: 700, color: OB_INK }}>{o.label}</div>
                <div style={{ fontSize: d.small, color: OB_SUB, marginTop: 1 }}>{o.sub}</div>
              </div>
              {mode === o.id && <Icon name="check" size={18} strokeWidth={3} style={{ color: OB_TEAL }} />}
            </button>
          ))}
        </div>
      </React.Fragment>
    );
  } else if (step === 5) {
    body = (
      <React.Fragment>
        <Title k="Add your first item" sub="An appliance or fixture — we’ll take it from there. You can add the rest later." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
          {[{ icon: 'camera', label: 'Snap a photo', sub: 'We’ll identify it' }, { icon: 'scan-line', label: 'Scan the label', sub: 'Model & serial' }, { icon: 'search', label: 'Search by model', sub: 'Type a brand or model' }].map((m) => (
            <button key={m.label} onClick={() => onAddItem({ concerns, mode, type, tenure })} style={{ display: 'flex', alignItems: 'center', gap: 13, background: '#fff', border: '1px solid rgba(15,23,42,0.10)', borderRadius: d.radius - 4, padding: d.cardPad, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: d.tap + 10, height: d.tap + 10, borderRadius: 12, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={m.icon} size={20} style={{ color: OB_TEAL }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: d.body, fontWeight: 700, color: OB_INK }}>{m.label}</div>
                <div style={{ fontSize: d.small, color: OB_SUB, marginTop: 1 }}>{m.sub}</div>
              </div>
              <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4' }} />
            </button>
          ))}
        </div>
      </React.Fragment>
    );
  }

  const next = () => setStep(step + 1);

  return (
    <Screen bg={OB_BG} padTop={SB_H} padBottom={0}>
      {/* progress + back */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `4px ${d.pad - 6}px 12px` }}>
        <button onClick={() => setStep(step - 1)} style={{ border: 'none', background: 'transparent', color: OB_TEAL, padding: '6px', display: 'flex', cursor: 'pointer' }}><Icon name="chevron-left" size={24} strokeWidth={2.2} /></button>
        <div style={{ flex: 1, display: 'flex', gap: 5, justifyContent: 'center' }}>
          {Array.from({ length: OB_STEPS }).map((_, i) => <span key={i} style={{ height: 4, borderRadius: 2, flex: 1, maxWidth: 38, background: i < step ? OB_TEAL : 'rgba(15,23,42,0.12)', transition: 'background .2s' }} />)}
        </div>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `6px ${d.pad}px 96px` }}>{body}</div>

      {/* CTA */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `10px ${d.pad}px calc(12px + env(safe-area-inset-bottom))`, background: 'rgba(243,245,244,0.95)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={next} style={{ border: 'none', background: 'transparent', color: OB_SUB, fontSize: d.small + 1, fontWeight: 600, padding: '12px 6px', cursor: 'pointer' }}>Skip for now</button>
        <button onClick={next} style={{ flex: 1, border: 'none', background: OB_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, cursor: 'pointer' }}>{step === 5 ? 'Finish' : 'Continue'}</button>
      </div>
    </Screen>
  );
}

Object.assign(window, { OnboardingFlow });

// ── Onboarding → app ─────────────────────────────────────────────────────────
// Carries the profile answers into a live shell so the concerns the user picked
// actually lead on Home, and “how you like to start” picks the landing tab.
function OnboardingApp({ d, initialLevel = 'simple' }) {
  const [prefs, setPrefs] = useObS(null); // null while onboarding; object once done
  const finish = (p) => setPrefs(p || {});
  if (!prefs) {
    return <PhoneFrame statusDark bg={OB_BG}><OnboardingFlow d={d} onDone={finish} onAddItem={finish} /></PhoneFrame>;
  }
  const startTab = prefs.mode === 'ask' ? 'ask' : 'home';
  return <AppShell d={d} startTab={startTab} initialLevel={initialLevel} concerns={prefs.concerns || []} />;
}

Object.assign(window, { OnboardingFlow, OnboardingApp });
