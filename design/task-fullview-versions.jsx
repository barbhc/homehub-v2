// ── Homehub · Task full-view — the three directions ─────────────────────────
const { useState: useFvvS } = React;

function fvManualObj(taskId) {
  const { det, ex } = fvTask(taskId);
  return (ex.manuals && ex.manuals[0]) || { name: (det.manual && det.manual.src) || 'Manual', pages: 14, label: 'Owner’s manual' };
}

// ════════════════════════════════════════════════════════════════════════════
// A · DO-IT MODE — action-first: progress + big checkable steps
// ════════════════════════════════════════════════════════════════════════════
function FullViewA({ d, taskId = 's1' }) {
  const { task, item, det, ex } = fvTask(taskId);
  const [done, setDone] = useFvvS([]);
  const [more, setMore] = useFvvS(false);
  const [viewer, setViewer] = useFvvS(false);
  const toggle = (i) => setDone((x) => x.includes(i) ? x.filter((n) => n !== i) : [...x, i]);
  const pct = det.steps.length ? Math.round(done.length / det.steps.length * 100) : 0;
  const note = FV_NOTES[taskId];

  return (
    <Screen bg="#FFFFFF" padBottom={140}>
      <FvNav d={d} />
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        <FvHeader d={d} task={task} item={item} />

        {/* progress */}
        <div style={{ background: '#0E2E27', borderRadius: d.radius, padding: `${d.cardPad}px ${d.cardPad + 2}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: d.body, fontWeight: 800, color: '#fff', letterSpacing: -0.2 }}>{done.length} of {det.steps.length} steps</span>
            <span style={{ fontSize: d.small + 1, fontWeight: 700, color: pct === 100 ? '#7FD3BE' : 'rgba(255,255,255,0.7)' }}>{pct === 100 ? 'Ready to finish' : `${pct}%`}</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.16)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#3FB492', borderRadius: 4, transition: 'width .25s ease' }} />
          </div>
        </div>

        <FvSteps d={d} steps={det.steps} checkable done={done} toggle={toggle} />
        <FvSupplies d={d} supplies={det.supplies} />
        <FvManualCard d={d} manual={det.manual} compact onOpen={() => setViewer(true)} />

        {ex.trouble && ex.trouble.length > 0 && (
          <div>
            <FvLabel>If it goes wrong</FvLabel>
            <FvTrouble d={d} items={ex.trouble} onOpenManual={() => setViewer(true)} />
          </div>
        )}

        <div>
          <FvLabel>Notes</FvLabel>
          <FvNote d={d} note={note} />
        </div>
        <div style={{ height: 8 }} />
      </div>
      <FvSticky d={d} more={more} onMore={() => setMore((v) => !v)} />
      {viewer && <ManualViewer d={d} manual={fvManualObj(taskId)} item={item} onClose={() => setViewer(false)} />}
    </Screen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// B · REFERENCE — info-first: everything visible, scannable
// ════════════════════════════════════════════════════════════════════════════
function FullViewB({ d, taskId = 's1', onBack }) {
  const { task, item, det, ex } = fvTask(taskId);
  const [more, setMore] = useFvvS(false);
  const [viewer, setViewer] = useFvvS(false);
  const [doneSheet, setDoneSheet] = useFvvS(false);
  const [completed, setCompleted] = useFvvS(false);
  const note = FV_NOTES[taskId];

  return (
    <Screen bg="#F3F5F4" padBottom={150}>
      <FvNav d={d} onBack={onBack} />
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        <div style={{ background: '#fff', borderRadius: d.radius, padding: d.cardPad + 2, boxShadow: '0 1px 2px rgba(15,23,42,0.05)' }}>
          <FvHeader d={d} task={task} item={item} big />
        </div>

        <FvRecur d={d} taskId={taskId} />
        <FvWhy d={d} text={det.why} />

        <div style={{ background: '#fff', borderRadius: d.radius - 2, padding: d.cardPad, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', display: 'flex', flexDirection: 'column', gap: d.stack - 2 }}>
          <FvSupplies d={d} supplies={det.supplies} />
          <div style={{ height: 1, background: 'rgba(15,23,42,0.06)' }} />
          <FvSteps d={d} steps={det.steps} />
        </div>

        <FvManualCard d={d} manual={det.manual} onOpen={() => setViewer(true)} />

        {ex.trouble && ex.trouble.length > 0 && (
          <div>
            <FvLabel>If it goes wrong</FvLabel>
            <FvTrouble d={d} items={ex.trouble} onOpenManual={() => setViewer(true)} startOpen />
          </div>
        )}

        {FV_MEMBERS.length > 1 && (
          <div>
            <FvLabel>Assignment</FvLabel>
            <FvAssign d={d} big />
          </div>
        )}

        <div>
          <FvLabel>Notes</FvLabel>
          <FvNote d={d} note={note} />
        </div>
        <div style={{ height: 8 }} />
      </div>
      <FvSticky d={d} more={more} onMore={() => setMore((v) => !v)} onComplete={() => setDoneSheet(true)} />
      {viewer && <ManualViewer d={d} manual={fvManualObj(taskId)} item={item} onClose={() => setViewer(false)} />}
      {doneSheet && <FvConfirmDone d={d} task={task} onClose={() => setDoneSheet(false)} onConfirm={() => { setDoneSheet(false); setCompleted(true); }} />}
      {completed && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 45, padding: `12px ${d.pad}px calc(12px + env(safe-area-inset-bottom))`, background: '#EAF3EF', borderTop: '0.5px solid rgba(27,107,90,0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="check-circle" size={20} style={{ color: FV_TEAL, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: d.small + 1, fontWeight: 700, color: FV_TEALD }}>Done · next due {fvFmt(fvNextDate(task))}</span>
          <button onClick={() => setCompleted(false)} style={{ border: 'none', background: 'transparent', color: FV_TEAL, fontWeight: 700, fontSize: d.small + 0.5, cursor: 'pointer' }}>Undo</button>
        </div>
      )}
    </Screen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// C · SECTIONED TABS — tidy: Steps / Fix it / Details
// ════════════════════════════════════════════════════════════════════════════
function FullViewC({ d, taskId = 's1' }) {
  const { task, item, det, ex } = fvTask(taskId);
  const [tab, setTab] = useFvvS('steps');
  const [more, setMore] = useFvvS(false);
  const [viewer, setViewer] = useFvvS(false);
  const note = FV_NOTES[taskId];
  const tabs = [
    { k: 'steps', label: 'Steps' },
    { k: 'fix', label: 'Fix it', n: (ex.trouble || []).length },
    { k: 'details', label: 'Details' },
  ];

  return (
    <Screen bg="#FFFFFF" padBottom={140}>
      <FvNav d={d} />
      <div style={{ padding: `0 ${d.pad}px` }}>
        <FvHeader d={d} task={task} item={item} />
      </div>

      {/* segmented control */}
      <div style={{ padding: `${d.stack}px ${d.pad}px 0` }}>
        <div style={{ display: 'flex', background: '#EEF1F0', borderRadius: 12, padding: 3, gap: 2 }}>
          {tabs.map((t) => {
            const on = tab === t.k;
            return (
              <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, border: 'none', borderRadius: 9, padding: '9px 4px', background: on ? '#fff' : 'transparent', color: on ? FV_INK : FV_SUB, fontSize: d.small + 1, fontWeight: on ? 700 : 600, boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer' }}>
                {t.label}{t.n ? <span style={{ fontSize: 10.5, fontWeight: 700, color: on ? FV_TEAL : FV_FAINT }}>{t.n}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        {tab === 'steps' && (
          <React.Fragment>
            <FvSteps d={d} steps={det.steps} checkable />
            <FvSupplies d={d} supplies={det.supplies} />
          </React.Fragment>
        )}
        {tab === 'fix' && (
          <React.Fragment>
            {ex.trouble && ex.trouble.length > 0
              ? <FvTrouble d={d} items={ex.trouble} onOpenManual={() => setViewer(true)} />
              : <div style={{ fontSize: d.small + 1, color: FV_SUB, textAlign: 'center', padding: '20px 0' }}>No troubleshooting for this task.</div>}
            <FvManualCard d={d} manual={det.manual} compact onOpen={() => setViewer(true)} />
          </React.Fragment>
        )}
        {tab === 'details' && (
          <React.Fragment>
            <FvWhy d={d} text={det.why} />
            <FvRecur d={d} taskId={taskId} />
            <div><FvLabel>From the manual</FvLabel><FvManualCard d={d} manual={det.manual} onOpen={() => setViewer(true)} /></div>
            <div><FvLabel>Assignment</FvLabel><FvAssign d={d} big /></div>
            <div><FvLabel>Notes</FvLabel><FvNote d={d} note={note} /></div>
          </React.Fragment>
        )}
        <div style={{ height: 8 }} />
      </div>
      <FvSticky d={d} more={more} onMore={() => setMore((v) => !v)} />
      {viewer && <ManualViewer d={d} manual={fvManualObj(taskId)} item={item} onClose={() => setViewer(false)} />}
    </Screen>
  );
}

Object.assign(window, { FullViewA, FullViewB, FullViewC, fvManualObj });
