// ── Homehub · Settings sub-screens ──────────────────────────────────────────
// My home · Members · Notifications. Reached from the Settings rows. iOS
// grouped style, teal system. Uses the shared Switch from hh-settings.jsx.

const { useState: useSsS } = React;

const SS_INK = '#0B1220', SS_SUB = '#6B7280', SS_TEAL = '#1B6B5A', SS_BG = '#EFF1F0';

const SS_ROOMS = [
  { name: 'Kitchen', count: 2 }, { name: 'Laundry', count: 1 }, { name: 'Utility', count: 2 },
  { name: 'Living room', count: 0 }, { name: 'Garage', count: 0 },
];
const SS_MEMBERS = [
  { name: 'Barb Powell', role: 'Owner', you: true, initial: 'B', tint: 'linear-gradient(135deg,#1B6B5A,#2D9B82)' },
  { name: 'Sam Powell', role: 'Member', initial: 'S', tint: 'linear-gradient(135deg,#5B748F,#8AA2B8)' },
];

function SetSubBar({ d, onBack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: `2px ${d.pad - 6}px 6px` }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: SS_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 4px', cursor: 'pointer' }}>
        <Icon name="chevron-left" size={22} strokeWidth={2.4} /> Settings
      </button>
    </div>
  );
}
function SsGroup({ d, title, children }) {
  return (
    <div style={{ marginBottom: d.stack }}>
      {title && <div style={{ fontSize: 12, fontWeight: 700, color: SS_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2 }}>{title}</div>}
      <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>{children}</div>
    </div>
  );
}
function SsRow({ d, label, sub, value, right, last, onClick, danger }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: last ? 'none' : '0.5px solid rgba(15,23,42,0.07)', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: d.body, fontWeight: 500, color: danger ? '#DC2626' : SS_INK }}>{label}</div>
        {sub && <div style={{ fontSize: d.small, color: SS_SUB, marginTop: 1 }}>{sub}</div>}
      </div>
      {value && <span style={{ fontSize: d.body - 0.5, color: SS_SUB }}>{value}</span>}
      {right || (onClick && !danger && <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4' }} />)}
    </div>
  );
}
function SsTitle({ d, children }) {
  return <h1 style={{ fontSize: d.big - 1, fontWeight: 800, color: SS_INK, letterSpacing: -0.6, margin: `2px 0 ${d.stack}px`, paddingLeft: 2 }}>{children}</h1>;
}

// ── My home ──────────────────────────────────────────────────────────────────
function MyHomeScreen({ d, onBack }) {
  return (
    <Screen bg={SS_BG} padBottom={20}>
      <SetSubBar d={d} onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: `2px ${d.pad}px 0` }}>
        <SsTitle d={d}>My home</SsTitle>
        <SsGroup d={d}>
          <SsRow d={d} label="Name" value="Maple Street" onClick={() => {}} />
          <SsRow d={d} label="Address" value="1842 Maple St" onClick={() => {}} />
          <SsRow d={d} label="Type" value="Apartment" onClick={() => {}} last />
        </SsGroup>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, paddingLeft: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: SS_SUB, letterSpacing: 0.6, textTransform: 'uppercase' }}>Rooms</span>
          <span style={{ fontSize: d.small, color: SS_SUB, fontWeight: 600 }}>{SS_ROOMS.length}</span>
        </div>
        <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden', marginBottom: d.stack }}>
          {SS_ROOMS.map((r, i) => (
            <SsRow key={r.name} d={d} label={r.name} value={`${r.count} item${r.count === 1 ? '' : 's'}`} onClick={() => {}} />
          ))}
          <div onClick={() => {}} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: '0.5px solid rgba(15,23,42,0.07)', color: SS_TEAL, cursor: 'pointer' }}>
            <Icon name="plus" size={18} /><span style={{ fontSize: d.body, fontWeight: 600 }}>Add a room</span>
          </div>
        </div>

        <SsGroup d={d}>
          <SsRow d={d} label="Leave this home" danger onClick={() => {}} last />
        </SsGroup>
        <div style={{ height: d.pad }} />
      </div>
    </Screen>
  );
}

