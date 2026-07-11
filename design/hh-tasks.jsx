// ── Homehub · Tasks tab ──────────────────────────────────────────────────────
// Simple state = a calm grouped list (Today / This week / Done). Two fuller
// options hint at the advanced version: light filters, and a month calendar.

const { useState: useTkS, useMemo: useTkM } = React;

const TK_INK = '#0B1220', TK_SUB = '#6B7280', TK_TEAL = '#1B6B5A', TK_BG = '#F3F5F4';

const HH_TASKS_DONE = [
  { id: 'kd1', name: 'Replaced the HVAC filter', item: 'hvac', when: 'Mar 12', tier: 'essential' },
  { id: 'kd2', name: 'Cleaned the washer gasket', item: 'washer', when: 'Feb 26', tier: 'recommended' },
];

function dueDateKey(due) {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + due);
  return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
}

function TaskRow({ d, t, done, onOpen }) {
  const item = hhItem(t.item);
  return (
    <div onClick={() => onOpen && onOpen(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, cursor: 'pointer' }}>
      <CheckDot size={d.tap} color={TK_TEAL} ring={t.tier === 'essential' ? '#E2A07C' : '#CBD5E1'} done={done} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: d.body, fontWeight: 600, color: done ? TK_SUB : TK_INK, letterSpacing: -0.2, textDecoration: done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
        <div style={{ fontSize: d.small, color: TK_SUB, marginTop: 2 }}>{item.name} · {done ? t.when : `${t.mins} min`}</div>
      </div>
      {!done && <span style={{ fontSize: d.small, fontWeight: 700, color: t.due < 0 ? '#C2410C' : t.due === 0 ? TK_TEAL : TK_SUB, whiteSpace: 'nowrap' }}>{dueLabel(t.due)}</span>}
    </div>
  );
}

