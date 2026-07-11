// ── Homehub · Desktop screens A — Home, Tasks, Items ─────────────────────────
// Content components only (no chrome). The chrome (top-bar / sidebar) wraps
// these. Each reads T (theme) + d (density) + level so the app unfolds.

const { useState: useScA } = React;

function homeTasks(level) {
  const src = level === 'simple' ? HH_TASKS : HH_TASKS_ENGAGED;
  return src.slice().sort((a, b) => a.due - b.due);
}

// ── Focus card (the single most imminent task) ───────────────────────────────
function FocusCard({ T, d, task, onOpen }) {
  const [open, setOpen] = useScA(false);
  const item = hhItem(task.item);
  const det = dtDetail(task);
  return (
    <Card T={T} d={d} pad={0} raised>
      <div style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <TierChip T={T} tier={task.tier} />
          <span style={{ fontSize: 13, fontWeight: 700, color: task.due < 0 ? T.clay : T.teal }}>{dueLabel(task.due)} · {task.mins} min</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 }}>
          <Glyph T={T} icon={item.icon} size={56} radius={15} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 23, fontWeight: 800, color: T.ink, letterSpacing: -0.5, lineHeight: 1.12 }}>{task.name}</div>
            <div style={{ fontSize: 13.5, color: T.sub, marginTop: 4 }}>{item.name} · {item.room}</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn T={T} kind="ghost" iconRight={open ? 'chevron-up' : 'chevron-down'} onClick={() => setOpen((v) => !v)}>See how</Btn>
            <Btn T={T} icon="check">Mark done</Btn>
          </div>
        </div>
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${T.line}`, padding: 22, display: 'flex', flexDirection: 'column', gap: 16, background: T.surface2 }}>
          <WhyNote T={T} text={det.why} />
          <div style={{ display: 'grid', gridTemplateColumns: det.manual ? '1.4fr 1fr' : '1fr', gap: 22, alignItems: 'start' }}>
            <StepsList T={T} steps={det.steps} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SuppliesRow T={T} supplies={det.supplies} />
              <ManualSnippet T={T} manual={det.manual} />
            </div>
          </div>
          <button onClick={() => onOpen && onOpen(task.id)} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: T.teal, fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5, padding: 0, cursor: 'pointer' }}>
            Open full view <Icon name="arrow-right" size={14} />
          </button>
        </div>
      )}
    </Card>
  );
}

// ── Upcoming agenda (timeline) ───────────────────────────────────────────────
function Agenda({ T, d, tasks, onOpen }) {
  const [openId, setOpenId] = useScA(null);
  return (
    <div>
      <SectionLabel T={T}>Upcoming</SectionLabel>
      <div style={{ position: 'relative', paddingLeft: 24 }}>
        <div style={{ position: 'absolute', left: 5, top: 8, bottom: 10, width: 2, background: T.line }} />
        {tasks.map((t) => {
          const item = hhItem(t.item);
          const det = dtDetail(t);
          const open = openId === t.id;
          return (
            <div key={t.id} style={{ position: 'relative', marginBottom: 12 }}>
              <div style={{ position: 'absolute', left: -24, top: 17, width: 12, height: 12, borderRadius: 7, background: T.surface, border: `2px solid ${dtTier(T, t.tier).fg}` }} />
              <Card T={T} d={d} pad={0}>
                <div onClick={() => setOpenId(open ? null : t.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', cursor: 'pointer' }}>
                  <Glyph T={T} icon={item.icon} size={36} radius={10} tone="grey" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink, letterSpacing: -0.2 }}>{t.name}</div>
                    <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{item.name} · {dueLabel(t.due)} · {t.mins} min</div>
                  </div>
                  <TierChip T={T} tier={t.tier} />
                  <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} style={{ color: T.faint }} />
                </div>
                {open && (
                  <div style={{ borderTop: `1px solid ${T.line}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, background: T.surface2 }}>
                    <WhyNote T={T} text={det.why} />
                    <StepsList T={T} steps={det.steps} columns={2} />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <Btn T={T} icon="check" size="sm">Mark done</Btn>
                      <Btn T={T} kind="ghost" size="sm" onClick={() => onOpen && onOpen(t.id)}>Full view</Btn>
                      <Btn T={T} kind="subtle" size="sm" icon="alarm-clock">Snooze</Btn>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OfflineStrip({ T }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.slateSoft, border: `1px solid ${T.line}`, borderRadius: 12, padding: '11px 14px' }}>
      <Icon name="cloud-off" size={16} style={{ color: T.slate }} />
      <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>You're offline — showing your last sync.</span>
      <span style={{ fontSize: 12.5, color: T.sub, marginLeft: 'auto' }}>Last updated 2:14 PM</span>
    </div>
  );
}