// ── Members ──────────────────────────────────────────────────────────────────
function MembersScreen({ d, onBack }) {
  return (
    <Screen bg={SS_BG} padBottom={20}>
      <SetSubBar d={d} onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: `2px ${d.pad}px 0` }}>
        <SsTitle d={d}>Members</SsTitle>
        <p style={{ fontSize: d.small + 1, color: SS_SUB, margin: `-${d.gap}px 2px ${d.stack}px`, lineHeight: 1.4 }}>Everyone here sees the same home, tasks and manuals.</p>

        <SsGroup d={d}>
          {SS_MEMBERS.map((m, i) => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: i === SS_MEMBERS.length - 1 ? 'none' : '0.5px solid rgba(15,23,42,0.07)' }}>
              <div style={{ width: d.tap + 8, height: d.tap + 8, borderRadius: '50%', background: m.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: d.body, flexShrink: 0 }}>{m.initial}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: d.body, fontWeight: 600, color: SS_INK }}>{m.name}{m.you && <span style={{ color: SS_SUB, fontWeight: 500 }}> · You</span>}</div>
                <div style={{ fontSize: d.small, color: SS_SUB, marginTop: 1 }}>{m.role}</div>
              </div>
              {!m.you && <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4' }} />}
            </div>
          ))}
        </SsGroup>

        <div style={{ fontSize: 12, fontWeight: 700, color: SS_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2 }}>Pending</div>
        <SsGroup d={d}>
          <SsRow d={d} label="alex.kim@gmail.com" sub="Invite sent · 2 days ago" right={<span style={{ fontSize: d.small, color: SS_TEAL, fontWeight: 600 }}>Resend</span>} last />
        </SsGroup>

        <button style={{ width: '100%', border: 'none', background: SS_TEAL, color: '#fff', borderRadius: 14, padding: '14px 0', fontSize: d.body, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
          <Icon name="user-plus" size={18} /> Invite someone
        </button>
        <div style={{ height: d.pad }} />
      </div>
    </Screen>
  );
}

