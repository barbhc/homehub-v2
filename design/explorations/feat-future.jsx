// ── Homehub · Future-feature explorations ────────────────────────────────────
// 1) Multiple properties — a switcher (toggle only; no cross-property merge).
// 2) Task / troubleshooting → contact a service provider — two flows
//    (provider already saved · provider needs to be found).
// Reuses feat-shared.jsx atoms (FeNav/FeCard/FeBtn/FeCheck/FE_* colors).

const { useState: useFutS } = React;

// ── sample data ──────────────────────────────────────────────────────────────
const PROPS = [
  { id: 'maple', name: 'Maple Street', addr: '128 Maple St', type: 'Single-family', items: 25, due: 3, icon: 'house' },
  { id: 'lake', name: 'Lake Cabin', addr: '4 Lakeshore Rd', type: 'Cabin · seasonal', items: 9, due: 1, icon: 'trees' },
  { id: 'oak', name: 'Oak Ave Rental', addr: '77 Oak Ave #3', type: 'Condo · renting', items: 6, due: 0, icon: 'building' },
];
const PRO_PROBLEM = {
  item: 'Carrier Furnace', room: 'Utility', model: '59TP6A', symptom: 'Not igniting — no heat',
  tried: ['Checked thermostat batteries', 'Reset the furnace switch', 'Confirmed the gas valve is on'],
};
const PRO_SAVED = { name: 'Reliable HVAC Co.', cat: 'HVAC', phone: '(415) 555-0182', last: 'Serviced your furnace · Nov 2025', initials: 'RH' };
const PRO_MATCHES = [
  { id: 'm1', name: 'Bay Area Heating & Air', cat: 'HVAC', rating: 4.8, jobs: '320+ jobs', dist: '2.1 mi', why: 'Top rated nearby', initials: 'BA' },
  { id: 'm2', name: 'Comfort Pros HVAC', cat: 'HVAC', rating: 4.6, jobs: '150+ jobs', dist: '3.4 mi', why: 'Services Carrier furnaces', initials: 'CP' },
  { id: 'm3', name: 'Golden Gate Mechanical', cat: 'HVAC', rating: 4.9, jobs: '500+ jobs', dist: '5.0 mi', why: 'Highly rated', initials: 'GM' },
];

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 1 · MULTIPLE PROPERTIES — three switcher patterns
// ════════════════════════════════════════════════════════════════════════════

// shared: a tiny home preview under the switcher so context is felt
function PropHomePreview({ d, prop }) {
  return (
    <div style={{ padding: `0 ${d.pad}px`, marginTop: d.stack }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: FE_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10, paddingLeft: 2 }}>Today · {prop.name}</div>
      <FeCard d={d} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="wind" size={22} style={{ color: FE_TEAL }} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: d.body, fontWeight: 700, color: FE_INK }}>{prop.due > 0 ? `${prop.due} task${prop.due > 1 ? 's' : ''} due` : 'All caught up'}</div>
          <div style={{ fontSize: d.small, color: FE_SUB, marginTop: 1 }}>{prop.items} items · {prop.type}</div>
        </div>
      </FeCard>
    </div>
  );
}

