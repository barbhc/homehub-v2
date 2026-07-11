// ── Homehub · P2-9 — Notification preferences (3 options) ─────────────────────
// What gets sent, when. Options differ in control granularity:
//   A · Simple toggles  — a short on/off list of event types
//   B · Channel matrix  — per-event × Push / Email control
//   C · Cadence-first   — choose reach-out rhythm + critical overrides

const NT_EVENTS = [
  { id: 'tasks', icon: 'list-checks', label: 'Task reminders', sub: 'When upkeep is due' },
  { id: 'warranty', icon: 'shield-check', label: 'Warranty expiring', sub: '30 days before coverage ends' },
  { id: 'recall', icon: 'megaphone', label: 'Safety & recall notices', sub: 'For items you own' },
  { id: 'digest', icon: 'newspaper', label: 'Weekly digest', sub: 'Your week, every Monday' },
];

function NtToggle({ on, onChange }) {
  return (
    <button onClick={onChange} style={{ width: 46, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', background: on ? FE_TEAL : 'rgba(15,23,42,0.18)', position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 22, height: 22, borderRadius: 11, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left .15s' }} />
    </button>
  );
}

// ════ A · SIMPLE TOGGLES ═════════════════════════════════════════════════════
function NotifOptionA({ d }) {
  const [on, setOn] = useFeS({ tasks: true, warranty: true, recall: true, digest: false });
  return (
    <Screen bg={FE_BG}>
      <FeNav d={d} title="Settings" />
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px` }}>
        <h1 style={{ fontSize: d.big - 2, fontWeight: 800, color: FE_INK, letterSpacing: -0.5, margin: '2px 0 4px' }}>Notifications</h1>
        <p style={{ fontSize: d.small + 1, color: FE_SUB, margin: `0 0 ${d.stack}px`, lineHeight: 1.45 }}>Choose what Homehub lets you know about.</p>
        <FeCard d={d} pad={0}>
          {NT_EVENTS.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>
              <div style={{ width: d.tap, height: d.tap, borderRadius: 9, background: '#EEF2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={e.icon} size={17} style={{ color: FE_TEAL }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: d.body, fontWeight: 600, color: FE_INK }}>{e.label}</div>
                <div style={{ fontSize: d.small, color: FE_SUB, marginTop: 1 }}>{e.sub}</div>
              </div>
              <NtToggle on={on[e.id]} onChange={() => setOn((s) => ({ ...s, [e.id]: !s[e.id] }))} />
            </div>
          ))}
        </FeCard>
        <p style={{ fontSize: d.small, color: FE_FAINT, margin: `${d.gap + 2}px 4px 0`, lineHeight: 1.4 }}>Safety notices are always delivered, even when other alerts are off.</p>
      </div>
    </Screen>
  );
}

// ════ B · CHANNEL MATRIX ═════════════════════════════════════════════════════
function NotifOptionB({ d }) {
  const [m, setM] = useFeS({
    tasks: { push: true, email: false }, warranty: { push: true, email: true },
    recall: { push: true, email: true }, digest: { push: false, email: true },
  });
  const flip = (id, ch) => setM((s) => ({ ...s, [id]: { ...s[id], [ch]: !s[id][ch] } }));
  const Cell = ({ id, ch }) => (
    <button onClick={() => flip(id, ch)} style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${m[id][ch] ? FE_TEAL : 'rgba(15,23,42,0.16)'}`, background: m[id][ch] ? FE_TEAL : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>{m[id][ch] && <Icon name="check" size={16} strokeWidth={3} style={{ color: '#fff' }} />}</button>
  );
  return (
    <Screen bg={FE_BG}>
      <FeNav d={d} title="Settings" />
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px` }}>
        <h1 style={{ fontSize: d.big - 2, fontWeight: 800, color: FE_INK, letterSpacing: -0.5, margin: '2px 0 4px' }}>Notifications</h1>
        <p style={{ fontSize: d.small + 1, color: FE_SUB, margin: `0 0 ${d.stack}px`, lineHeight: 1.45 }}>Pick how you hear about each kind of alert.</p>
        <FeCard d={d} pad={0}>
          <div style={{ display: 'flex', alignItems: 'center', padding: `10px ${d.cardPad}px`, borderBottom: '0.5px solid rgba(15,23,42,0.07)' }}>
            <span style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              {[['Push', 'smartphone'], ['Email', 'mail']].map(([l, ic]) => (
                <div key={l} style={{ width: 34, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <Icon name={ic} size={14} style={{ color: FE_SUB }} />
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: FE_SUB, letterSpacing: 0.3 }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
          {NT_EVENTS.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: d.body, fontWeight: 600, color: FE_INK }}>{e.label}</div>
                <div style={{ fontSize: d.small, color: FE_SUB, marginTop: 1 }}>{e.sub}</div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}><Cell id={e.id} ch="push" /><Cell id={e.id} ch="email" /></div>
            </div>
          ))}
        </FeCard>
        <p style={{ fontSize: d.small, color: FE_FAINT, margin: `${d.gap + 2}px 4px 0`, lineHeight: 1.4 }}>Recalls are sent on every channel — for your safety.</p>
      </div>
    </Screen>
  );
}

// ════ C · CADENCE-FIRST ══════════════════════════════════════════════════════
const NT_CADENCE = [
  { k: 'realtime', label: 'As it happens', sub: 'Notify me the moment something needs attention', icon: 'zap' },
  { k: 'daily', label: 'Daily summary', sub: 'One gentle roundup each morning', icon: 'sunrise' },
  { k: 'weekly', label: 'Weekly only', sub: 'Just the Monday digest — keep it quiet', icon: 'calendar' },
];
function NotifOptionC({ d }) {
  const [cadence, setCadence] = useFeS('daily');
  const [recall, setRecall] = useFeS(true);
  const [warranty, setWarranty] = useFeS(true);
  return (
    <Screen bg={FE_BG}>
      <FeNav d={d} title="Settings" />
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px` }}>
        <h1 style={{ fontSize: d.big - 2, fontWeight: 800, color: FE_INK, letterSpacing: -0.5, margin: '2px 0 4px' }}>Notifications</h1>
        <p style={{ fontSize: d.small + 1, color: FE_SUB, margin: `0 0 ${d.stack}px`, lineHeight: 1.45 }}>How often should Homehub reach out?</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap, marginBottom: d.stack }}>
          {NT_CADENCE.map((c) => {
            const on = cadence === c.k;
            return (
              <button key={c.k} onClick={() => setCadence(c.k)} style={{ display: 'flex', alignItems: 'center', gap: 13, textAlign: 'left', background: on ? '#EAF3EF' : '#fff', border: `1.5px solid ${on ? FE_TEAL : 'rgba(15,23,42,0.10)'}`, borderRadius: d.radius - 4, padding: d.cardPad, cursor: 'pointer' }}>
                <div style={{ width: d.tap + 6, height: d.tap + 6, borderRadius: 11, background: on ? FE_TEAL : '#EEF2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={c.icon} size={19} style={{ color: on ? '#fff' : FE_TEAL }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: d.body, fontWeight: 700, color: FE_INK }}>{c.label}</div>
                  <div style={{ fontSize: d.small, color: FE_SUB, marginTop: 2, lineHeight: 1.4 }}>{c.sub}</div>
                </div>
                <span style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${on ? FE_TEAL : '#CBD5E1'}`, background: on ? FE_TEAL : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{on && <Icon name="check" size={13} strokeWidth={3} style={{ color: '#fff' }} />}</span>
              </button>
            );
          })}
        </div>
        <FeLabel>Always notify me right away about</FeLabel>
        <FeCard d={d} pad={0}>
          {[['Safety & recall notices', recall, () => setRecall((v) => !v), 'megaphone'], ['Warranty about to expire', warranty, () => setWarranty((v) => !v), 'shield-check']].map(([label, val, fn, ic], i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>
              <div style={{ width: d.tap, height: d.tap, borderRadius: 9, background: '#EEF2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={ic} size={16} style={{ color: FE_TEAL }} /></div>
              <span style={{ flex: 1, fontSize: d.body, fontWeight: 600, color: FE_INK }}>{label}</span>
              <NtToggle on={val} onChange={fn} />
            </div>
          ))}
        </FeCard>
        <p style={{ fontSize: d.small, color: FE_FAINT, margin: `${d.gap + 2}px 4px 0`, lineHeight: 1.4 }}>These override your rhythm so urgent things never wait.</p>
      </div>
    </Screen>
  );
}

Object.assign(window, { NotifOptionA, NotifOptionB, NotifOptionC });
