// ── Homehub · P2-8 — Unified "this week" agenda (3 options) ───────────────────
// One proactive view merging appliance tasks + home upkeep + cleaning. Options
// differ in structure:
//   A · By day        — a timeline grouped Today / Tomorrow / weekday
//   B · By source     — sectioned: Appliances / Home upkeep / Cleaning
//   C · Priority list — one ranked "do next" list, source as a chip

// Unified sample set (mixed sources) with day offsets.
const WK_ITEMS = [
  { id: 'w1', title: 'Replace the HVAC filter', sub: 'Furnace & A/C', src: 'item', day: 0, mins: 10, tier: 'recommended' },
  { id: 'w2', title: 'Wipe down the cooktop', sub: 'Kitchen', src: 'clean', day: 0, mins: 8, tier: 'optional' },
  { id: 'w3', title: 'Test smoke & CO alarms', sub: 'Whole home', src: 'upkeep', day: 1, mins: 10, tier: 'essential' },
  { id: 'w4', title: 'Run the dishwasher cleaning cycle', sub: 'Bosch Dishwasher', src: 'item', day: 2, mins: 5, tier: 'recommended' },
  { id: 'w5', title: 'Vacuum & mop the kitchen', sub: 'Kitchen', src: 'clean', day: 2, mins: 20, tier: 'optional' },
  { id: 'w6', title: 'Quarterly pest control', sub: 'Whole home', src: 'upkeep', day: 4, mins: 15, tier: 'recommended' },
  { id: 'w7', title: 'Descale the kettle', sub: 'Kitchen', src: 'item', day: 5, mins: 20, tier: 'optional' },
];
const WK_TIER = { essential: '#C2410C', recommended: '#1B6B5A', optional: '#5B748F' };
const WK_DAYNAMES = ['Today', 'Tomorrow'];
function wkDayLabel(day) {
  if (day < 2) return WK_DAYNAMES[day];
  const dt = feAddDays(new Date(), day);
  return dt.toLocaleDateString('en-US', { weekday: 'long' });
}

function WkHeader({ d, count, mins }) {
  return (
    <div style={{ padding: `0 ${d.pad}px`, marginBottom: d.stack }}>
      <h1 style={{ fontSize: d.big - 1, fontWeight: 800, color: FE_INK, letterSpacing: -0.6, margin: 0 }}>This week</h1>
      <div style={{ fontSize: d.small + 1, color: FE_SUB, marginTop: 5 }}>{count} things across your home · about {Math.round(mins / 5) * 5} min total</div>
    </div>
  );
}
function WkRow({ d, t, last, showDay }) {
  const [done, setDone] = useFeS(false);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: last ? 'none' : '0.5px solid rgba(15,23,42,0.07)', opacity: done ? 0.55 : 1 }}>
      <button onClick={() => setDone((v) => !v)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', flexShrink: 0, marginTop: 1, display: 'flex' }}><FeCheck on={done} size={23} /></button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: d.body, fontWeight: 600, color: FE_INK, letterSpacing: -0.2, lineHeight: 1.25, textDecoration: done ? 'line-through' : 'none', textWrap: 'pretty' }}>{t.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' }}>
          <FeSourceChip kind={t.src} d={d} />
          <span style={{ fontSize: d.small, color: FE_SUB }}>{t.sub} · {t.mins} min{showDay ? ` · ${wkDayLabel(t.day)}` : ''}</span>
        </div>
      </div>
    </div>
  );
}

// ════ A · BY DAY ═════════════════════════════════════════════════════════════
function AgendaOptionA({ d }) {
  const days = [...new Set(WK_ITEMS.map((t) => t.day))].sort((a, b) => a - b);
  return (
    <Screen bg={FE_BG}>
      <div style={{ height: SB_H }} />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        <div style={{ paddingTop: 8 }}><WkHeader d={d} count={WK_ITEMS.length} mins={WK_ITEMS.reduce((a, t) => a + t.mins, 0)} /></div>
        <div style={{ padding: `0 ${d.pad}px`, position: 'relative' }}>
          {days.map((day) => {
            const items = WK_ITEMS.filter((t) => t.day === day);
            return (
              <div key={day} style={{ marginBottom: d.stack }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '4px 2px 9px' }}>
                  <span style={{ fontSize: d.body, fontWeight: 800, color: day === 0 ? FE_TEAL : FE_INK, letterSpacing: -0.3 }}>{wkDayLabel(day)}</span>
                  <span style={{ fontSize: d.small, color: FE_FAINT, fontFamily: 'ui-monospace, monospace' }}>{feFmt(feAddDays(new Date(), day))}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: d.small, color: FE_FAINT }}>{items.length}</span>
                </div>
                <FeCard d={d} pad={0}>
                  {items.map((t, i) => <WkRow key={t.id} d={d} t={t} last={i === items.length - 1} />)}
                </FeCard>
              </div>
            );
          })}
        </div>
      </div>
    </Screen>
  );
}

