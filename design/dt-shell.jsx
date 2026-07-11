// ── Homehub · Desktop interactive shell ──────────────────────────────────────
// Ties the chrome (top-bar / sidebar) to the screens. Owns navigation, item &
// task drill-downs, the Homehub level (drives the unfold), light/dark, offline.

const { useState: useShD, useEffect: useShE } = React;

const DT_TITLES = { home: 'Home', items: 'Items', tasks: 'Tasks', clean: 'Clean', warranties: 'Warranties', providers: 'Service providers', ask: 'Ask Homehub', settings: 'Settings' };

// Recurrence + notes + members — desktop task "full view" (Version B parity).
const DT_RECUR = {
  s1: { every: 'Every 90 days', next: 'Sep 12' },
  s2: { every: 'Twice a year', next: 'Nov 3' },
  s3: { every: 'Monthly', next: 'Aug 14' },
};
const DT_TASK_NOTES = {
  s1: 'Filters are in the garage cabinet, top shelf. The 16×25×1 3-pack from the hardware store is cheaper than ordering online.',
};
const DT_MEMBERS = [
  { id: 'barb', name: 'Barb', initials: 'BH' },
  { id: 'dave', name: 'Dave', initials: 'DH' },
  { id: 'maya', name: 'Maya', initials: 'MH' },
];

function DTRecur({ T, taskId }) {
  const r = DT_RECUR[taskId] || DT_RECUR.s1;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: '12px 14px' }}>
      <Icon name="repeat" size={17} style={{ color: T.teal, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13.5, color: T.ink, fontWeight: 600 }}>Repeats {r.every.toLowerCase()}</span>
      <span style={{ fontSize: 13, color: T.sub }}>Next: {r.next}</span>
    </div>
  );
}

