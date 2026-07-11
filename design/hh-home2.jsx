// ── Homehub · Refined Home + Task Detail ────────────────────────────────────
// The synthesis: a smaller hero card for the most imminent task (expandable in
// place OR tappable through to a detail screen) → an agenda timeline of what's
// upcoming (tap any to expand) → an Ask module (text field + action buttons).
// Teal identity, iOS-native. Props are driven by the canvas + tweaks.

const { useState: useHS } = React;

const HOME_INK = '#0B1220', HOME_SUB = '#6B7280', HOME_TEAL = '#1B6B5A', HOME_BG = '#F3F5F4';

// ── small pieces ───────────────────────────────────────────────────────────
function TierChip({ tier, d }) {
  const tc = TIER[tier];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: tc.soft, color: tc.dot, borderRadius: 99, padding: '4px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: tc.dot }} />{tc.label}
    </span>
  );
}

function WhyNote({ text, d }) {
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#F1F5F4', borderRadius: 12, padding: '11px 13px' }}>
      <Icon name="info" size={15} style={{ color: HOME_TEAL, marginTop: 1, flexShrink: 0 }} />
      <span style={{ fontSize: d.small + 1, color: '#3A4A45', lineHeight: 1.45, textWrap: 'pretty' }}>{text}</span>
    </div>
  );
}

function SuppliesRow({ supplies, d }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: HOME_SUB, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 7 }}>You’ll need</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {supplies.map((s) => (
          <span key={s.name} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, border: '1px solid rgba(15,23,42,0.12)', borderRadius: 10, padding: '7px 11px', fontSize: d.small + 1, color: HOME_INK, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {s.name}{s.spec && <span style={{ color: HOME_SUB, fontWeight: 500 }}>· {s.spec}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function StepsList({ steps, d, compact }) {
  const [done, setDone] = useHS([]);
  const toggle = (i) => setDone((x) => x.includes(i) ? x.filter((n) => n !== i) : [...x, i]);
  const list = compact ? steps.slice(0, 2) : steps;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: HOME_SUB, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 9 }}>Steps</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap - 1 }}>
        {list.map((s, i) => {
          const on = done.includes(i);
          return (
            <div key={i} onClick={() => toggle(i)} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', cursor: 'pointer' }}>
              <span style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, marginTop: 1, border: `2px solid ${on ? HOME_TEAL : '#CBD5E1'}`, background: on ? HOME_TEAL : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                {on ? <Icon name="check" size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span style={{ fontSize: d.body, color: on ? HOME_SUB : '#26302D', lineHeight: 1.4, textDecoration: on ? 'line-through' : 'none', textWrap: 'pretty' }}>{s}</span>
            </div>
          );
        })}
        {compact && steps.length > 2 && (
          <span style={{ fontSize: d.small + 1, color: HOME_TEAL, fontWeight: 600, paddingLeft: 33 }}>+ {steps.length - 2} more steps</span>
        )}
      </div>
    </div>
  );
}