// A · HEADER + SWITCH SHEET — property name in the Home header opens a sheet
function PropOptionA({ d }) {
  const [active, setActive] = useFutS('maple');
  const [sheet, setSheet] = useFutS(false);
  const cur = PROPS.find((p) => p.id === active);
  return (
    <Screen bg={FE_BG}>
      <div style={{ height: SB_H }} />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        <div style={{ padding: `10px ${d.pad}px 0` }}>
          <div style={{ fontSize: d.small + 1, color: FE_SUB, fontWeight: 600 }}>Good morning, Barb</div>
          <button onClick={() => setSheet(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'transparent', padding: '4px 0', cursor: 'pointer' }}>
            <h1 style={{ fontSize: d.big, fontWeight: 800, color: FE_INK, letterSpacing: -0.6, margin: 0 }}>{cur.name}</h1>
            <span style={{ width: 26, height: 26, borderRadius: 13, background: '#fff', border: '1px solid rgba(15,23,42,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="chevrons-up-down" size={15} style={{ color: FE_SUB }} /></span>
          </button>
          <div style={{ fontSize: d.small + 1, color: FE_SUB, marginTop: 1 }}>{cur.addr}</div>
        </div>
        <PropHomePreview d={d} prop={cur} />
        <div style={{ padding: `${d.stack}px ${d.pad}px 0` }}>
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#F1F5F4', borderRadius: 12, padding: '11px 13px' }}>
            <Icon name="info" size={15} style={{ color: FE_TEAL, marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: d.small + 1, color: '#3A4A45', lineHeight: 1.45 }}>The whole app stays scoped to one property at a time — tap the name to switch. Nothing is merged across homes.</span>
          </div>
        </div>
      </div>
      {sheet && (
        <React.Fragment>
          <div onClick={() => setSheet(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(8,12,11,0.4)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#fff', borderRadius: '20px 20px 0 0', padding: `16px ${d.pad}px calc(18px + env(safe-area-inset-bottom))`, boxShadow: '0 -8px 30px rgba(0,0,0,0.18)' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(15,23,42,0.15)', margin: '0 auto 14px' }} />
            <div style={{ fontSize: d.body + 2, fontWeight: 800, color: FE_INK, letterSpacing: -0.3, marginBottom: 12 }}>Your properties</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
              {PROPS.map((p) => {
                const on = p.id === active;
                return (
                  <button key={p.id} onClick={() => { setActive(p.id); setSheet(false); }} style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: on ? '#EAF3EF' : '#fff', border: `1.5px solid ${on ? FE_TEAL : 'rgba(15,23,42,0.10)'}`, borderRadius: 14, padding: d.cardPad, cursor: 'pointer' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: on ? FE_TEAL : '#EEF2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={p.icon} size={20} style={{ color: on ? '#fff' : FE_TEAL }} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: d.body, fontWeight: 700, color: FE_INK }}>{p.name}</div>
                      <div style={{ fontSize: d.small, color: FE_SUB, marginTop: 1 }}>{p.items} items · {p.due} due</div>
                    </div>
                    {on && <Icon name="check" size={18} strokeWidth={2.6} style={{ color: FE_TEAL }} />}
                  </button>
                );
              })}
            </div>
            <button style={{ width: '100%', marginTop: d.gap + 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1.5px dashed rgba(15,23,42,0.2)', background: '#fff', color: FE_TEAL, borderRadius: 14, padding: '13px 0', fontSize: d.body, fontWeight: 700, cursor: 'pointer' }}><Icon name="plus" size={17} /> Add a property</button>
          </div>
        </React.Fragment>
      )}
    </Screen>
  );
}

// B · PROPERTIES HUB — a managed list (switch + manage), reached from Settings
function PropOptionB({ d }) {
  const [active, setActive] = useFutS('maple');
  return (
    <Screen bg={FE_BG}>
      <FeNav d={d} title="Settings" />
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px` }}>
        <h1 style={{ fontSize: d.big - 2, fontWeight: 800, color: FE_INK, letterSpacing: -0.5, margin: '2px 0 4px' }}>Your properties</h1>
        <p style={{ fontSize: d.small + 1, color: FE_SUB, margin: `0 0 ${d.stack}px`, lineHeight: 1.45 }}>Switch the home you're managing. Each keeps its own items, tasks and history.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
          {PROPS.map((p) => {
            const on = p.id === active;
            return (
              <button key={p.id} onClick={() => setActive(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, textAlign: 'left', background: '#fff', border: `1.5px solid ${on ? FE_TEAL : 'rgba(15,23,42,0.10)'}`, borderRadius: 16, padding: d.cardPad + 2, cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,23,42,0.05)' }}>
                <div style={{ width: 46, height: 46, borderRadius: 13, background: on ? FE_TEAL : '#EEF2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={p.icon} size={22} style={{ color: on ? '#fff' : FE_TEAL }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: d.body + 1, fontWeight: 700, color: FE_INK }}>{p.name}</span>
                    {on && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: FE_TEALD, background: '#DCEDE7', borderRadius: 99, padding: '2px 7px' }}>Active</span>}
                  </div>
                  <div style={{ fontSize: d.small, color: FE_SUB, marginTop: 2 }}>{p.addr}</div>
                  <div style={{ fontSize: d.small, color: FE_SUB, marginTop: 4 }}>{p.items} items · {p.due} due · {p.type}</div>
                </div>
                <Icon name="chevron-right" size={18} style={{ color: FE_FAINT, flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
        <button style={{ width: '100%', marginTop: d.stack, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1.5px dashed rgba(15,23,42,0.2)', background: '#fff', color: FE_TEAL, borderRadius: 14, padding: '15px 0', fontSize: d.body, fontWeight: 700, cursor: 'pointer' }}><Icon name="plus" size={17} /> Add a property</button>
      </div>
    </Screen>
  );
}

// C · PERSISTENT PILLS — a switcher row pinned under the Home title
function PropOptionC({ d }) {
  const [active, setActive] = useFutS('maple');
  const cur = PROPS.find((p) => p.id === active);
  return (
    <Screen bg={FE_BG}>
      <div style={{ height: SB_H }} />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        <div style={{ padding: `10px ${d.pad}px 0` }}>
          <h1 style={{ fontSize: d.big, fontWeight: 800, color: FE_INK, letterSpacing: -0.6, margin: 0 }}>Home</h1>
        </div>
        {/* switcher pills */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: `${d.gap + 2}px ${d.pad}px 2px`, scrollbarWidth: 'none' }}>
          {PROPS.map((p) => {
            const on = p.id === active;
            return (
              <button key={p.id} onClick={() => setActive(p.id)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, border: `1.5px solid ${on ? 'transparent' : 'rgba(15,23,42,0.14)'}`, background: on ? FE_TEAL : '#fff', color: on ? '#fff' : FE_INK, borderRadius: 99, padding: '9px 14px', fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}>
                <Icon name={p.icon} size={14} style={{ color: on ? '#fff' : FE_TEAL }} /> {p.name}
                {p.due > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, background: on ? 'rgba(255,255,255,0.25)' : '#EAF3EF', color: on ? '#fff' : FE_TEALD, borderRadius: 99, padding: '1px 6px' }}>{p.due}</span>}
              </button>
            );
          })}
          <button style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 99, border: '1.5px dashed rgba(15,23,42,0.2)', background: '#fff', color: FE_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="plus" size={17} /></button>
        </div>
        <PropHomePreview d={d} prop={cur} />
        <div style={{ padding: `${d.stack}px ${d.pad}px 0` }}>
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#F1F5F4', borderRadius: 12, padding: '11px 13px' }}>
            <Icon name="layers" size={15} style={{ color: FE_TEAL, marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: d.small + 1, color: '#3A4A45', lineHeight: 1.45 }}>Always-visible pills make switching a single tap — best when someone actively juggles 2–3 homes.</span>
          </div>
        </div>
      </div>
    </Screen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 2 · TASK / TROUBLESHOOT → CONTACT A PRO
// ════════════════════════════════════════════════════════════════════════════

// Shared: the auto-attached problem summary (what Homehub knows + what was tried)
function ProProblemCard({ d, editable }) {
  return (
    <div style={{ background: '#fff', borderRadius: d.radius - 4, border: '1px solid rgba(15,23,42,0.08)', boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: `11px ${d.cardPad}px`, borderBottom: '0.5px solid rgba(15,23,42,0.07)', background: '#FAFBFB' }}>
        <Icon name="paperclip" size={14} style={{ color: FE_SUB }} />
        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: FE_SUB, letterSpacing: 0.4, textTransform: 'uppercase' }}>Problem details — attached</span>
        {editable && <span style={{ fontSize: d.small, color: FE_TEAL, fontWeight: 700 }}>Edit</span>}
      </div>
      <div style={{ padding: d.cardPad }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="wind" size={19} style={{ color: FE_TEAL }} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: d.body, fontWeight: 700, color: FE_INK }}>{PRO_PROBLEM.item}</div>
            <div style={{ fontSize: d.small, color: FE_SUB }}>{PRO_PROBLEM.room} · model {PRO_PROBLEM.model}</div>
          </div>
        </div>
        <div style={{ fontSize: d.small + 1, color: FE_INK, fontWeight: 600, marginBottom: 7 }}>“{PRO_PROBLEM.symptom}”</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: FE_SUB, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>Already tried</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {PRO_PROBLEM.tried.map((t) => (
            <div key={t} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: d.small + 1, color: '#3A4A45' }}><Icon name="check" size={14} style={{ color: FE_TEAL, flexShrink: 0, marginTop: 2 }} /> {t}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Entry point — a troubleshooting step that escalates to a pro
function ProEntry({ d }) {
  return (
    <Screen bg="#FFFFFF">
      <FeNav d={d} title="Furnace" />
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#FBF1EC', color: '#C2410C', borderRadius: 99, padding: '4px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}><Icon name="wrench" size={11} /> Troubleshooting</span>
          <h1 style={{ fontSize: d.big - 3, fontWeight: 800, color: FE_INK, letterSpacing: -0.5, margin: '10px 0 0' }}>Furnace won't ignite</h1>
        </div>
        <FeCard d={d}>
          <div style={{ fontSize: 11, fontWeight: 700, color: FE_SUB, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>Things to try yourself</div>
          {PRO_PROBLEM.tried.map((t, i) => (
            <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0' }}>
              <FeCheck on size={22} /><span style={{ fontSize: d.body, color: FE_SUB, textDecoration: 'line-through' }}>{t}</span>
            </div>
          ))}
        </FeCard>
        <div style={{ background: '#0E2E27', borderRadius: d.radius - 2, padding: d.cardPad + 2, color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
            <Icon name="badge-alert" size={18} style={{ color: '#9FE7D2' }} />
            <span style={{ fontSize: d.body, fontWeight: 800, letterSpacing: -0.2 }}>This one needs a pro</span>
          </div>
          <p style={{ fontSize: d.small + 1, color: 'rgba(255,255,255,0.78)', lineHeight: 1.5, margin: '0 0 14px' }}>A no-ignition fault usually means the igniter or gas valve — best handled by a licensed HVAC tech. We'll pass along everything you tried.</p>
          <FeBtn d={d} icon="user-round-check" style={{ width: '100%', background: '#fff', color: '#0E2E27' }}>Get a pro on this</FeBtn>
        </div>
      </div>
    </Screen>
  );
}

// FLOW A — provider already saved: compose (prefilled) → sent
function ProFlowSaved({ d }) {
  const [step, setStep] = useFutS('compose');
  if (step === 'sent') {
    return (
      <Screen bg="#FFFFFF">
        <FeNav d={d} title="Furnace" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `0 ${d.pad}px`, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 36, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><Icon name="send" size={32} style={{ color: FE_TEAL }} /></div>
          <h1 style={{ fontSize: d.big - 2, fontWeight: 800, color: FE_INK, letterSpacing: -0.5, margin: 0 }}>Sent to {PRO_SAVED.name}</h1>
          <p style={{ fontSize: d.body, color: FE_SUB, lineHeight: 1.5, margin: '10px 0 0', maxWidth: 300 }}>Your problem details went over. We'll log this as a service request on the furnace and track their reply.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <FeBtn d={d} kind="ghost" icon="phone" onClick={() => {}}>Call instead</FeBtn>
            <FeBtn d={d} icon="check" onClick={() => setStep('compose')}>Done</FeBtn>
          </div>
        </div>
      </Screen>
    );
  }
  return (
    <Screen bg={FE_BG} padBottom={96}>
      <FeNav d={d} title="Furnace" />
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        <h1 style={{ fontSize: d.big - 3, fontWeight: 800, color: FE_INK, letterSpacing: -0.5, margin: '2px 0 0' }}>Contact a pro</h1>
        <div>
          <FeLabel>Your HVAC provider</FeLabel>
          <FeCard d={d} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EAF3EF', color: FE_TEALD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{PRO_SAVED.initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: d.body, fontWeight: 700, color: FE_INK }}>{PRO_SAVED.name}</div>
              <div style={{ fontSize: d.small, color: FE_SUB, marginTop: 1 }}>{PRO_SAVED.last}</div>
            </div>
            <span style={{ fontSize: d.small, color: FE_TEAL, fontWeight: 700 }}>Change</span>
          </FeCard>
        </div>
        <div>
          <FeLabel>Message</FeLabel>
          <div style={{ background: '#fff', borderRadius: d.radius - 4, border: '1px solid rgba(15,23,42,0.10)', padding: d.cardPad, fontSize: d.body, color: FE_INK, lineHeight: 1.5 }}>
            Hi — my Carrier furnace isn't igniting (no heat). I've already checked the thermostat, reset the switch, and confirmed the gas is on. Could you take a look?
          </div>
        </div>
        <ProProblemCard d={d} editable />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(243,245,244,0.95)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)', display: 'flex', gap: d.gap }}>
        <FeBtn d={d} kind="ghost" icon="phone" style={{ flex: 1 }}>Call</FeBtn>
        <FeBtn d={d} icon="send" style={{ flex: 1.5 }} onClick={() => setStep('sent')}>Send request</FeBtn>
      </div>
    </Screen>
  );
}

// FLOW B — no provider saved: matches → detail+save → compose
function ProFlowFind({ d }) {
  const [step, setStep] = useFutS('match');
  const [picked, setPicked] = useFutS(null);
  const pro = PRO_MATCHES.find((m) => m.id === picked);

  if (step === 'match') {
    return (
      <Screen bg={FE_BG}>
        <FeNav d={d} title="Furnace" />
        <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px` }}>
          <h1 style={{ fontSize: d.big - 3, fontWeight: 800, color: FE_INK, letterSpacing: -0.5, margin: '2px 0 4px' }}>Find an HVAC pro</h1>
          <p style={{ fontSize: d.small + 1, color: FE_SUB, margin: `0 0 ${d.stack}px`, lineHeight: 1.45 }}>You don't have an HVAC provider saved yet. Here are well-rated pros near you.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
            {PRO_MATCHES.map((m) => (
              <button key={m.id} onClick={() => { setPicked(m.id); setStep('detail'); }} style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: '#fff', border: '1px solid rgba(15,23,42,0.10)', borderRadius: 16, padding: d.cardPad, cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,23,42,0.05)' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EAF3EF', color: FE_TEALD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{m.initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: d.body, fontWeight: 700, color: FE_INK }}>{m.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: d.small, color: FE_SUB }}>
                    <Icon name="star" size={12} style={{ color: '#8A5A12' }} /> {m.rating} · {m.jobs} · {m.dist}
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 10.5, fontWeight: 700, color: FE_TEALD, background: '#EAF3EF', borderRadius: 99, padding: '2px 8px' }}><Icon name="sparkles" size={10} /> {m.why}</span>
                </div>
                <Icon name="chevron-right" size={18} style={{ color: FE_FAINT, flexShrink: 0 }} />
              </button>
            ))}
          </div>
          <p style={{ fontSize: d.small, color: FE_FAINT, margin: `${d.stack}px 4px 20px`, lineHeight: 1.4, textAlign: 'center' }}>Or enter a pro you already know →</p>
        </div>
      </Screen>
    );
  }

  // detail + save + contact
  return (
    <Screen bg={FE_BG} padBottom={150}>
      <FeNav d={d} title="Find a pro" />
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 54, height: 54, borderRadius: 15, background: '#EAF3EF', color: FE_TEALD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 800, flexShrink: 0 }}>{pro.initials}</div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: d.big - 4, fontWeight: 800, color: FE_INK, letterSpacing: -0.4, margin: 0 }}>{pro.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: d.small + 1, color: FE_SUB }}><Icon name="star" size={13} style={{ color: '#8A5A12' }} /> {pro.rating} · {pro.jobs} · {pro.dist}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#EAF3EF', borderRadius: 12, padding: '11px 13px' }}>
          <Icon name="bookmark-plus" size={16} style={{ color: FE_TEALD, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: d.small + 1, color: '#274C44', fontWeight: 600 }}>We'll save them to your providers under HVAC.</span>
        </div>
        <div>
          <FeLabel>Message</FeLabel>
          <div style={{ background: '#fff', borderRadius: d.radius - 4, border: '1px solid rgba(15,23,42,0.10)', padding: d.cardPad, fontSize: d.body, color: FE_INK, lineHeight: 1.5 }}>
            Hi — my Carrier furnace isn't igniting (no heat). I've already checked the thermostat, reset the switch, and confirmed the gas is on. Are you available this week?
          </div>
        </div>
        <ProProblemCard d={d} editable />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(243,245,244,0.95)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)', display: 'flex', gap: d.gap }}>
        <FeBtn d={d} kind="ghost" icon="bookmark" style={{ flex: 1 }} onClick={() => setStep('match')}>Save only</FeBtn>
        <FeBtn d={d} icon="send" style={{ flex: 1.5 }} onClick={() => setStep('match')}>Save &amp; send</FeBtn>
      </div>
    </Screen>
  );
}

Object.assign(window, { PropOptionA, PropOptionB, PropOptionC, ProEntry, ProFlowSaved, ProFlowFind });