function Group({ d, title, children, count }) {
  return (
    <div style={{ marginBottom: d.stack }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, paddingLeft: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: TK_SUB, letterSpacing: 0.6, textTransform: 'uppercase' }}>{title}</span>
        {count != null && <span style={{ fontSize: d.small, color: TK_SUB, fontWeight: 600 }}>{count}</span>}
      </div>
      <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Divided({ items, render }) {
  return items.map((t, i) => (
    <div key={t.id} style={{ borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>{render(t)}</div>
  ));
}

// ── Calendar ─────────────────────────────────────────────────────────────────
function TasksCalendar({ d, open, onOpen }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [month, setMonth] = useTkS(new Date(today.getFullYear(), today.getMonth(), 1));
  const tasksByDay = {};
  open.forEach((t) => { const k = dueDateKey(t.due); (tasksByDay[k] = tasksByDay[k] || []).push(t); });
  const [sel, setSel] = useTkS(`${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`);

  const cells = [];
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first); start.setDate(first.getDate() - offset);
  for (let i = 0; i < 42; i++) { const dt = new Date(start); dt.setDate(start.getDate() + i); cells.push(dt); }
  const monthTitle = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const selTasks = tasksByDay[sel] || [];

  return (
    <div>
      <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', padding: d.cardPad, marginBottom: d.stack }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={{ border: 'none', background: 'transparent', padding: 4, color: TK_SUB }}><Icon name="chevron-left" size={20} /></button>
          <span style={{ fontSize: d.body, fontWeight: 700, color: TK_INK }}>{monthTitle}</span>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={{ border: 'none', background: 'transparent', padding: 4, color: TK_SUB }}><Icon name="chevron-right" size={20} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((h, i) => <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#9AA6A2' }}>{h}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
          {cells.map((dt, i) => {
            const k = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
            const out = dt.getMonth() !== month.getMonth();
            const isToday = k === `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
            const selected = k === sel;
            const dots = tasksByDay[k] || [];
            return (
              <button key={i} onClick={() => setSel(k)} style={{ aspectRatio: '1', border: 'none', borderRadius: 9, background: selected ? TK_INK : 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer', opacity: out ? 0.3 : 1 }}>
                <span style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: selected ? '#fff' : isToday ? TK_TEAL : TK_INK }}>{dt.getDate()}</span>
                <div style={{ display: 'flex', gap: 2, height: 5 }}>
                  {dots.slice(0, 3).map((t, j) => <span key={j} style={{ width: 4, height: 4, borderRadius: 2, background: selected ? '#fff' : TIER[t.tier].dot }} />)}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <Group d={d} title={new Date(today.getFullYear(), parseInt(sel.split('-')[1]), parseInt(sel.split('-')[2])).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} count={selTasks.length}>
        {selTasks.length === 0
          ? <div style={{ padding: d.cardPad, fontSize: d.small + 1, color: TK_SUB }}>Nothing due this day.</div>
          : <Divided items={selTasks} render={(t) => <TaskRow d={d} t={t} onOpen={onOpen} />} />}
      </Group>
    </div>
  );
}

// ── Tasks tab ────────────────────────────────────────────────────────────────
function TasksTab({ d, view = 'list', level, tabs = TABS_FULL, current = 'tasks', onTab, onOpenTask }) {
  const open = [...HH_TASKS].sort((a, b) => a.due - b.due);
  const [filter, setFilter] = useTkS('all');
  const [advView, setAdvView] = useTkS('list'); // advanced: 'list' | 'calendar'

  // Level overrides the explicit `view` prop when present (drives the live app).
  const mode = level === 'simple' ? 'list'
    : level === 'standard' ? 'filters'
    : level === 'advanced' ? (advView === 'calendar' ? 'calendar' : 'filters')
    : view;

  const filtered = mode === 'filters' && filter !== 'all' ? open.filter((t) => t.tier === filter) : open;
  const todayTasks = filtered.filter((t) => t.due <= 0);
  const weekTasks = filtered.filter((t) => t.due > 0);

  const chips = [
    { id: 'all', label: 'All' },
    { id: 'essential', label: 'Essential' },
    { id: 'recommended', label: 'Recommended' },
  ];

  return (
    <Screen bg={TK_BG}>
      <div style={{ padding: `10px ${d.pad}px 0`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: d.big, fontWeight: 800, color: TK_INK, letterSpacing: -0.7, margin: 0 }}>Tasks</h1>
        <span style={{ fontSize: d.small, color: TK_SUB, fontWeight: 500 }}>{open.length} to do</span>
      </div>

      {level === 'advanced' && (
        <div style={{ padding: `${d.gap + 2}px ${d.pad}px 0` }}>
          <div style={{ display: 'flex', background: '#E7EAE9', borderRadius: 11, padding: 3, gap: 2 }}>
            {[{ k: 'list', label: 'List' }, { k: 'calendar', label: 'Calendar' }].map((o) => {
              const on = advView === o.k;
              return <button key={o.k} onClick={() => setAdvView(o.k)} style={{ flex: 1, border: 'none', borderRadius: 9, padding: '8px 4px', background: on ? '#fff' : 'transparent', color: on ? TK_INK : TK_SUB, fontSize: d.small + 1, fontWeight: on ? 700 : 500, boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none' }}>{o.label}</button>;
            })}
          </div>
        </div>
      )}

      {mode === 'filters' && (
        <div style={{ display: 'flex', gap: 8, padding: `${d.gap + 2}px ${d.pad}px 0`, overflowX: 'auto' }}>
          {chips.map((c) => {
            const on = filter === c.id;
            return (
              <button key={c.id} onClick={() => setFilter(c.id)} style={{ flexShrink: 0, border: `1px solid ${on ? TK_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? TK_TEAL : '#fff', color: on ? '#fff' : TK_INK, borderRadius: 99, padding: '7px 14px', fontSize: d.small + 1, fontWeight: 600 }}>{c.label}</button>
            );
          })}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 0` }}>
        {mode === 'calendar' ? (
          <TasksCalendar d={d} open={open} onOpen={onOpenTask} />
        ) : (
          <React.Fragment>
            {todayTasks.length > 0 && (
              <Group d={d} title="Today" count={todayTasks.length}>
                <Divided items={todayTasks} render={(t) => <TaskRow d={d} t={t} onOpen={onOpenTask} />} />
              </Group>
            )}
            <Group d={d} title="This week" count={weekTasks.length}>
              {weekTasks.length === 0
                ? <div style={{ padding: d.cardPad, fontSize: d.small + 1, color: TK_SUB }}>Nothing else this week.</div>
                : <Divided items={weekTasks} render={(t) => <TaskRow d={d} t={t} onOpen={onOpenTask} />} />}
            </Group>
            <Group d={d} title="Done" count={HH_TASKS_DONE.length}>
              <Divided items={HH_TASKS_DONE} render={(t) => <TaskRow d={d} t={t} done />} />
            </Group>
          </React.Fragment>
        )}
        <div style={{ height: d.pad }} />
      </div>

      <TabBar tabs={tabs} current={current} onSelect={onTab} accent={TK_TEAL} solidBg="rgba(243,245,244,0.85)" />
    </Screen>
  );
}

Object.assign(window, { TasksTab, TasksCalendar, HH_TASKS_DONE });