// ── Home upkeep — live slice of the unified upkeep model (desktop) ────────────
// Mirrors mobile: due-soon recurring home tasks that can be checked off or
// snoozed, plus one suggestion you can add to the schedule in a click.
function DesktopHomeUpkeep({ T, d, onManage }) {
  const [items, setItems] = useScA(HH_UPKEEP.filter((t) => t.due <= 50).sort((a, b) => a.due - b.due).map((t) => ({ ...t })));
  const [doneIds, setDoneIds] = useScA([]);
  const [suggestIdx, setSuggestIdx] = useScA(0);
  const [adding, setAdding] = useScA(false);
  const suggestion = HH_UPKEEP_SUGGEST[suggestIdx];
  const complete = (id) => setDoneIds((x) => x.includes(id) ? x.filter((n) => n !== id) : [...x, id]);
  const snooze = (id) => setItems((xs) => xs.map((t) => t.id === id ? { ...t, due: t.due + 14 } : t).sort((a, b) => a.due - b.due));
  const addSuggestion = () => { setItems((xs) => [...xs, { ...suggestion }].sort((a, b) => a.due - b.due)); setAdding(false); setSuggestIdx((i) => i + 1); };

  return (
    <div>
      <SectionLabel T={T} right={<button onClick={onManage} style={{ border: 'none', background: 'none', color: T.teal, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Manage</button>}>Home upkeep</SectionLabel>
      <Card T={T} d={d} pad={0}>
        {items.map((m, i) => {
          const cm = upCat(m.cat);
          const done = doneIds.includes(m.id);
          const seasonal = m.recur === 'seasonal';
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i ? `1px solid ${T.line}` : 'none', opacity: done ? 0.6 : 1 }}>
              <button onClick={() => complete(m.id)} title="Mark done" style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', flexShrink: 0, display: 'flex' }}>
                <span style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${done ? T.teal : T.line2}`, background: done ? T.teal : 'transparent', display: 'grid', placeItems: 'center' }}>{done && <Icon name="check" size={13} strokeWidth={3} style={{ color: '#fff' }} />}</span>
              </button>
              <Glyph T={T} icon={cm.icon} size={34} radius={9} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, textDecoration: done ? 'line-through' : 'none' }}>{m.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
                  {seasonal && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: T.gold, background: T.goldSoft, borderRadius: 99, padding: '1px 7px' }}><Icon name="leaf" size={10} /> Seasonal</span>}
                  <span style={{ fontSize: 12.5, color: T.sub }}>{upSched(m)}</span>
                </div>
              </div>
              {done ? (
                <span style={{ fontSize: 12.5, fontWeight: 600, color: T.teal }}>Done</span>
              ) : (
                <React.Fragment>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: m.due <= 10 ? T.gold : T.sub, whiteSpace: 'nowrap' }}>{upDueLabel(m.due)}</span>
                  <IconBtn T={T} name="alarm-clock" size={30} title="Snooze 2 weeks" onClick={() => snooze(m.id)} />
                </React.Fragment>
              )}
            </div>
          );
        })}
        {suggestion && (
          <div style={{ borderTop: `1px solid ${T.line}`, background: T.surface2 }}>
            {!adding ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                <Icon name="sparkles" size={16} style={{ color: T.teal, flexShrink: 0, width: 22 }} />
                <Glyph T={T} icon={upCat(suggestion.cat).icon} size={34} radius={9} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{suggestion.title}</div>
                  <div style={{ fontSize: 12.5, color: T.sub, marginTop: 1 }}>Suggested · {upSched(suggestion)}</div>
                </div>
                <Btn T={T} kind="soft" size="sm" icon="plus" onClick={() => setAdding(true)}>Add</Btn>
              </div>
            ) : (
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 13.5, color: T.ink, fontWeight: 600 }}>Add "{suggestion.title}" to your schedule?</div>
                <div style={{ fontSize: 12.5, color: T.sub, margin: '4px 0 12px' }}>Repeats {upSched(suggestion).toLowerCase()} · {suggestion.area}</div>
                <div style={{ display: 'flex', gap: 9 }}>
                  <Btn T={T} size="sm" onClick={addSuggestion}>Add to schedule</Btn>
                  <Btn T={T} kind="subtle" size="sm" onClick={() => setAdding(false)}>Not now</Btn>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Home ─────────────────────────────────────────────────────────────────────
function DesktopHome({ T, d, level = 'simple', offline = false, dataState = 'normal', onNav, onOpenItem, onOpenTask }) {
  const tasks = homeTasks(level);
  const hero = tasks[0];
  const upcoming = tasks.slice(1);
  const overdue = tasks.filter((t) => t.due < 0).length;
  const week = tasks.filter((t) => t.due >= 0 && t.due <= 7).length;
  const done = tasks.filter((t) => t.due > 0 && t.due <= 7).length;
  const stats = [
    { k: 'Due today', v: tasks.filter((t) => t.due === 0).length, c: T.teal },
    { k: 'This week', v: week, c: T.ink },
    { k: 'Overdue', v: overdue, c: overdue ? T.clay : T.faint },
  ];
  // Items whose purchase details are incomplete — they can't yet power warranties.
  // (Seed data is complete; the 'no-details' state seeds a realistic example list.)
  const realMissing = HH_ITEMS.filter((it) => !it.purchased || !it.warranty);
  const missing = dataState === 'no-details'
    ? [hhItem('washer'), hhItem('dish')]
    : realMissing;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.teal, letterSpacing: 0.5, textTransform: 'uppercase' }}>{hhToday()}</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: T.ink, letterSpacing: -0.7, lineHeight: 1.15, margin: '4px 0 0', whiteSpace: 'nowrap' }}>{hhGreeting()}, Barb</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <Btn T={T} icon="sparkles" onClick={() => onNav && onNav('ask')}>Ask Homehub</Btn>
        </div>
      </div>

      {offline && <div style={{ marginBottom: 18 }}><OfflineStrip T={T} /></div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.85fr) minmax(280px,1fr)', gap: 22, alignItems: 'start' }}>
        {/* main column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {stats.map((s) => (
              <Card T={T} d={d} key={s.k} pad={15}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, letterSpacing: 0.4, textTransform: 'uppercase' }}>{s.k}</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: s.c, letterSpacing: -1, marginTop: 6, fontFamily: DT_MONO }}>{s.v}</div>
              </Card>
            ))}
          </div>

          <div>
            <SectionLabel T={T} right={<span style={{ fontSize: 12.5, color: T.sub, fontWeight: 600 }}>{upcoming.length} more this week</span>}>Your focus</SectionLabel>
            <FocusCard T={T} d={d} task={hero} onOpen={onOpenTask} />
          </div>

          <Agenda T={T} d={d} tasks={upcoming} onOpen={onOpenTask} />

          {level !== 'simple' && (
            <DesktopHomeUpkeep T={T} d={d} onManage={() => onNav && onNav('settings')} />
          )}
        </div>

        {/* side column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card T={T} d={d}>
            <SectionLabel T={T} style={{ marginBottom: 12 }} right={<button onClick={() => onNav && onNav('tasks')} style={{ border: 'none', background: 'none', color: T.teal, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Calendar</button>}>This week</SectionLabel>
            <WeekStrip T={T} tasks={tasks} />
          </Card>

          <div>
            <SectionLabel T={T}>Good to know</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {HH_ITEMS.length === 0 ? (
                <GoodToKnowNoItems T={T} d={d} onAdd={() => {}} />
              ) : dataState === 'no-details' ? (
                <AddDetailsNudge T={T} d={d} items={missing} onAdd={() => {}} onOpenItem={onOpenItem} />
              ) : (
                <React.Fragment>
                  {HH_NOTICES.map((n) => <NoticeCard key={n.id} T={T} n={n} onClick={() => onOpenItem && onOpenItem(n.item)} />)}
                  {missing.length > 0 && <AddDetailsNudge T={T} d={d} items={missing} onAdd={() => {}} onOpenItem={onOpenItem} />}
                </React.Fragment>
              )}
            </div>
          </div>

          {level === 'advanced' && (
            <div>
              <SectionLabel T={T} right={<button onClick={() => onNav && onNav('clean')} style={{ border: 'none', background: 'none', color: T.teal, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>All</button>}>Deep-clean guides</SectionLabel>
              <Card T={T} d={d} pad={0}>
                {HH_GUIDES.map((g, i) => (
                  <button key={g.name} onClick={() => onNav && onNav('clean')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderTop: i ? `1px solid ${T.line}` : 'none', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <Glyph T={T} icon={g.icon} size={34} radius={9} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{g.name}</div>
                      <div style={{ fontSize: 12, color: T.sub }}>{g.mins} min guide</div>
                    </div>
                    <Icon name="chevron-right" size={16} style={{ color: T.faint }} />
                  </button>
                ))}
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// A compact 7-day strip with task dots.
function WeekStrip({ T, tasks }) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date();
    dt.setDate(dt.getDate() + i);
    const dueHere = tasks.filter((t) => t.due === i);
    days.push({ i, label: dt.toLocaleDateString('en-US', { weekday: 'short' })[0], num: dt.getDate(), tasks: dueHere });
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
      {days.map((day) => {
        const today = day.i === 0;
        return (
          <div key={day.i} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10.5, color: T.faint, fontWeight: 700, marginBottom: 5 }}>{day.label}</div>
            <div style={{ height: 40, borderRadius: 10, background: today ? T.teal : T.surface2, color: today ? '#fff' : T.ink, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, border: today ? 'none' : `1px solid ${T.line}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: DT_MONO }}>{day.num}</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {day.tasks.slice(0, 3).map((t, k) => <span key={k} style={{ width: 4, height: 4, borderRadius: 2, background: today ? 'rgba(255,255,255,0.85)' : dtTier(T, t.tier).fg }} />)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tasks ────────────────────────────────────────────────────────────────────
function DesktopTasks({ T, d, level = 'simple', onOpenTask }) {
  const all = (level === 'simple' ? HH_TASKS : HH_TASKS_ENGAGED).slice().sort((a, b) => a.due - b.due);
  const [filter, setFilter] = useScA('all');
  const [view, setView] = useScA('list');
  const advanced = level === 'advanced';
  const filtered = all.filter((t) => filter === 'all' ? true : filter === 'overdue' ? t.due < 0 : filter === 'soon' ? t.due >= 0 && t.due <= 7 : t.due > 7);
  const overdue = all.filter((t) => t.due < 0).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800, color: T.ink, letterSpacing: -0.6, margin: 0 }}>Tasks</h1>
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: T.sub, marginTop: 6 }}>
            <span>{all.length} total</span>
            {overdue > 0 && <span style={{ color: T.clay, fontWeight: 600 }}>{overdue} overdue</span>}
            <span>8 done this month</span>
          </div>
        </div>
        <Btn T={T} icon="plus">New task</Btn>
      </div>

      <Card T={T} d={d} pad={0}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
          {[['all', 'All'], ['overdue', 'Overdue'], ['soon', 'Due soon'], ['later', 'Later']].map(([k, l]) => (
            <Pill T={T} key={k} size="sm" active={filter === k} onClick={() => setFilter(k)}>{l}</Pill>
          ))}
          <div style={{ flex: 1 }} />
          {advanced && (
            <div style={{ display: 'inline-flex', border: `1px solid ${T.line2}`, borderRadius: 9, overflow: 'hidden' }}>
              {[['list', 'List'], ['calendar', 'Calendar']].map(([k, l]) => (
                <button key={k} onClick={() => setView(k)} style={{ padding: '7px 14px', border: 'none', cursor: 'pointer', background: view === k ? T.teal : 'transparent', color: view === k ? '#fff' : T.sub, fontWeight: 600, fontSize: 12.5, fontFamily: 'inherit' }}>{l}</button>
              ))}
            </div>
          )}
        </div>

        {advanced && view === 'calendar' ? (
          <TaskCalendar T={T} tasks={all} />
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 150px 130px 110px 80px', padding: '10px 16px', background: T.surface2, fontSize: 11, fontWeight: 700, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              <div></div><div>Task</div><div>Item</div><div>Tier</div><div>Due</div><div></div>
            </div>
            {filtered.map((t) => {
              const item = hhItem(t.item);
              return (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 150px 130px 110px 80px', padding: '12px 16px', alignItems: 'center', borderTop: `1px solid ${T.line}`, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, background: dtTier(T, t.tier).fg }} />
                  <CheckBox T={T} done={false} size={19} />
                  <div onClick={() => onOpenTask && onOpenTask(t.id)} style={{ cursor: 'pointer', paddingRight: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{t.mins} min</div>
                  </div>
                  <div style={{ fontSize: 13, color: T.sub }}>{item.name}</div>
                  <div><TierChip T={T} tier={t.tier} /></div>
                  <div><DueText T={T} due={t.due} /></div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <IconBtn T={T} name="clock" size={30} title="Snooze" />
                    <IconBtn T={T} name="check" size={30} active title="Done" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function TaskCalendar({ T, tasks }) {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let dn = 1; dn <= daysInMonth; dn++) cells.push(dn);
  const taskOnDay = (dn) => tasks.filter((t) => { const dt = new Date(); dt.setDate(dt.getDate() + t.due); return dt.getDate() === dn && dt.getMonth() === today.getMonth(); });
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 12 }}>{today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => <div key={w} style={{ fontSize: 11, fontWeight: 700, color: T.faint, textAlign: 'center', padding: '4px 0' }}>{w}</div>)}
        {cells.map((dn, i) => {
          const ts = dn ? taskOnDay(dn) : [];
          const isToday = dn === today.getDate();
          return (
            <div key={i} style={{ minHeight: 78, borderRadius: 10, border: `1px solid ${T.line}`, background: dn ? (isToday ? T.tealWash2 : T.surface) : 'transparent', padding: 7 }}>
              {dn && <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? T.teal : T.sub, fontFamily: DT_MONO }}>{dn}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                {ts.slice(0, 2).map((t) => (
                  <div key={t.id} style={{ fontSize: 10.5, fontWeight: 600, color: dtTier(T, t.tier).fg, background: dtTier(T, t.tier).soft, borderRadius: 5, padding: '2px 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                ))}
                {ts.length > 2 && <div style={{ fontSize: 10, color: T.faint, paddingLeft: 3 }}>+{ts.length - 2}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Items ────────────────────────────────────────────────────────────────────
function DesktopItems({ T, d, onOpenItem }) {
  const [sort, setSort] = useScA('room');
  const [room, setRoom] = useScA('all');
  const rooms = [...new Set(HH_ITEMS.map((i) => i.room))];
  let visible = room === 'all' ? HH_ITEMS : HH_ITEMS.filter((i) => i.room === room);

  let groups;
  if (sort === 'flat') groups = [{ key: null, items: [...visible].reverse() }];
  else {
    const keyOf = (it) => sort === 'category' ? it.category : it.room;
    const map = {};
    visible.forEach((it) => { (map[keyOf(it)] = map[keyOf(it)] || []).push(it); });
    groups = Object.entries(map).map(([key, items]) => ({ key, items }));
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 27, fontWeight: 800, color: T.ink, letterSpacing: -0.6, margin: 0 }}>Items</h1>
        <div style={{ fontSize: 13, color: T.sub, marginTop: 6 }}>{HH_ITEMS.length} items across {rooms.length} rooms</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <Pill T={T} size="sm" active={room === 'all'} onClick={() => setRoom('all')} count={HH_ITEMS.length}>All</Pill>
        {rooms.map((r) => <Pill T={T} key={r} size="sm" active={room === r} onClick={() => setRoom(r)} count={HH_ITEMS.filter((i) => i.room === r).length}>{r}</Pill>)}
        <span style={{ width: 1, alignSelf: 'stretch', minHeight: 20, background: T.line, margin: '0 6px' }} />
        <span style={{ fontSize: 12.5, color: T.sub, fontWeight: 600 }}>Sort</span>
        {[['room', 'Room'], ['category', 'Type'], ['flat', 'Recent']].map(([k, l]) => (
          <Pill T={T} key={k} size="sm" active={sort === k} onClick={() => setSort(k)}>{l}</Pill>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {groups.map((g) => (
          <div key={g.key || 'all'}>
            {g.key && <SectionLabel T={T}>{g.key}</SectionLabel>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
              {g.items.map((it) => {
                const tasks = itemTasks(it.id);
                const due = tasks.find((t) => t.due <= 2);
                const ex = itemExtras(it.id);
                return (
                  <Card T={T} d={d} key={it.id} pad={16} onClick={() => onOpenItem && onOpenItem(it.id)} style={{ display: 'flex', flexDirection: 'column', gap: 11, position: 'relative', minHeight: 168 }}>
                    {due && <span title="Task due" style={{ position: 'absolute', top: 13, right: 13, width: 8, height: 8, borderRadius: 4, background: dtTier(T, due.tier).fg }} />}
                    <ItemThumb T={T} icon={it.icon} size={48} radius={12} />
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, letterSpacing: -0.2, lineHeight: 1.25 }}>{it.name}</div>
                      <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{it.brand}</div>
                    </div>
                    <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10.5, color: T.faint, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' }}>{sort === 'room' ? it.category : it.room}</span>
                      {tasks.length > 0 && <span style={{ fontSize: 11, color: T.sub, fontWeight: 600 }}>{tasks.length} task{tasks.length > 1 ? 's' : ''}</span>}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { DesktopHome, DesktopHomeUpkeep, DesktopTasks, DesktopItems, FocusCard, Agenda, OfflineStrip, WeekStrip, TaskCalendar });
