// ── Homehub · Help & support + AI feedback ──────────────────────────────────
// Help hub (browse topics, what's new, version) plus a conversational feedback
// assistant: it classifies the report (bug / idea / question), checks the
// backend queue for an existing entry (shows status + lets you follow), or asks
// a follow-up for a new one, auto-attaches diagnostics, and thanks you warmly.

const { useState: useHpS } = React;

const HP_INK = '#0B1220', HP_SUB = '#6B7280', HP_TEAL = '#1B6B5A', HP_BG = '#F3F5F4';

const HP_TOPICS = [
  { icon: 'rocket', label: 'Getting started' },
  { icon: 'package', label: 'Your items' },
  { icon: 'list-checks', label: 'Tasks & reminders' },
  { icon: 'sparkles', label: 'Using Ask' },
  { icon: 'shield-check', label: 'Warranties' },
  { icon: 'user', label: 'Account & home' },
];

function HelpScreen({ d, onBack, onFeedback }) {
  return (
    <Screen bg={HP_BG} padBottom={20}>
      <SetSubBar d={d} onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: `2px ${d.pad}px 0` }}>
        <h1 style={{ fontSize: d.big - 1, fontWeight: 800, color: HP_INK, letterSpacing: -0.6, margin: `2px 0 ${d.stack}px`, paddingLeft: 2 }}>Help &amp; support</h1>

        {/* search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: '11px 13px', marginBottom: d.stack }}>
          <Icon name="search" size={16} style={{ color: '#9AA6A2' }} /><span style={{ fontSize: d.body, color: '#9AA6A2' }}>Search help…</span>
        </div>

        {/* feedback hero — the AI flow */}
        <button onClick={onFeedback} style={{ width: '100%', textAlign: 'left', border: 'none', background: '#0E2E27', borderRadius: d.radius, padding: d.cardPad + 2, marginBottom: d.stack, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: d.tap + 12, height: d.tap + 12, borderRadius: 12, background: 'rgba(159,231,210,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="message-square-heart" size={20} style={{ color: '#9FE7D2' }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: d.body + 1, fontWeight: 700, color: '#fff', letterSpacing: -0.2 }}>Share feedback</div>
              <div style={{ fontSize: d.small + 0.5, color: 'rgba(255,255,255,0.65)', marginTop: 2, lineHeight: 1.35 }}>Found a bug or have an idea? Tell our assistant — it’ll take it from there.</div>
            </div>
            <Icon name="chevron-right" size={18} style={{ color: 'rgba(255,255,255,0.5)' }} />
          </div>
        </button>

        {/* topics */}
        <div style={{ fontSize: 12, fontWeight: 700, color: HP_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>Browse topics</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: d.gap, marginBottom: d.stack }}>
          {HP_TOPICS.map((t) => (
            <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: '1px solid rgba(15,23,42,0.07)', borderRadius: d.radius - 4, padding: `${d.rowPy}px ${d.cardPad - 2}px`, cursor: 'pointer' }}>
              <Icon name={t.icon} size={18} style={{ color: HP_TEAL, flexShrink: 0 }} />
              <span style={{ fontSize: d.small + 1, fontWeight: 600, color: HP_INK, lineHeight: 1.2 }}>{t.label}</span>
            </div>
          ))}
        </div>

        {/* more */}
        <div style={{ fontSize: 12, fontWeight: 700, color: HP_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2 }}>More</div>
        <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
          {[
            { icon: 'gift', label: 'What’s new', value: 'v2.4' },
            { icon: 'mail', label: 'Email support', value: '' },
            { icon: 'info', label: 'App version', value: '2.4.0 (1180)' },
            { icon: 'activity', label: 'Diagnostics', value: '' },
          ].map((r, i, a) => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: i === a.length - 1 ? 'none' : '0.5px solid rgba(15,23,42,0.07)', cursor: 'pointer' }}>
              <div style={{ width: d.tap, height: d.tap, borderRadius: 8, background: '#EEF2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={r.icon} size={16} style={{ color: HP_TEAL }} /></div>
              <span style={{ flex: 1, fontSize: d.body, color: HP_INK, fontWeight: 500 }}>{r.label}</span>
              {r.value && <span style={{ fontSize: d.small + 0.5, color: HP_SUB }}>{r.value}</span>}
              <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4' }} />
            </div>
          ))}
        </div>
        <div style={{ height: d.pad }} />
      </div>
    </Screen>
  );
}