function ManualSnippet({ manual, d }) {
  if (!manual) return null;
  return (
    <div style={{ borderLeft: `3px solid ${HOME_TEAL}`, background: '#EEF4F2', borderRadius: '0 12px 12px 0', padding: '11px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <Icon name="book-open" size={14} style={{ color: HOME_TEAL }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, color: HOME_TEAL, letterSpacing: 0.5, textTransform: 'uppercase' }}>From your manual</span>
      </div>
      <div style={{ fontSize: d.small + 1.5, color: '#2B3A36', lineHeight: 1.45, fontStyle: 'italic' }}>“{manual.quote}”</div>
      <div style={{ fontSize: d.small, color: HOME_SUB, marginTop: 5 }}>{manual.src}</div>
    </div>
  );
}

// ── Hero card — the most imminent task ───────────────────────────────────────
function TaskHero({ d, task, expanded, onToggle, onOpen, howto }) {
  const item = hhItem(task.item);
  const det = hhDetail(task.id);
  return (
    <div style={{ background: '#fff', borderRadius: d.radius, boxShadow: '0 6px 24px rgba(11,26,22,0.08)', overflow: 'hidden' }}>
      <div style={{ padding: d.cardPad + 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <TierChip tier={task.tier} d={d} />
          <span style={{ fontSize: d.small, fontWeight: 700, color: HOME_TEAL }}>{dueLabel(task.due)} · {task.mins} min</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
          <ItemGlyph icon={item.icon} size={d.tap + 22} bg="#EAF3EF" fg={HOME_TEAL} radius={15} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: d.h2 + 2, fontWeight: 800, color: HOME_INK, letterSpacing: -0.4, lineHeight: 1.12, textWrap: 'balance' }}>{task.name}</div>
            <div style={{ fontSize: d.small + 1, color: HOME_SUB, marginTop: 3 }}>{item.name} · {item.room}</div>
          </div>
        </div>

        {/* actions */}
        <div style={{ display: 'flex', gap: d.gap, marginTop: 16 }}>
          <button style={{ flex: 1, border: 'none', background: HOME_TEAL, color: '#fff', borderRadius: 13, padding: '13px 0', fontSize: d.body, fontWeight: 700, letterSpacing: -0.1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="check" size={17} strokeWidth={2.6} /> Mark done
          </button>
          <button onClick={onToggle} style={{ border: `1.5px solid ${expanded ? HOME_TEAL : 'rgba(15,23,42,0.14)'}`, background: expanded ? '#EAF3EF' : '#fff', color: expanded ? HOME_TEAL : HOME_INK, borderRadius: 13, padding: '13px 16px', fontSize: d.body, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
            {howto === 'detail' ? 'See how' : (expanded ? 'Hide' : 'See how')}
            <Icon name={howto === 'detail' ? 'arrow-right' : (expanded ? 'chevron-up' : 'chevron-down')} size={16} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* inline reveal */}
      {howto === 'inline' && expanded && (
        <div style={{ borderTop: '1px solid rgba(15,23,42,0.07)', padding: d.cardPad + 2, display: 'flex', flexDirection: 'column', gap: d.stack - 2, background: '#FCFDFC' }}>
          <WhyNote text={det.why} d={d} />
          <SuppliesRow supplies={det.supplies} d={d} />
          <StepsList steps={det.steps} d={d} />
          <ManualSnippet manual={det.manual} d={d} />
          <button onClick={() => onOpen(task.id)} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: HOME_TEAL, fontWeight: 700, fontSize: d.small + 1, display: 'inline-flex', alignItems: 'center', gap: 5, padding: 0 }}>
            Open full view <Icon name="arrow-right" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Agenda timeline (upcoming, expandable) ───────────────────────────────────
function AgendaTimeline({ d, tasks, expandedId, onToggle, onOpen }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: HOME_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 12, paddingLeft: 2 }}>Upcoming</div>
      <div style={{ position: 'relative', paddingLeft: 24 }}>
        <div style={{ position: 'absolute', left: 5, top: 6, bottom: 8, width: 2, background: 'rgba(15,23,42,0.08)' }} />
        {tasks.map((t) => {
          const item = hhItem(t.item);
          const det = hhDetail(t.id);
          const open = expandedId === t.id;
          return (
            <div key={t.id} style={{ position: 'relative', marginBottom: d.gap + 2 }}>
              <div style={{ position: 'absolute', left: -24, top: 16, width: 12, height: 12, borderRadius: 7, background: '#fff', border: `2px solid ${TIER[t.tier].dot}` }} />
              <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
                <div onClick={() => onToggle(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, cursor: 'pointer' }}>
                  <ItemGlyph icon={item.icon} size={d.tap + 4} bg="#F1F5F4" fg={HOME_TEAL} radius={10} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: d.body, fontWeight: 600, color: HOME_INK, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                    <div style={{ fontSize: d.small, color: HOME_SUB, marginTop: 2 }}>{dueLabel(t.due)} · {t.mins} min</div>
                  </div>
                  <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} style={{ color: '#94A3B8' }} />
                </div>
                {open && (
                  <div style={{ borderTop: '1px solid rgba(15,23,42,0.07)', padding: d.cardPad, display: 'flex', flexDirection: 'column', gap: d.gap + 2, background: '#FCFDFC' }}>
                    <WhyNote text={det.why} d={d} />
                    <StepsList steps={det.steps} d={d} compact />
                    <div style={{ display: 'flex', gap: d.gap }}>
                      <button style={{ flex: 1, border: 'none', background: HOME_TEAL, color: '#fff', borderRadius: 11, padding: '11px 0', fontSize: d.small + 1.5, fontWeight: 700 }}>Mark done</button>
                      <button onClick={() => onOpen(t.id)} style={{ border: '1.5px solid rgba(15,23,42,0.14)', background: '#fff', color: HOME_INK, borderRadius: 11, padding: '11px 15px', fontSize: d.small + 1.5, fontWeight: 700 }}>Full view</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Ask module ───────────────────────────────────────────────────────────────
// Pinned at the top of Home. Several treatments, dialled to sit quietly inside
// the page rather than shout. variant: 'plain' | 'soft' | 'inline' | 'mini' | 'dark'.
const ASK_BUTTONS = [
  { icon: 'wrench', label: 'Troubleshoot' },
  { icon: 'book-open', label: 'Ask a manual' },
];

function AskSend({ size }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: HOME_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon name="arrow-up" size={size * 0.58} strokeWidth={2.6} style={{ color: '#fff' }} />
    </div>
  );
}

function AskModule({ d, variant = 'plain', manualFirst = false }) {
  const [open, setOpen] = useHS(false);
  const ph = 'Ask about your home…';
  // 'Keeping manuals handy' → put the manual action first.
  const btns = manualFirst ? ASK_BUTTONS.slice().reverse() : ASK_BUTTONS;

  // ── DARK — the original, kept for reference ──
  if (variant === 'dark') {
    return (
      <div style={{ background: '#0E2E27', borderRadius: d.radius, padding: d.cardPad + 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
          <Icon name="sparkles" size={18} style={{ color: '#7FD3BE' }} />
          <span style={{ fontSize: d.body + 1, fontWeight: 700, color: '#fff', letterSpacing: -0.2 }}>Ask Homehub</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.10)', borderRadius: 13, padding: '12px 14px' }}>
          <span style={{ flex: 1, fontSize: d.body, color: 'rgba(255,255,255,0.55)' }}>{ph}</span>
          <AskSend size={d.tap + 2} />
        </div>
        <div style={{ display: 'flex', gap: d.gap, marginTop: d.gap + 2 }}>
          {btns.map((b) => (
            <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 13, padding: `${d.rowPy}px 4px` }}>
              <Icon name={b.icon} size={20} style={{ color: '#9FE7D2' }} />
              <span style={{ fontSize: d.small, fontWeight: 600, color: '#E6F2EE', textAlign: 'center', lineHeight: 1.15 }}>{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── INLINE — no card; field + pill row sit straight on the page ──
  if (variant === 'inline') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid rgba(15,23,42,0.12)', borderRadius: 14, padding: '10px 10px 10px 15px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
          <Icon name="sparkles" size={17} style={{ color: HOME_TEAL }} />
          <span style={{ flex: 1, fontSize: d.body, color: '#8A9994' }}>{ph}</span>
          <AskSend size={d.tap} />
        </div>
        <div style={{ display: 'flex', gap: d.gap }}>
          {btns.map((b) => (
            <button key={b.label} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'transparent', border: '1px solid rgba(15,23,42,0.14)', borderRadius: 99, padding: '9px 6px', color: HOME_INK }}>
              <Icon name={b.icon} size={15} style={{ color: HOME_TEAL }} />
              <span style={{ fontSize: d.small, fontWeight: 600 }}>{b.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── MINI — minimized to a chat field; expands to reveal the buttons ──
  if (variant === 'mini') {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.10)', borderRadius: d.radius - 2, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 9px 9px 15px' }}>
          <Icon name="sparkles" size={17} style={{ color: HOME_TEAL }} />
          <span style={{ flex: 1, fontSize: d.body, color: '#8A9994' }}>{ph}</span>
          <button onClick={() => setOpen((v) => !v)} title="Quick actions"
            style={{ width: d.tap, height: d.tap, borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)', background: open ? '#EAF3EF' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={open ? 'chevron-up' : 'layout-grid'} size={16} style={{ color: HOME_TEAL }} />
          </button>
          <AskSend size={d.tap} />
        </div>
        {open && (
          <div style={{ borderTop: '1px solid rgba(15,23,42,0.07)', padding: d.cardPad, display: 'flex', gap: d.gap, background: '#FBFCFC' }}>
            {btns.map((b) => (
              <button key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: '#F4F6F5', border: 'none', borderRadius: 12, padding: `${d.rowPy}px 4px` }}>
                <Icon name={b.icon} size={19} style={{ color: HOME_TEAL }} />
                <span style={{ fontSize: d.small, fontWeight: 600, color: HOME_INK, textAlign: 'center', lineHeight: 1.15 }}>{b.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── PLAIN (blended white) & SOFT (mint tint) ──
  const soft = variant === 'soft';
  const cardBg = soft ? '#E7F1EE' : '#fff';
  const fieldBg = soft ? '#fff' : '#F4F6F5';
  const chipBg = soft ? '#fff' : '#F4F6F5';
  return (
    <div style={{ background: cardBg, border: soft ? 'none' : '1px solid rgba(15,23,42,0.08)', borderRadius: d.radius - 2, padding: d.cardPad, boxShadow: soft ? 'none' : '0 1px 2px rgba(15,23,42,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: fieldBg, borderRadius: 12, padding: '10px 10px 10px 14px' }}>
        <Icon name="sparkles" size={17} style={{ color: HOME_TEAL }} />
        <span style={{ flex: 1, fontSize: d.body, color: '#8A9994' }}>{ph}</span>
        <AskSend size={d.tap} />
      </div>
      <div style={{ display: 'flex', gap: d.gap, marginTop: d.gap + 2 }}>
        {btns.map((b) => (
          <button key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: chipBg, border: 'none', borderRadius: 12, padding: `${d.rowPy}px 4px` }}>
            <Icon name={b.icon} size={19} style={{ color: HOME_TEAL }} />
            <span style={{ fontSize: d.small, fontWeight: 600, color: HOME_INK, textAlign: 'center', lineHeight: 1.15 }}>{b.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Informative notices (warranty, recalls) — calm, never alarming ───────────
const NOTICE_TONE = {
  recall:   { icon: 'megaphone',    fg: '#5B748F', bg: '#F1F5F8', br: '#DBE6EF', label: 'Safety notice' },
  warranty: { icon: 'shield-check', fg: '#9A7B3A', bg: '#FAF6EC', br: '#EFE6CE', label: 'Warranty' },
};

function NoticeCard({ d, n, onClick }) {
  const tn = NOTICE_TONE[n.kind];
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start', background: tn.bg, border: `1px solid ${tn.br}`, borderRadius: d.radius - 4, padding: d.cardPad, cursor: 'pointer' }}>
      <div style={{ width: d.tap + 4, height: d.tap + 4, borderRadius: 10, background: '#fff', border: `1px solid ${tn.br}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={tn.icon} size={18} style={{ color: tn.fg }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: tn.fg, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 }}>{tn.label}</div>
        <div style={{ fontSize: d.body, fontWeight: 700, color: HOME_INK, letterSpacing: -0.2 }}>{n.title}</div>
        <div style={{ fontSize: d.small + 0.5, color: '#5A6863', lineHeight: 1.4, marginTop: 3, textWrap: 'pretty' }}>{n.body}</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: d.small + 0.5, fontWeight: 700, color: tn.fg }}>{n.action} <Icon name="arrow-right" size={13} /></span>
      </div>
    </button>
  );
}

function NoticesList({ d, onOpenItem }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: HOME_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 12, paddingLeft: 2 }}>Good to know</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
        {HH_NOTICES.map((n) => <NoticeCard key={n.id} d={d} n={n} onClick={() => onOpenItem && onOpenItem(n.item)} />)}
      </div>
    </div>
  );
}

function NoticesGrouped({ d, onOpenItem }) {
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: d.radius - 2, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${d.rowPy}px ${d.cardPad}px` }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: HOME_SUB, letterSpacing: 0.6, textTransform: 'uppercase' }}>Good to know</span>
        <span style={{ fontSize: d.small, color: HOME_SUB, fontWeight: 600 }}>{HH_NOTICES.length}</span>
      </div>
      {HH_NOTICES.map((n, i) => {
        const tn = NOTICE_TONE[n.kind];
        return (
          <button key={n.id} onClick={() => onOpenItem && onOpenItem(n.item)} style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, alignItems: 'center', background: '#fff', border: 'none', borderTop: '1px solid rgba(15,23,42,0.06)', padding: `${d.rowPy}px ${d.cardPad}px`, cursor: 'pointer' }}>
            <div style={{ width: d.tap, height: d.tap, borderRadius: 9, background: tn.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={tn.icon} size={16} style={{ color: tn.fg }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: d.body, fontWeight: 600, color: HOME_INK, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
              <div style={{ fontSize: d.small, color: tn.fg, fontWeight: 600, marginTop: 1 }}>{tn.label}</div>
            </div>
            <Icon name="chevron-right" size={18} style={{ color: '#94A3B8' }} />
          </button>
        );
      })}
    </div>
  );
}

function NoticeStrip({ d, onOpenItem }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap - 2 }}>
      {HH_NOTICES.map((n) => {
        const tn = NOTICE_TONE[n.kind];
        return (
          <button key={n.id} onClick={() => onOpenItem && onOpenItem(n.item)} style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 11, alignItems: 'center', background: tn.bg, border: `1px solid ${tn.br}`, borderRadius: 12, padding: '10px 12px', cursor: 'pointer' }}>
            <Icon name={tn.icon} size={17} style={{ color: tn.fg, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: d.small + 1, color: '#3A4A45', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</span>
            <Icon name="chevron-right" size={16} style={{ color: tn.fg }} />
          </button>
        );
      })}
    </div>
  );
}

// ── The screen ───────────────────────────────────────────────────────────────
function RefinedHome({ d, askPlacement = 'above', howto = 'inline', initialExpanded = false, onOpenDetail, onOpenItem, onOpenClean, onOpenUpkeep, askVariant = 'plain', header = 'compact', notices = 'off', tabs = TABS_SIMPLE, currentTab = 'home', onTab, level = 'simple', concerns = [], offline = false }) {
  const sorted = [...HH_TASKS].sort((a, b) => a.due - b.due);
  const hero = sorted[0];
  const upcoming = sorted.slice(1);
  const [heroOpen, setHeroOpen] = useHS(initialExpanded);
  const [taskOpen, setTaskOpen] = useHS(null);
  const [screen, setScreen] = useHS('home');
  const [detailId, setDetailId] = useHS(hero.id);

  const open = (id) => {
    if (onOpenDetail) return onOpenDetail(id);
    setDetailId(id); setScreen('detail');
  };
  const onHeroToggle = () => { howto === 'detail' ? open(hero.id) : setHeroOpen((v) => !v); };

  if (screen === 'detail') {
    return <TaskDetailScreen d={d} taskId={detailId} onBack={() => setScreen('home')} />;
  }

  const picked = (concerns || []).filter((c) => c !== 'notsure');
  const ask = <AskModule d={d} variant={askVariant} manualFirst={picked.includes('manuals')} />;

  // When onboarding told us what matters, the matching sections lead — and
  // surface even at a level that would normally keep them tucked away.
  const noticeNode = notices === 'grouped' ? <NoticesGrouped d={d} onOpenItem={onOpenItem} /> : notices === 'list' ? <NoticesList d={d} onOpenItem={onOpenItem} /> : null;
  const SECONDARY = [
    { key: 'notices', concern: 'warranty', show: !!noticeNode, node: noticeNode },
    { key: 'maint', concern: 'upkeep', show: level !== 'simple' || picked.includes('upkeep'), node: <MaintenanceReminders d={d} onManage={onOpenUpkeep} /> },
    { key: 'clean', concern: 'clean', show: level === 'advanced' || picked.includes('clean'), node: <DeepCleanGuides d={d} onOpen={onOpenClean} /> },
  ];
  const secVisible = SECONDARY.filter((s) => s.show);
  const secRank = (s) => { const i = picked.indexOf(s.concern); return i === -1 ? 100 + SECONDARY.indexOf(s) : i; };
  const secOrdered = secVisible.slice().sort((a, b) => secRank(a) - secRank(b));
  const leadKey = picked.length && secOrdered.length && picked.includes(secOrdered[0].concern) ? secOrdered[0].key : null;

  return (
    <Screen bg={HOME_BG}>
      {header === 'today' ? (
        <div style={{ padding: `8px ${d.pad}px 0` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: HOME_TEAL, letterSpacing: 0.5, textTransform: 'uppercase' }}>{hhToday().split(',')[0]}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: d.big, fontWeight: 800, color: HOME_INK, letterSpacing: -0.8, margin: '2px 0 0' }}>Today</h1>
            <span style={{ fontSize: d.small, color: HOME_SUB, fontWeight: 500, whiteSpace: 'nowrap', paddingLeft: 10 }}>{upcoming.length} more this week</span>
          </div>
        </div>
      ) : header === 'greet' ? (
        <div style={{ padding: `8px ${d.pad}px 0` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: HOME_TEAL, letterSpacing: 0.5, textTransform: 'uppercase' }}>{hhToday()}</div>
          <h1 style={{ fontSize: d.big, fontWeight: 800, color: HOME_INK, letterSpacing: -0.8, margin: '2px 0 0' }}>{hhGreeting()}</h1>
        </div>
      ) : (
        <div style={{ padding: `12px ${d.pad}px 0`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: d.h2, fontWeight: 800, color: HOME_INK, letterSpacing: -0.4 }}>{hhGreeting()}, Barb</span>
          <span style={{ fontSize: d.small, color: HOME_SUB, fontWeight: 600 }}>{hhShortDate(0)}</span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 0`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        {offline && <OfflineBanner d={d} />}
        {askPlacement === 'above' && ask}
        {notices === 'top' && <NoticeStrip d={d} onOpenItem={onOpenItem} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: header === 'today' ? 0 : 10 }}>
          {header !== 'today' && (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingLeft: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: HOME_SUB, letterSpacing: 0.6, textTransform: 'uppercase' }}>Due today</span>
              <span style={{ fontSize: d.small, color: HOME_SUB, fontWeight: 500, whiteSpace: 'nowrap', paddingLeft: 10 }}>{upcoming.length} more this week</span>
            </div>
          )}
          <TaskHero d={d} task={hero} expanded={heroOpen} onToggle={onHeroToggle} onOpen={open} howto={howto} />
        </div>
        <AgendaTimeline d={d} tasks={upcoming} expandedId={taskOpen} onToggle={(id) => setTaskOpen((x) => x === id ? null : id)} onOpen={open} />
        {secOrdered.map((s) => (
          <React.Fragment key={s.key}>
            {s.key === leadKey && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '0 0 -4px', paddingLeft: 2 }}>
                <Icon name="sparkles" size={13} style={{ color: HOME_TEAL }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: HOME_TEAL, letterSpacing: 0.6, textTransform: 'uppercase' }}>Because it matters to you</span>
              </div>
            )}
            {s.node}
          </React.Fragment>
        ))}
        {askPlacement === 'below' && ask}
        <div style={{ height: 4 }} />
      </div>

      <TabBar tabs={tabs} current={currentTab} onSelect={onTab} accent={HOME_TEAL} solidBg="rgba(243,245,244,0.85)" />
    </Screen>
  );
}

// ── Tap-through detail screen ─────────────────────────────────────────────────
// The enriched "full view" (Version B): everything visible & scannable — adds
// recurrence, an openable manual, troubleshooting, gated assignment, and the
// user's own notes over the inline how-to. Implemented in task-fullview*.jsx.
function TaskDetailScreen({ d, taskId, onBack }) {
  return <FullViewB d={d} taskId={taskId} onBack={onBack} />;
}

Object.assign(window, { RefinedHome, TaskDetailScreen, TaskHero, AgendaTimeline, AskModule });
