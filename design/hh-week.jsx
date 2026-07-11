// ── Homehub · Unified "This week" agenda ─────────────────────────────────────
// P2-8: merges appliance upkeep (HH_TASKS), home upkeep (HH_UPKEEP) and cleaning
// (CL_TASKS) into one proactive weekly view. Two arrangements:
//   · By day (default) — Today / Tomorrow / weekday timeline
//   · By source        — Appliances / Home / Cleaning sections
// Lives in the Tasks tab of the live app.

const { useState: useWkS } = React;
const WK_INK = '#0B1220', WK_SUB = '#6B7280', WK_FAINT = '#9AA6A2', WK_TEAL = '#1B6B5A', WK_BG = '#F3F5F4';
const WK_SRC = {
  item:   { label: 'Appliance', icon: 'package',  fg: '#1B6B5A', bg: '#EAF3EF', section: 'Appliance upkeep' },
  upkeep: { label: 'Home',      icon: 'house',     fg: '#8A5A12', bg: '#FBF3E2', section: 'Home upkeep' },
  clean:  { label: 'Clean',     icon: 'spray-can', fg: '#3A6EA5', bg: '#E8F1F7', section: 'Cleaning' },
};
const WK_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Build the unified, de-duplicated set for the next 7 days.
function wkBuild() {
  const out = [];
  (typeof HH_TASKS !== 'undefined' ? HH_TASKS : []).forEach((t) => {
    if (t.due >= 0 && t.due <= 6) { const it = hhItem(t.item); out.push({ id: 'i' + t.id, title: t.name, sub: it ? it.name : '', src: 'item', day: t.due, mins: t.mins, tier: t.tier }); }
  });
  (typeof HH_UPKEEP !== 'undefined' ? HH_UPKEEP : []).forEach((t) => {
    const day = Math.min(6, Math.round((t.due || 0) / 7)); // map upkeep due-days roughly into the week
    if ((t.due || 0) <= 7) out.push({ id: 'u' + t.id, title: t.title, sub: t.area || 'Whole home', src: 'upkeep', day, mins: 10, tier: t.cat === 'Safety' ? 'essential' : 'recommended', seasonal: t.recur === 'seasonal' });
  });
  (typeof CL_TASKS !== 'undefined' ? CL_TASKS : []).forEach((t) => {
    if (t.due >= 0 && t.due <= 6) out.push({ id: 'c' + t.id, title: t.name, sub: t.room, src: 'clean', day: t.due, mins: t.mins, tier: 'optional' });
  });
  return out;
}
function wkDayLabel(day) {
  if (day === 0) return 'Today';
  if (day === 1) return 'Tomorrow';
  const dt = new Date(); dt.setDate(dt.getDate() + day);
  return dt.toLocaleDateString('en-US', { weekday: 'long' });
}
function wkDate(day) { const dt = new Date(); dt.setDate(dt.getDate() + day); return `${WK_MONTHS[dt.getMonth()]} ${dt.getDate()}`; }

function WkSrcChip({ kind }) {
  const s = WK_SRC[kind] || WK_SRC.item;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: s.bg, color: s.fg, borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}><Icon name={s.icon} size={10} /> {s.label}</span>;
}
function WkRow({ d, t, last, showDay, onOpen }) {
  const [done, setDone] = useWkS(false);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: last ? 'none' : '0.5px solid rgba(15,23,42,0.07)', opacity: done ? 0.5 : 1 }}>
      <button onClick={() => setDone((v) => !v)} aria-label="Mark done" style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', flexShrink: 0, marginTop: 1, display: 'flex' }}>
        <span style={{ width: 24, height: 24, borderRadius: 12, border: `2px solid ${done ? WK_TEAL : 'rgba(15,23,42,0.22)'}`, background: done ? WK_TEAL : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{done && <Icon name="check" size={13} strokeWidth={3} style={{ color: '#fff' }} />}</span>
      </button>
      <button onClick={onOpen} style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: onOpen ? 'pointer' : 'default' }}>
        <div style={{ fontSize: d.body, fontWeight: 600, color: WK_INK, letterSpacing: -0.2, lineHeight: 1.25, textDecoration: done ? 'line-through' : 'none', textWrap: 'pretty' }}>
          {t.seasonal && <Icon name="leaf" size={12} style={{ color: '#8A5A12', marginRight: 4, verticalAlign: '-1px' }} />}{t.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' }}>
          <WkSrcChip kind={t.src} />
          <span style={{ fontSize: d.small, color: WK_SUB }}>{t.sub} · {t.mins} min{showDay ? ` · ${wkDayLabel(t.day)}` : ''}</span>
        </div>
      </button>
    </div>
  );
}