// ── Feedback assistant ───────────────────────────────────────────────────────
const HP_TYPES = [
  { id: 'bug', icon: 'bug', label: 'Report a bug' },
  { id: 'idea', icon: 'lightbulb', label: 'Suggest an idea' },
  { id: 'question', icon: 'circle-help', label: 'Ask a question' },
];

function Bubble({ d, who, children, tone }) {
  const me = who === 'me';
  return (
    <div style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '84%', background: me ? HP_TEAL : '#fff', color: me ? '#fff' : '#26302D', border: me ? 'none' : '1px solid rgba(15,23,42,0.07)', borderRadius: me ? '16px 16px 4px 16px' : '4px 16px 16px 16px', padding: '11px 14px', fontSize: d.body, lineHeight: 1.45 }}>
      {children}
    </div>
  );
}
function AsstRow({ d, children }) {
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', alignSelf: 'stretch' }}>
      <div style={{ width: d.tap, height: d.tap, borderRadius: '50%', background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}><Icon name="sparkles" size={16} style={{ color: HP_TEAL }} /></div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9, alignItems: 'flex-start' }}>{children}</div>
    </div>
  );
}

// scenario: 'dedupe' (idea already tracked) | 'new' (bug → follow-up). step 0..2
function FeedbackChat({ d, onBack, scenario = 'dedupe', startStep = 0 }) {
  const [step, setStep] = useHpS(startStep);
  const [type, setType] = useHpS(scenario === 'new' ? 'bug' : 'idea');

  const TrackedCard = () => (
    <div style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: 14, padding: d.cardPad, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#EAF1F8', color: '#3F6CA8', borderRadius: 99, padding: '3px 9px', fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}><span style={{ width: 6, height: 6, borderRadius: 3, background: '#3F6CA8' }} /> Planned</span>
        <span style={{ fontSize: d.small, color: HP_SUB }}>#412</span>
      </div>
      <div style={{ fontSize: d.body, fontWeight: 700, color: HP_INK, letterSpacing: -0.2 }}>Choose reminder lead time</div>
      <div style={{ fontSize: d.small + 0.5, color: HP_SUB, marginTop: 3, lineHeight: 1.4 }}>Pick how many days before a task is due you’re reminded.</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, fontSize: d.small, color: HP_SUB }}>
        <Icon name="users" size={13} /> 142 people want this · in the next update
      </div>
    </div>
  );

  // Build the visible thread per step.
  const thread = [];
  thread.push(<AsstRow key="intro" d={d}><Bubble d={d} who="ai">Hi Barb — what’s on your mind? A bug, an idea, or a question. Describe it however you like.</Bubble></AsstRow>);

  if (step >= 1) {
    const userMsg = scenario === 'new'
      ? 'The calendar in Tasks jumps to the wrong month after I scroll.'
      : 'Reminders only show the day something’s due — I’d like a few days’ warning.';
    thread.push(<Bubble key="u1" d={d} who="me">{userMsg}</Bubble>);
    if (scenario === 'new') {
      thread.push(
        <AsstRow key="a1" d={d}>
          <Bubble d={d} who="ai">Sounds like a <strong>bug</strong> in the Tasks calendar. One quick thing so I can flag it precisely:</Bubble>
          <div style={{ fontSize: d.small + 0.5, fontWeight: 700, color: HP_INK, paddingLeft: 2 }}>Does it happen every time?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['Every time', 'Only sometimes'].map((c) => (
              <button key={c} onClick={() => setStep(2)} style={{ border: `1px solid rgba(27,107,90,0.3)`, background: '#fff', color: HP_TEAL, borderRadius: 99, padding: '8px 14px', fontSize: d.small + 0.5, fontWeight: 600, cursor: 'pointer' }}>{c}</button>
            ))}
          </div>
        </AsstRow>
      );
    } else {
      thread.push(
        <AsstRow key="a1" d={d}>
          <Bubble d={d} who="ai">That’s a feature <strong>idea</strong> about reminder timing. Let me check what’s already tracked…</Bubble>
          <Bubble d={d} who="ai">Good news — this is already on the roadmap:</Bubble>
          <TrackedCard />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setStep(2)} style={{ border: 'none', background: HP_TEAL, color: '#fff', borderRadius: 99, padding: '9px 16px', fontSize: d.small + 0.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><Icon name="bell" size={14} /> Follow & add my note</button>
            <button onClick={() => setStep(2)} style={{ border: `1px solid rgba(15,23,42,0.14)`, background: '#fff', color: HP_INK, borderRadius: 99, padding: '9px 14px', fontSize: d.small + 0.5, fontWeight: 600, cursor: 'pointer' }}>Mine’s different</button>
          </div>
        </AsstRow>
      );
    }
  }

  if (step >= 2) {
    thread.push(
      <AsstRow key="thanks" d={d}>
        <Bubble d={d} who="ai">Thanks, Barb — that’s genuinely helpful. {scenario === 'new' ? 'I’ve logged the bug for the team' : 'You’re following it and your note is attached'}. I’ll nudge you if there’s an update.</Bubble>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F1F5F4', borderRadius: 8, padding: '6px 10px', fontSize: d.small, color: HP_SUB }}>
          <Icon name="paperclip" size={13} /> Diagnostics attached · v2.4.0 · iPhone 15
        </div>
      </AsstRow>
    );
  }

  return (
    <Screen bg={HP_BG} padBottom={step >= 2 ? 86 : 116}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `4px ${d.pad - 6}px 8px`, borderBottom: '0.5px solid rgba(15,23,42,0.06)' }}>
        <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: HP_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 4px', cursor: 'pointer' }}><Icon name="chevron-left" size={22} strokeWidth={2.4} /> Help</button>
        <span style={{ fontSize: d.body, fontWeight: 700, color: HP_INK }}>Share feedback</span>
        <div style={{ width: 56 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 0`, display: 'flex', flexDirection: 'column', gap: d.gap + 3 }}>
        {thread}
        <div style={{ height: 4 }} />
      </div>

      {/* composer (only while composing) */}
      {step < 2 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `10px ${d.pad}px calc(12px + env(safe-area-inset-bottom))`, background: 'rgba(243,245,244,0.95)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
          {step === 0 && (
            <div style={{ display: 'flex', gap: 7, marginBottom: 10, overflowX: 'auto' }}>
              {HP_TYPES.map((tp) => {
                const on = type === tp.id;
                return <button key={tp.id} onClick={() => setType(tp.id)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${on ? HP_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? '#E8F2EF' : '#fff', color: on ? HP_TEAL : HP_INK, borderRadius: 99, padding: '7px 12px', fontSize: d.small + 0.5, fontWeight: 600, cursor: 'pointer' }}><Icon name={tp.icon} size={14} /> {tp.label}</button>;
              })}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid rgba(15,23,42,0.12)', borderRadius: 14, padding: '9px 9px 9px 13px' }}>
            <Icon name="image-plus" size={19} style={{ color: '#9AA6A2', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: d.body, color: '#9AA6A2' }}>{step === 0 ? 'Describe it…' : 'Add more…'}</span>
            <button onClick={() => setStep(step === 0 ? 1 : 2)} style={{ width: d.tap, height: d.tap, borderRadius: '50%', border: 'none', background: HP_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="arrow-up" size={16} strokeWidth={2.6} style={{ color: '#fff' }} /></button>
          </div>
        </div>
      )}

      {/* done button (after thanks) */}
      {step >= 2 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(243,245,244,0.95)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
          <button onClick={onBack} style={{ width: '100%', border: 'none', background: HP_TEAL, color: '#fff', borderRadius: 14, padding: '15px 0', fontSize: d.body + 1, fontWeight: 700, cursor: 'pointer' }}>Done</button>
        </div>
      )}
    </Screen>
  );
}

Object.assign(window, { HelpScreen, FeedbackChat });
