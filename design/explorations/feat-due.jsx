// ── Homehub · P2-7 — Real due-date math (3 options) ──────────────────────────
// When a recurring task is completed it reschedules to a real next date, and
// seasonal items pin to actual months. The three options differ in philosophy:
//   A · Auto-roll      — invisible; complete and it quietly reschedules
//   B · Confirm next   — a quick review of the computed next date on complete
//   C · Transparent    — a visible cadence timeline the user can read & trust

const DUE_TASK = { title: 'Replace the HVAC filter', recur: 'rolling', every: 'Every 3 months', item: 'Furnace & A/C', room: 'Utility' };
const DUE_SEASONAL = { title: 'Service the furnace', recur: 'seasonal', season: 'fall', item: 'Furnace & A/C', room: 'Utility' };

// ════ A · AUTO-ROLL ══════════════════════════════════════════════════════════
function DueOptionA({ d }) {
  const [done, setDone] = useFeS(false);
  const next = feNext(DUE_TASK);
  return (
    <Screen bg="#FFFFFF">
      <FeNav d={d} />
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        <div>
          <h1 style={{ fontSize: d.big - 3, fontWeight: 800, color: FE_INK, letterSpacing: -0.5, margin: '2px 0 4px' }}>{DUE_TASK.title}</h1>
          <div style={{ fontSize: d.small + 1, color: FE_SUB }}>{DUE_TASK.item} · {DUE_TASK.room} · {DUE_TASK.every.toLowerCase()}</div>
        </div>

        {!done ? (
          <FeCard d={d} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="wind" size={20} style={{ color: FE_TEAL }} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: d.body, fontWeight: 700, color: FE_INK }}>Due today</div>
              <div style={{ fontSize: d.small, color: FE_SUB, marginTop: 1 }}>Last done {feFmt(feAddDays(new Date(), -91))}</div>
            </div>
          </FeCard>
        ) : (
          <FeCard d={d} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F1F6F4', boxShadow: 'none', border: '1px solid #D9E7E1' }}>
            <FeCheck on size={28} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: d.body, fontWeight: 700, color: FE_INK }}>Done — rescheduled</div>
              <div style={{ fontSize: d.small, color: FE_TEAL, marginTop: 1, fontWeight: 600 }}>Next due {feFmt(next)} · {feRelative(next)}</div>
            </div>
          </FeCard>
        )}

        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#F1F5F4', borderRadius: 12, padding: '11px 13px' }}>
          <Icon name="repeat" size={15} style={{ color: FE_TEAL, marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: d.small + 1, color: '#3A4A45', lineHeight: 1.45 }}>Just mark it done — Homehub rolls the next date forward automatically. Nothing else to set.</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.08)' }}>
        {!done
          ? <FeBtn d={d} icon="check" style={{ width: '100%' }} onClick={() => setDone(true)}>Mark done</FeBtn>
          : <FeBtn d={d} kind="ghost" icon="rotate-ccw" style={{ width: '100%' }} onClick={() => setDone(false)}>Undo</FeBtn>}
      </div>
    </Screen>
  );
}