function WeekAgenda({ d, tabs = TABS_FULL, current = 'tasks', onTab, onOpenTask }) {
  const [view, setView] = useWkS('day'); // 'day' | 'source'
  const items = wkBuild();
  const total = items.length;
  const mins = items.reduce((a, t) => a + t.mins, 0);
  const tierRank = { essential: 0, recommended: 1, optional: 2 };

  return (
    <Screen bg={WK_BG}>
      <div style={{ height: SB_H }} />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: TAB_H + 12 }}>
        {/* header */}
        <div style={{ padding: `8px ${d.pad}px 0` }}>
          <h1 style={{ fontSize: d.big, fontWeight: 800, color: WK_INK, letterSpacing: -0.6, margin: 0 }}>This week</h1>
          <div style={{ fontSize: d.small + 1, color: WK_SUB, marginTop: 5 }}>{total} things across your home · about {Math.round(mins / 5) * 5} min total</div>
          {/* view toggle */}
          <div style={{ display: 'flex', background: '#E7EAE9', borderRadius: 11, padding: 3, gap: 2, marginTop: d.stack - 2 }}>
            {[['day', 'By day'], ['source', 'By type']].map(([k, l]) => {
              const on = view === k;
              return <button key={k} onClick={() => setView(k)} style={{ flex: 1, border: 'none', borderRadius: 9, padding: '9px 4px', background: on ? '#fff' : 'transparent', color: on ? WK_INK : WK_SUB, fontSize: d.small + 1, fontWeight: on ? 700 : 600, boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer' }}>{l}</button>;
            })}
          </div>
        </div>

        <div style={{ padding: `${d.stack}px ${d.pad}px 0` }}>
          {total === 0 && <div style={{ textAlign: 'center', color: WK_SUB, fontSize: d.body, padding: '40px 0' }}>Nothing due this week — enjoy the calm.</div>}

          {view === 'day' && [...new Set(items.map((t) => t.day))].sort((a, b) => a - b).map((day) => {
            const dayItems = items.filter((t) => t.day === day).sort((a, b) => tierRank[a.tier] - tierRank[b.tier]);
            return (
              <div key={day} style={{ marginBottom: d.stack }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '2px 2px 9px' }}>
                  <span style={{ fontSize: d.body, fontWeight: 800, color: day === 0 ? WK_TEAL : WK_INK, letterSpacing: -0.3 }}>{wkDayLabel(day)}</span>
                  <span style={{ fontSize: d.small, color: WK_FAINT, fontFamily: 'ui-monospace, monospace' }}>{wkDate(day)}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: d.small, color: WK_FAINT }}>{dayItems.length}</span>
                </div>
                <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
                  {dayItems.map((t, i) => <WkRow key={t.id} d={d} t={t} last={i === dayItems.length - 1} onOpen={t.src === 'item' ? () => onOpenTask && onOpenTask(t.id.slice(1)) : undefined} />)}
                </div>
              </div>
            );
          })}

          {view === 'source' && ['item', 'upkeep', 'clean'].map((src) => {
            const srcItems = items.filter((t) => t.src === src).sort((a, b) => a.day - b.day);
            if (!srcItems.length) return null;
            const s = WK_SRC[src];
            return (
              <div key={src} style={{ marginBottom: d.stack }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 2px 9px' }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={s.icon} size={15} style={{ color: s.fg }} /></div>
                  <span style={{ fontSize: d.body, fontWeight: 800, color: WK_INK, letterSpacing: -0.3 }}>{s.section}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: d.small, color: WK_FAINT }}>{srcItems.length}</span>
                </div>
                <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
                  {srcItems.map((t, i) => <WkRow key={t.id} d={d} t={t} last={i === srcItems.length - 1} showDay onOpen={t.src === 'item' ? () => onOpenTask && onOpenTask(t.id.slice(1)) : undefined} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <TabBar tabs={tabs} current={current} onSelect={onTab} accent={WK_TEAL} solidBg="rgba(243,245,244,0.85)" />
    </Screen>
  );
}

Object.assign(window, { WeekAgenda, wkBuild });