// ════ B · BY SOURCE ══════════════════════════════════════════════════════════
function AgendaOptionB({ d }) {
  const order = ['item', 'upkeep', 'clean'];
  const titles = { item: 'Appliance upkeep', upkeep: 'Home upkeep', clean: 'Cleaning' };
  return (
    <Screen bg={FE_BG}>
      <div style={{ height: SB_H }} />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        <div style={{ paddingTop: 8 }}><WkHeader d={d} count={WK_ITEMS.length} mins={WK_ITEMS.reduce((a, t) => a + t.mins, 0)} /></div>
        <div style={{ padding: `0 ${d.pad}px` }}>
          {order.map((src) => {
            const items = WK_ITEMS.filter((t) => t.src === src).sort((a, b) => a.day - b.day);
            const s = FE_SOURCES[src];
            return (
              <div key={src} style={{ marginBottom: d.stack }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 2px 9px' }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={s.icon} size={15} style={{ color: s.fg }} /></div>
                  <span style={{ fontSize: d.body, fontWeight: 800, color: FE_INK, letterSpacing: -0.3 }}>{titles[src]}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: d.small, color: FE_FAINT }}>{items.length}</span>
                </div>
                <FeCard d={d} pad={0}>
                  {items.map((t, i) => <WkRow key={t.id} d={d} t={t} last={i === items.length - 1} showDay />)}
                </FeCard>
              </div>
            );
          })}
        </div>
      </div>
    </Screen>
  );
}

// ════ C · PRIORITY LIST ══════════════════════════════════════════════════════
function AgendaOptionC({ d }) {
  const tierRank = { essential: 0, recommended: 1, optional: 2 };
  const ranked = [...WK_ITEMS].sort((a, b) => (a.day - b.day) || (tierRank[a.tier] - tierRank[b.tier]));
  return (
    <Screen bg="#FFFFFF">
      <div style={{ height: SB_H }} />
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        <div style={{ paddingTop: 8 }}><WkHeader d={d} count={WK_ITEMS.length} mins={WK_ITEMS.reduce((a, t) => a + t.mins, 0)} /></div>
        <div style={{ padding: `0 ${d.pad}px` }}>
          <FeLabel>Do next</FeLabel>
          <FeCard d={d} pad={0}>
            {ranked.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, background: WK_TIER[t.tier] }} />
                <WkPriorityRow d={d} t={t} />
              </div>
            ))}
          </FeCard>
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#F1F5F4', borderRadius: 12, padding: '11px 13px', marginTop: d.stack }}>
            <Icon name="list-ordered" size={15} style={{ color: FE_TEAL, marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: d.small + 1, color: '#3A4A45', lineHeight: 1.45 }}>One ranked list — most important and soonest first, source shown as a chip. Least to think about.</span>
          </div>
        </div>
      </div>
    </Screen>
  );
}
function WkPriorityRow({ d, t }) {
  const [done, setDone] = useFeS(false);
  return (
    <React.Fragment>
      <button onClick={() => setDone((v) => !v)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', flexShrink: 0, marginTop: 1, display: 'flex' }}><FeCheck on={done} size={23} /></button>
      <div style={{ flex: 1, minWidth: 0, opacity: done ? 0.55 : 1 }}>
        <div style={{ fontSize: d.body, fontWeight: 600, color: FE_INK, letterSpacing: -0.2, lineHeight: 1.25, textDecoration: done ? 'line-through' : 'none', textWrap: 'pretty' }}>{t.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' }}>
          <FeSourceChip kind={t.src} d={d} />
          <span style={{ fontSize: d.small, color: t.day === 0 ? FE_TEAL : FE_SUB, fontWeight: t.day === 0 ? 700 : 400 }}>{wkDayLabel(t.day)} · {t.mins} min</span>
        </div>
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { AgendaOptionA, AgendaOptionB, AgendaOptionC });