// ════ B · CONFIRM NEXT DATE ══════════════════════════════════════════════════
function DueOptionB({ d }) {
  const [sheet, setSheet] = useFeS(false);
  const [whenDone, setWhenDone] = useFeS('today'); // today | earlier
  const [bump, setBump] = useFeS(0); // weeks adjustment
  const base = whenDone === 'today' ? new Date() : feAddDays(new Date(), -5);
  const next = feAddDays(feNext(DUE_TASK, base), bump * 7);
  return (
    <Screen bg="#FFFFFF">
      <FeNav d={d} />
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        <div>
          <h1 style={{ fontSize: d.big - 3, fontWeight: 800, color: FE_INK, letterSpacing: -0.5, margin: '2px 0 4px' }}>{DUE_TASK.title}</h1>
          <div style={{ fontSize: d.small + 1, color: FE_SUB }}>{DUE_TASK.item} · {DUE_TASK.room} · {DUE_TASK.every.toLowerCase()}</div>
        </div>
        <FeCard d={d} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="wind" size={20} style={{ color: FE_TEAL }} /></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: d.body, fontWeight: 700, color: FE_INK }}>Due today</div><div style={{ fontSize: d.small, color: FE_SUB, marginTop: 1 }}>Tap done to set the next date</div></div>
        </FeCard>
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#F1F5F4', borderRadius: 12, padding: '11px 13px' }}>
          <Icon name="calendar-check" size={15} style={{ color: FE_TEAL, marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: d.small + 1, color: '#3A4A45', lineHeight: 1.45 }}>On completion you confirm the next date — handy if you did it early or late, so the schedule stays accurate.</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.08)' }}>
        <FeBtn d={d} icon="check" style={{ width: '100%' }} onClick={() => setSheet(true)}>Mark done</FeBtn>
      </div>

      {sheet && (
        <React.Fragment>
          <div onClick={() => setSheet(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(8,12,11,0.4)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#fff', borderRadius: '20px 20px 0 0', padding: `18px ${d.pad}px calc(18px + env(safe-area-inset-bottom))`, boxShadow: '0 -8px 30px rgba(0,0,0,0.18)' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(15,23,42,0.15)', margin: '0 auto 16px' }} />
            <div style={{ fontSize: d.big - 5, fontWeight: 800, color: FE_INK, letterSpacing: -0.4, marginBottom: 4 }}>Nice work</div>
            <div style={{ fontSize: d.small + 1, color: FE_SUB, marginBottom: 16 }}>When did you do it?</div>
            <div style={{ display: 'flex', gap: 9, marginBottom: 18 }}>
              {[['today', 'Today'], ['earlier', 'A few days ago']].map(([k, l]) => (
                <button key={k} onClick={() => setWhenDone(k)} style={{ flex: 1, border: `1.5px solid ${whenDone === k ? FE_TEAL : 'rgba(15,23,42,0.14)'}`, background: whenDone === k ? '#EAF3EF' : '#fff', color: whenDone === k ? FE_TEALD : FE_INK, borderRadius: 12, padding: '12px 0', fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F4F6F5', borderRadius: 14, padding: '14px 16px', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: FE_SUB, letterSpacing: 0.4, textTransform: 'uppercase' }}>Next due</div>
                <div style={{ fontSize: d.body + 3, fontWeight: 800, color: FE_TEAL, letterSpacing: -0.4, marginTop: 2 }}>{feFmt(next)} · {feRelative(next)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setBump((b) => b - 1)} style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid rgba(15,23,42,0.14)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="minus" size={16} /></button>
                <button onClick={() => setBump((b) => b + 1)} style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid rgba(15,23,42,0.14)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={16} /></button>
              </div>
            </div>
            <FeBtn d={d} icon="check" style={{ width: '100%' }} onClick={() => setSheet(false)}>Confirm</FeBtn>
          </div>
        </React.Fragment>
      )}
    </Screen>
  );
}

// ════ C · TRANSPARENT TIMELINE ═══════════════════════════════════════════════
function DueOptionC({ d }) {
  const [step, setStep] = useFeS(0); // how many completions advanced
  const today = new Date();
  const lastDone = feAddDays(today, -91 + step * 91);
  const dueNow = feAddDays(lastDone, 91);
  const next1 = feAddDays(dueNow, 91);
  const next2 = feAddDays(next1, 91);
  const nodes = [
    { state: 'done', label: 'Last done', date: feFmt(lastDone) },
    { state: 'due', label: 'Due now', date: feFmt(dueNow) },
    { state: 'future', label: 'Next', date: feFmt(next1) },
    { state: 'future', label: 'Then', date: feFmt(next2) },
  ];
  return (
    <Screen bg="#FFFFFF">
      <FeNav d={d} />
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        <div>
          <h1 style={{ fontSize: d.big - 3, fontWeight: 800, color: FE_INK, letterSpacing: -0.5, margin: '2px 0 4px' }}>{DUE_TASK.title}</h1>
          <div style={{ fontSize: d.small + 1, color: FE_SUB }}>{DUE_TASK.item} · {DUE_TASK.room} · {DUE_TASK.every.toLowerCase()}</div>
        </div>

        <FeCard d={d} pad={d.cardPad + 2}>
          <FeLabel style={{ marginBottom: 14 }}>Schedule</FeLabel>
          <div style={{ position: 'relative', paddingLeft: 26 }}>
            <div style={{ position: 'absolute', left: 8, top: 6, bottom: 6, width: 2, background: 'rgba(15,23,42,0.10)' }} />
            {nodes.map((n, i) => {
              const c = n.state === 'done' ? FE_TEAL : n.state === 'due' ? FE_GOLD : FE_FAINT;
              return (
                <div key={i} style={{ position: 'relative', marginBottom: i === nodes.length - 1 ? 0 : 18 }}>
                  <span style={{ position: 'absolute', left: -26, top: 1, width: 18, height: 18, borderRadius: 9, background: n.state === 'future' ? '#fff' : c, border: `2px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n.state === 'done' && <Icon name="check" size={10} strokeWidth={3} style={{ color: '#fff' }} />}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: d.body, fontWeight: n.state === 'due' ? 800 : 600, color: n.state === 'future' ? FE_SUB : FE_INK }}>{n.label}</span>
                    <span style={{ fontSize: d.small + 1, fontWeight: 600, color: c }}>{n.date}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </FeCard>

        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#F1F5F4', borderRadius: 12, padding: '11px 13px' }}>
          <Icon name="eye" size={15} style={{ color: FE_TEAL, marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: d.small + 1, color: '#3A4A45', lineHeight: 1.45 }}>The full cadence is always visible — completing advances the timeline so you can trust what's coming.</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `12px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.08)' }}>
        <FeBtn d={d} icon="check" style={{ width: '100%' }} onClick={() => setStep((s) => s + 1)}>Mark done · advances to {feFmt(feAddDays(dueNow, 91))}</FeBtn>
      </div>
    </Screen>
  );
}

Object.assign(window, { DueOptionA, DueOptionB, DueOptionC });
