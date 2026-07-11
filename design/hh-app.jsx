// ── Homehub · App shell ──────────────────────────────────────────────────────
// Ties the five tabs into one navigable prototype. Owns light/dark appearance:
// the Settings Appearance toggle flips the whole shell (and the device chrome).
// In dark mode the five tabs render their dark counterparts.

const { useState: useApS } = React;

const LEVEL_RANK = { simple: 0, standard: 1, advanced: 2 };

function AppShell({ d, startTab = 'home', itemsOrg = 'room', tasksView = 'list', askVariant = 'mini', header = 'compact', notices = 'list', initialLevel = 'simple', emptyState = false, initialAppearance = 'light', concerns = [], offline = false }) {
  const [tab, setTab] = useApS(startTab);
  const [sub, setSub] = useApS(null);
  const [level, setLevel] = useApS(initialLevel);
  const [levelUp, setLevelUp] = useApS(null);
  const [appearance, setAppearance] = useApS(initialAppearance);
  const [loading, setLoading] = useApS(true);
  React.useEffect(() => { const t = setTimeout(() => setLoading(false), 700); return () => clearTimeout(t); }, []);
  const [saved, setSaved] = useApS(CG_SEED); // saved answers, shared by Ask + Item detail
  const addSaved = (e) => setSaved((s) => [e, ...s]);
  const delSaved = (eid) => setSaved((s) => s.filter((x) => x.id !== eid));
  const tabs = TABS_FULL;
  const dark = appearance === 'dark';
  const onTab = (id) => { setSub(null); setTab(id); };
  const back = () => setSub(null);
  const onAppearance = (v) => { setSub(null); setAppearance(v); };

  // First-load skeleton for the main tabs (calm, ~700ms).
  if (loading && !dark && !sub && !emptyState) {
    const sk = tab === 'items' ? <ListSkeleton d={d} tabs={tabs} current="items" title="Items" />
      : tab === 'tasks' ? <ListSkeleton d={d} tabs={tabs} current="tasks" title="Tasks" />
      : tab === 'home' ? <HomeSkeleton d={d} tabs={tabs} /> : null;
    if (sk) return <PhoneFrame statusDark bg="#fff">{sk}</PhoneFrame>;
  }

  const changeLevel = (v) => {
    if (LEVEL_RANK[v] > LEVEL_RANK[level]) setLevelUp(v);
    setLevel(v);
  };

  let content;
  if (dark) {
    // Dark mode is tab-level (details/flows stay in the light build). Settings
    // carries the live Appearance toggle so you can switch back.
    const dp = { d, tabs, onTab };
    content = tab === 'items' ? <DarkItems {...dp} />
      : tab === 'tasks' ? <DarkTasks {...dp} />
      : tab === 'ask' ? <DarkAsk {...dp} />
      : tab === 'settings' ? <DarkSettings {...dp} appearance={appearance} onAppearance={onAppearance} />
      : <DarkHome {...dp} />;
  } else if (sub && sub.type === 'item') {
    content = <ItemDetail d={d} id={sub.id} onBack={back} onOpenTask={(id) => setSub({ type: 'task', id })} onComplete={() => setSub({ type: 'complete', id: sub.id })} onEdit={() => setSub({ type: 'edit', id: sub.id })} onFix={() => { setSub(null); setTab('ask'); }} saved={saved} onSaveAdd={addSaved} onSaveDelete={delSaved} />;
  } else if (sub && sub.type === 'edit') {
    content = <ItemEdit d={d} id={sub.id} onBack={() => setSub({ type: 'item', id: sub.id })} onSave={() => setSub({ type: 'item', id: sub.id })} />;
  } else if (sub && sub.type === 'task') {
    content = <TaskDetailScreen d={d} taskId={sub.id} onBack={back} />;
  } else if (sub && sub.type === 'add') {
    content = <AddItemFlow d={d} onClose={back} onDone={() => { setSub(null); setTab('items'); }} />;
  } else if (sub && sub.type === 'complete') {
    content = <AddItemFlow d={d} itemId={sub.id} startStep={3} onClose={() => setSub({ type: 'item', id: sub.id })} onDone={() => setSub({ type: 'item', id: sub.id })} />;
  } else if (sub && sub.type === 'feedback') {
    content = <FeedbackChat d={d} scenario={sub.id || 'dedupe'} onBack={() => setSub({ type: 'set', id: 'help' })} />;
  } else if (sub && sub.type === 'set') {
    content = sub.id === 'members' ? <MembersScreen d={d} onBack={back} />
      : sub.id === 'notifications' ? <NotificationsScreen d={d} onBack={back} />
      : sub.id === 'profile' ? <ProfileScreen d={d} onBack={back} />
      : sub.id === 'help' ? <HelpScreen d={d} onBack={back} onFeedback={() => setSub({ type: 'feedback', id: 'dedupe' })} />
      : sub.id === 'clean' ? <CleanApp d={d} onBack={back} />
      : sub.id === 'warranties' ? <WarrantiesHub d={d} onBack={back} onOpenItem={(id) => setSub({ type: 'item', id })} />
      : sub.id === 'providers' ? <ProvidersApp d={d} onBack={back} />
      : sub.id === 'rooms' ? <RoomsManager d={d} onBack={back} />
      : sub.id === 'custasks' ? <CustomTasksApp d={d} onBack={back} />
      : <MyHomeScreen d={d} onBack={back} />;
  } else if (tab === 'home') {
    content = emptyState
      ? <EmptyHome d={d} tabs={tabs} currentTab="home" onTab={onTab} onAdd={() => setSub({ type: 'add' })} />
      : <RefinedHome d={d} askVariant={askVariant} header={header} notices={notices} level={level} concerns={concerns} offline={offline}
          tabs={tabs} currentTab="home" onTab={onTab} onOpenDetail={(id) => setSub({ type: 'task', id })} onOpenItem={(id) => setSub({ type: 'item', id })} onOpenClean={() => setSub({ type: 'set', id: 'clean' })} onOpenUpkeep={() => setSub({ type: 'set', id: 'custasks' })} />;
  } else if (tab === 'items') {
    content = <ItemsTab d={d} org={itemsOrg} tabs={tabs} current="items" onTab={onTab} onOpenItem={(id) => setSub({ type: 'item', id })} onAdd={() => setSub({ type: 'add' })} />;
  } else if (tab === 'tasks') {
    content = <WeekAgenda d={d} tabs={tabs} current="tasks" onTab={onTab} onOpenTask={(id) => setSub({ type: 'task', id })} />;
  } else if (tab === 'ask') {
    content = <AskTab d={d} tabs={tabs} current="ask" onTab={onTab} onSave={addSaved} />;
  } else {
    content = <SettingsTab d={d} tabs={tabs} current="settings" onTab={onTab} level={level} onLevel={changeLevel}
      onOpen={(which) => setSub({ type: 'set', id: which })} appearance={appearance} onAppearance={onAppearance} />;
  }

  return (
    <PhoneFrame statusDark={!dark} bg={dark ? '#0D1411' : '#fff'}>
      {content}
      {levelUp && !dark && (
        <LevelUpSheet d={d} level={levelUp}
          onClose={() => setLevelUp(null)}
          onKeepSimple={() => { setLevel('simple'); setLevelUp(null); }} />
      )}
    </PhoneFrame>
  );
}

Object.assign(window, { AppShell });