// ── Notifications ────────────────────────────────────────────────────────────
// Channel matrix (P2-9 B): each alert type × Push / Email. Recalls are locked on
// for safety; weekly digest intentionally omitted for now.
const NS_EVENTS = [
  { id: 'tasks', icon: 'list-checks', label: 'Task reminders', sub: 'When upkeep is due' },
  { id: 'warranty', icon: 'shield-check', label: 'Warranty expiring', sub: '30 days before coverage ends' },
  { id: 'recall', icon: 'megaphone', label: 'Safety & recalls', sub: 'For items you own', locked: true },
];
function NotificationsScreen({ d, onBack }) {
  const [m, setM] = useSsS({
    tasks: { push: true, email: false },
    warranty: { push: true, email: true },
    recall: { push: true, email: true },
  });
  const [quiet, setQuiet] = useSsS(true);
  const flip = (id, ch) => { if (id === 'recall') return; setM((s) => ({ ...s, [id]: { ...s[id], [ch]: !s[id][ch] } })); };
  const Cell = ({ id, ch }) => {
    const on = m[id][ch], locked = NS_EVENTS.find((e) => e.id === id).locked;
    return (
      <button onClick={() => flip(id, ch)} aria-label={`${id} ${ch}`} style={{ width: 40, height: 40, borderRadius: 11, border: `1.5px solid ${on ? SS_TEAL : 'rgba(15,23,42,0.16)'}`, background: on ? SS_TEAL : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: locked ? 'default' : 'pointer', flexShrink: 0, opacity: locked ? 0.75 : 1 }}>
        {on && <Icon name={locked ? 'lock' : 'check'} size={locked ? 14 : 17} strokeWidth={locked ? 2.4 : 3} style={{ color: '#fff' }} />}
      </button>
    );
  };
  return (
    <Screen bg={SS_BG} padBottom={20}>
      <SetSubBar d={d} onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: `2px ${d.pad}px 0` }}>
        <SsTitle d={d}>Notifications</SsTitle>
        <p style={{ fontSize: d.small + 1, color: SS_SUB, margin: `-4px 2px ${d.stack}px`, lineHeight: 1.45 }}>Choose how you hear about each kind of alert.</p>

        <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', padding: `11px ${d.cardPad}px`, borderBottom: '0.5px solid rgba(15,23,42,0.07)' }}>
            <span style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 12 }}>
              {[['Push', 'smartphone'], ['Email', 'mail']].map(([l, ic]) => (
                <div key={l} style={{ width: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <Icon name={ic} size={15} style={{ color: SS_SUB }} />
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: SS_SUB, letterSpacing: 0.3 }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
          {NS_EVENTS.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>
              <div style={{ width: d.tap, height: d.tap, borderRadius: 9, background: '#EEF2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={e.icon} size={17} style={{ color: SS_TEAL }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: d.body, fontWeight: 600, color: SS_INK }}>{e.label}</div>
                <div style={{ fontSize: d.small, color: SS_SUB, marginTop: 1 }}>{e.sub}</div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}><Cell id={e.id} ch="push" /><Cell id={e.id} ch="email" /></div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: d.small, color: '#9AA6A2', margin: `${d.gap + 2}px 4px ${d.stack}px`, lineHeight: 1.4 }}>Safety &amp; recall notices are always delivered on every channel.</p>

        <SsGroup d={d} title="Timing">
          <SsRow d={d} label="Quiet hours" sub="Mute 9pm – 8am" right={<Switch on={quiet} onToggle={() => setQuiet((v) => !v)} />} />
          <SsRow d={d} label="Reminder lead time" value="3 days before" onClick={() => {}} last />
        </SsGroup>
        <div style={{ height: d.pad }} />
      </div>
    </Screen>
  );
}

// ── Profile / account ────────────────────────────────────────────────────────
function ProfileScreen({ d, onBack }) {
  return (
    <Screen bg={SS_BG} padBottom={20}>
      <SetSubBar d={d} onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: `2px ${d.pad}px 0` }}>
        <SsTitle d={d}>Account</SsTitle>

        {/* avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 11, marginBottom: d.stack }}>
          <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'linear-gradient(135deg,#1B6B5A,#2D9B82)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 36, fontWeight: 700 }}>B</div>
          <button style={{ border: 'none', background: 'transparent', color: SS_TEAL, fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}>Change photo</button>
        </div>

        <SsGroup d={d} title="Profile">
          <SsRow d={d} label="Name" value="Barb Powell" onClick={() => {}} />
          <SsRow d={d} label="Email" value="barb.powell@gmail.com" onClick={() => {}} />
          <SsRow d={d} label="Phone" value="Add a number" onClick={() => {}} last />
        </SsGroup>

        <SsGroup d={d} title="Security">
          <SsRow d={d} label="Password" value="Change" onClick={() => {}} />
          <SsRow d={d} label="Two-factor auth" value="Off" onClick={() => {}} last />
        </SsGroup>

        <SsGroup d={d} title="Plan">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px` }}>
            <div style={{ width: d.tap, height: d.tap, borderRadius: 9, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="house" size={17} style={{ color: SS_TEAL }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: d.body, fontWeight: 600, color: SS_INK }}>Homehub Free</div>
              <div style={{ fontSize: d.small, color: SS_SUB, marginTop: 1 }}>1 home · up to 25 items</div>
            </div>
            <span style={{ fontSize: d.small, color: SS_TEAL, fontWeight: 700 }}>Upgrade</span>
          </div>
        </SsGroup>

        <SsGroup d={d}>
          <SsRow d={d} label="Sign out" onClick={() => {}} />
          <SsRow d={d} label="Delete account" danger onClick={() => {}} last />
        </SsGroup>
        <div style={{ height: d.pad }} />
      </div>
    </Screen>
  );
}

Object.assign(window, { MyHomeScreen, MembersScreen, NotificationsScreen, ProfileScreen });