function DTAssign({ T }) {
  const [who, setWho] = useShD('barb');
  const [open, setOpen] = useShD(false);
  const cur = DT_MEMBERS.find((m) => m.id === who);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((v) => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, border: `1px solid ${T.line}`, background: T.surface, borderRadius: 12, padding: '11px 13px', cursor: 'pointer', textAlign: 'left' }}>
        <Avatar T={T} initials={cur.initials} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: T.sub, letterSpacing: 0.4, textTransform: 'uppercase' }}>Assigned to</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{cur.name}</div>
        </div>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={17} style={{ color: T.faint }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 10, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, boxShadow: T.shadowMd, overflow: 'hidden' }}>
          {DT_MEMBERS.map((m, i) => (
            <button key={m.id} onClick={() => { setWho(m.id); setOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', border: 'none', borderTop: i ? `1px solid ${T.line}` : 'none', background: m.id === who ? T.tealWash2 : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
              <Avatar T={T} initials={m.initials} size={26} />
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: T.ink }}>{m.name}</span>
              {m.id === who && <Icon name="check" size={16} strokeWidth={2.6} style={{ color: T.teal }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DTNote({ T, note }) {
  const [editing, setEditing] = useShD(false);
  if (!note && !editing) {
    return (
      <button onClick={() => setEditing(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: `1.5px dashed ${T.line2}`, background: 'transparent', color: T.sub, borderRadius: 12, padding: '11px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
        <Icon name="sticky-note" size={15} style={{ color: T.teal }} /> Add a note
      </button>
    );
  }
  return (
    <div style={{ background: T.dark ? T.surface2 : '#FBFCF8', border: `1px solid ${T.dark ? T.line : '#E6ECD9'}`, borderRadius: 14, padding: '13px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, color: T.dark ? T.sub : '#7C8A5A', letterSpacing: 0.5, textTransform: 'uppercase' }}><Icon name="sticky-note" size={13} /> Your note</div>
        <button style={{ border: 'none', background: 'transparent', color: T.teal, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
      </div>
      <div style={{ fontSize: 13.5, color: T.dark ? T.ink : '#3A4030', lineHeight: 1.5, textWrap: 'pretty' }}>{note}</div>
    </div>
  );
}

function DTSupplies({ T, supplies }) {
  const [added, setAdded] = useShD(false);
  if (!supplies || !supplies.length) return null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.sub, letterSpacing: 0.5, textTransform: 'uppercase' }}>You'll need</span>
        <button onClick={() => setAdded((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: T.teal, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          <Icon name={added ? 'check' : 'plus'} size={14} strokeWidth={2.6} /> {added ? 'Added to list' : 'Add to list'}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {supplies.map((s) => (
          <span key={s.name} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, border: `1px solid ${added ? 'rgba(27,107,90,0.3)' : T.line2}`, background: added ? T.tealWash2 : T.surface, borderRadius: 10, padding: '7px 11px', fontSize: 13, color: T.ink, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {s.name}{s.spec && <span style={{ color: T.sub, fontWeight: 500 }}>· {s.spec}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function DesktopTaskDetail({ T, d, taskId, onBack, onOpenItem }) {
  const src = [...HH_TASKS, ...HH_TASKS_ENGAGED];
  const task = src.find((t) => t.id === taskId) || HH_TASKS[0];
  const item = hhItem(task.item);
  const det = dtDetail(task);
  const ex = itemExtras(task.item);
  const note = DT_TASK_NOTES[taskId];
  const [more, setMore] = useShD(false);
  const [viewer, setViewer] = useShD(false);
  const multiMember = DT_MEMBERS.length > 1;

  return (
    <div style={{ maxWidth: 1040 }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: T.sub, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: '2px 0', marginBottom: 16 }}>
        <Icon name="chevron-left" size={17} /> Back
      </button>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <Glyph T={T} icon={item.icon} size={60} radius={16} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <TierChip T={T} tier={task.tier} />
          <h1 style={{ fontSize: 28, fontWeight: 800, color: T.ink, letterSpacing: -0.7, margin: '8px 0 0' }}>{task.name}</h1>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 18, margin: '14px 0 22px', fontSize: 13.5, color: T.sub }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="clock" size={15} /> {det.time || task.mins} min</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="map-pin" size={15} /> {item.name} · {item.room}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="calendar" size={15} /> {dueLabel(task.due)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(270px,1fr)', gap: 22, alignItems: 'start' }}>
        {/* main column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card T={T} d={d} pad={22} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <WhyNote T={T} text={det.why} />
            <DTSupplies T={T} supplies={det.supplies} />
            <div style={{ height: 1, background: T.line }} />
            <StepsList T={T} steps={det.steps} />
          </Card>

          {det.manual && (
            <div style={{ borderLeft: `3px solid ${T.teal}`, background: T.dark ? T.surface2 : '#EEF4F2', borderRadius: '0 14px 14px 0', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <Icon name="book-open" size={14} style={{ color: T.teal }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: T.teal, letterSpacing: 0.5, textTransform: 'uppercase' }}>From your manual</span>
              </div>
              <div style={{ fontSize: 14.5, color: T.dark ? T.ink : '#2B3A36', lineHeight: 1.5, fontStyle: 'italic' }}>"{det.manual.quote}"</div>
              <button onClick={() => setViewer(true)} style={{ marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: T.surface, color: T.teal, borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                <Icon name="external-link" size={13} /> Open {det.manual.src}
              </button>
            </div>
          )}

          {ex.trouble && ex.trouble.length > 0 && (
            <div>
              <SectionLabel T={T}>If it goes wrong</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {ex.trouble.map((tr, i) => <Troubleshoot key={i} T={T} d={d} tr={tr} onFix={() => setViewer(true)} />)}
              </div>
            </div>
          )}

          <div>
            <SectionLabel T={T}>Notes</SectionLabel>
            <DTNote T={T} note={note} />
          </div>
        </div>

        {/* side rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0 }}>
          <Card T={T} d={d} pad={16} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Btn T={T} icon="check" size="lg" style={{ width: '100%' }}>Mark done</Btn>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn T={T} kind="subtle" size="sm" icon="alarm-clock" style={{ flex: 1 }}>Snooze</Btn>
              <Btn T={T} kind="subtle" size="sm" icon="skip-forward" style={{ flex: 1 }}>Skip</Btn>
            </div>
          </Card>

          <div>
            <SectionLabel T={T} style={{ marginBottom: 10 }}>Schedule</SectionLabel>
            <DTRecur T={T} taskId={taskId} />
          </div>

          {multiMember && (
            <div>
              <SectionLabel T={T} style={{ marginBottom: 10 }}>Assignment</SectionLabel>
              <DTAssign T={T} />
            </div>
          )}
        </div>
      </div>

      {viewer && typeof DesktopManualViewer !== 'undefined' && (
        <DesktopManualViewer T={T} d={d} manual={(ex.manuals && ex.manuals[0]) || { name: det.manual ? det.manual.src : 'Manual', pages: 14, label: 'Owner’s manual' }} item={item} onClose={() => setViewer(false)} onAsk={() => setViewer(false)} />
      )}
    </div>
  );
}

function LevelToast({ T, level, onClose }) {
  const copy = level === 'advanced'
    ? { title: 'Advanced unlocked', body: 'Deep-clean guides, a tasks calendar, and service providers are now available.' }
    : { title: 'Standard unlocked', body: 'Seasonal upkeep, warranties and cleaning now appear as your home grows.' };
  return (
    <div style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 60, width: 460, maxWidth: '90%' }}>
      <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start', background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, boxShadow: T.shadowMd, padding: 18 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: T.tealWash, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="sparkles" size={20} style={{ color: T.teal }} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{copy.title}</div>
          <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5, marginTop: 3 }}>{copy.body}</div>
        </div>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: T.faint, padding: 2 }}><Icon name="x" size={18} /></button>
      </div>
    </div>
  );
}

function DesktopShell({ nav = 'top', density = 'cozy', level: initLevel = 'simple', appearance: initAppearance = 'light', offline = false, dataState = 'normal' }) {
  const d = dens(String(density).toLowerCase());
  const [tab, setTab] = useShD('home');
  const [sub, setSub] = useShD(null);        // { type:'item'|'task', id }
  const [level, setLevel] = useShD(initLevel);
  const [appearance, setAppearance] = useShD(initAppearance);
  const [navMode, setNavMode] = useShD(nav);
  const [levelUp, setLevelUp] = useShD(null);
  const [modal, setModal] = useShD(null);
  useShE(() => { setLevel(initLevel); }, [initLevel]);
  useShE(() => { setAppearance(initAppearance); }, [initAppearance]);
  useShE(() => { setNavMode(nav); }, [nav]);
  const T = dtTheme(appearance === 'dark');

  // keep tab valid for the level (e.g. dropping to Simple while on Providers)
  useShE(() => { if (!navFor(level).some((n) => n.id === tab) && tab !== 'settings') setTab('home'); }, [level]);

  const goTab = (id) => { setSub(null); setTab(id); };
  const onLevel = (v) => {
    if (LEVEL_RANK[v] > LEVEL_RANK[level]) setLevelUp(v);
    setLevel(v);
  };
  const openItem = (id) => setSub({ type: 'item', id });
  const openTask = (id) => setSub({ type: 'task', id });
  const onAdd = () => setModal('add');

  let content;
  if (sub && sub.type === 'item') content = <DesktopItemDetail T={T} d={d} id={sub.id} onBack={() => setSub(null)} onEdit={() => setSub({ type: 'edititem', id: sub.id })} onFix={() => goTab('ask')} onOpenTask={openTask} onOpenClean={() => goTab('clean')} />;
  else if (sub && sub.type === 'edititem') content = <DesktopItemEdit T={T} d={d} id={sub.id} onBack={() => setSub({ type: 'item', id: sub.id })} onSave={() => setSub({ type: 'item', id: sub.id })} />;
  else if (sub && sub.type === 'task') content = <DesktopTaskDetail T={T} d={d} taskId={sub.id} onBack={() => setSub(null)} />;
  else if (tab === 'home') content = dataState === 'loading' ? <DesktopLoading T={T} d={d} />
    : dataState === 'empty' ? <DesktopEmpty T={T} d={d} onAdd={onAdd} />
    : dataState === 'error' ? <DesktopError T={T} d={d} onRetry={() => {}} />
    : <DesktopHome T={T} d={d} level={level} offline={offline} onNav={goTab} onOpenItem={openItem} onOpenTask={openTask} />;
  else if (tab === 'items') content = <DesktopItems T={T} d={d} onOpenItem={openItem} />;
  else if (tab === 'tasks') content = <DesktopTasks T={T} d={d} level={level} onOpenTask={openTask} />;
  else if (tab === 'clean') content = <DesktopClean T={T} d={d} />;
  else if (tab === 'warranties') content = <DesktopWarranties T={T} d={d} onOpenItem={openItem} />;
  else if (tab === 'providers') content = <DesktopProviders T={T} d={d} />;
  else if (tab === 'ask') content = <DesktopAsk T={T} d={d} onSave={() => {}} />;
  else content = <DesktopSettings T={T} d={d} level={level} onLevel={onLevel} appearance={appearance} onAppearance={(v) => { setSub(null); setAppearance(v); }} nav={navMode} onNav={(v) => { setSub(null); setNavMode(v); }} />;

  const title = sub ? (sub.type === 'item' ? 'Item' : sub.type === 'edititem' ? 'Edit item' : 'Task') : DT_TITLES[tab];

  return (
    <Win T={T}>
      <div style={{ position: 'relative', height: '100%' }}>
        <AppChrome T={T} d={d} nav={navMode} tab={tab} onTab={goTab} level={level} title={title} onAdd={onAdd} scrollKey={tab + (sub ? sub.id : '')}>
          {content}
        </AppChrome>
        {levelUp && <LevelToast T={T} level={levelUp} onClose={() => setLevelUp(null)} />}
        {modal === 'add' && typeof DesktopAddItem !== 'undefined' && (
          <DesktopAddItem T={T} d={d} onClose={() => setModal(null)} onDone={() => { setModal(null); goTab('items'); }} />
        )}
      </div>
    </Win>
  );
}

Object.assign(window, { DesktopShell, DesktopTaskDetail, LevelToast });
