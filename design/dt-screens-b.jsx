// ── Homehub · Desktop screens B — Item detail, Ask, Settings ─────────────────

const { useState: useScB } = React;

// ── Item detail ──────────────────────────────────────────────────────────────
function DesktopItemDetail({ T, d, id, onBack, onEdit, onFix, onOpenTask, onOpenClean, initialTab }) {
  const it = hhItem(id);
  const ex = itemExtras(id);
  const tasks = itemTasks(id);
  const [tab, setTab] = useScB(initialTab || 'tasks');
  const [viewer, setViewer] = useScB(null);
  const [manage, setManage] = useScB(false);
  const saved = (typeof CG_SEED !== 'undefined' ? CG_SEED : []).filter((s) => s.item === id);
  const recall = ex.recall;
  const guideCount = (ex.howto ? ex.howto.length : 0) + (ex.care ? ex.care.length : 0);

  const tabs = [
  { id: 'tasks', label: 'Tasks', n: tasks.length },
  { id: 'guides', label: 'Guides', n: guideCount },
  { id: 'fix', label: 'Fix it', n: ex.trouble.length },
  { id: 'saved', label: 'Saved answers', n: saved.length },
  { id: 'activity', label: 'Activity', n: ex.history.length }];


  return (
    <div>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: T.sub, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', padding: '2px 0', marginBottom: 14 }}>
        <Icon name="chevron-left" size={17} /> Items
      </button>

      {/* header */}
      <Card T={T} d={d} pad={22} style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ width: 132, height: 132, borderRadius: 16, flexShrink: 0, background: T.dark ? T.raise : 'linear-gradient(135deg,#EEF3F1,#E0EAE5)', display: 'grid', placeItems: 'center', color: T.teal }}>
            <Icon name={it.icon} size={58} strokeWidth={1.5} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 25, fontWeight: 800, color: T.ink, letterSpacing: -0.5, margin: 0 }}>{it.name}</h1>
              {recall && recall.affected ?
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', fontSize: 11, fontWeight: 700, background: T.slateSoft, color: T.slate, borderRadius: 6 }}><Icon name="megaphone" size={12} /> Safety notice</span> :
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', fontSize: 11, fontWeight: 700, background: T.tealWash, color: T.teal, borderRadius: 6 }}><Icon name="shield-check" size={12} /> No recalls</span>}
            </div>
            <div style={{ fontSize: 13.5, color: T.sub, margin: '4px 0 16px' }}>{it.brand} · {it.model}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              <Field T={T} label="Room" value={it.room} />
              <Field T={T} label="Serial" value={it.serial || '—'} mono />
              <Field T={T} label="Purchased" value={it.purchased} />
              <Field T={T} label="Warranty" value={it.warranty ? it.warranty.ends : 'None'} />
              <Field T={T} label="Category" value={it.category} />
              {ex.tags.slice(0, 1).map((tg) => <Field T={T} key={tg} label="Notable" value={tg} />)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Btn T={T} kind="ghost" icon="pencil" size="sm" onClick={onEdit}>Edit</Btn>
            <Btn T={T} kind="ghost" icon="sparkles" size="sm" onClick={onFix}>Ask</Btn>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(260px,1fr)', gap: 22, alignItems: 'start' }}>
        {/* main: tabs */}
        <div>
          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.line}`, marginBottom: 18 }}>
            {tabs.map((tb) => {
              const on = tab === tb.id;
              return (
                <button key={tb.id} onClick={() => setTab(tb.id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px', border: 'none', background: 'transparent', borderBottom: `2px solid ${on ? T.teal : 'transparent'}`, color: on ? T.ink : T.sub, fontSize: 14, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1 }}>
                  {tb.label}<span style={{ fontSize: 11, fontFamily: DT_MONO, color: T.faint }}>{tb.n}</span>
                </button>);

            })}
          </div>

          {tab === 'tasks' &&
          <Card T={T} d={d} pad={0}>
              <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: tasks.length ? `1px solid ${T.line}` : 'none' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Upkeep for this item</div>
                  <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>Open a task for step-by-step instructions, pulled from your manual.</div>
                </div>
                <Btn T={T} kind="soft" size="sm" icon="plus">Add task</Btn>
              </div>
              {tasks.length ? tasks.map((t) => <ExpandableTaskRow key={t.id} T={T} d={d} task={t} onOpen={() => onOpenTask && onOpenTask(t.id)} />) :
            <div style={{ padding: '28px 16px', textAlign: 'center', color: T.sub, fontSize: 13.5 }}>No tasks yet. Add a manual to unlock recommended upkeep.</div>}
            </Card>
          }

          {tab === 'guides' &&
          <DesktopItemGuides T={T} d={d} it={it} ex={ex} id={id} onFix={onFix} onOpenClean={onOpenClean} />
          }

          {tab === 'fix' &&
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ex.trouble.length ? ex.trouble.map((tr, i) => <Troubleshoot key={i} T={T} d={d} tr={tr} onFix={onFix} />) :
            <Card T={T} d={d} style={{ textAlign: 'center', color: T.sub, fontSize: 13.5, padding: 28 }}>No troubleshooting yet for this item.</Card>}
              <button onClick={onFix} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: T.teal, fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}>
                <Icon name="sparkles" size={15} /> Still stuck? Ask Homehub
              </button>
            </div>
          }

          {tab === 'saved' &&
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Card T={T} d={d} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="plus" size={16} style={{ color: T.teal }} />
                <span style={{ fontSize: 13.5, color: T.sub, flex: 1 }}>Add a note locked to {it.name}…</span>
                <Btn T={T} kind="soft" size="sm">Add note</Btn>
              </Card>
              {saved.length ? saved.map((s) => <SavedAnswerCard key={s.id} T={T} d={d} s={s} />) :
            <Card T={T} d={d} style={{ textAlign: 'center', color: T.sub, fontSize: 13.5, padding: 28 }}>Answers you save from Ask will collect here.</Card>}
            </div>
          }

          {tab === 'activity' &&
          <Card T={T} d={d} pad={0}>
              {ex.history.map((h, i) =>
            <div key={i} style={{ display: 'flex', gap: 13, alignItems: 'center', padding: '13px 16px', borderTop: i ? `1px solid ${T.line}` : 'none' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: T.surface2, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon name={ACT_ICON[h.kind] || 'circle'} size={15} style={{ color: T.teal }} />
                  </div>
                  <div style={{ flex: 1, fontSize: 13.5, color: T.ink }}>{h.text}</div>
                  <span style={{ fontSize: 12, color: T.faint, fontFamily: DT_MONO }}>{h.date}</span>
                </div>
            )}
            </Card>
          }
        </div>

        {/* side rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {it.warranty ?
          <Card T={T} d={d}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Warranty</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: it.warranty.active ? T.teal : T.faint, background: it.warranty.active ? T.tealWash : T.surface2, padding: '3px 8px', borderRadius: 6 }}>{it.warranty.active ? 'Active' : 'Lapsed'}</span>
              </div>
              <div style={{ height: 6, background: T.line, borderRadius: 3, overflow: 'hidden', marginBottom: 7 }}>
                <div style={{ width: it.warranty.active ? it.warranty.soon ? '18%' : '64%' : '100%', height: '100%', background: it.warranty.soon ? T.gold : it.warranty.active ? T.teal : T.line2 }} />
              </div>
              <div style={{ fontSize: 12.5, color: it.warranty.soon ? T.gold : T.sub }}>Coverage ends {it.warranty.ends}</div>
            </Card> :

          <WarrantyEmptyRail T={T} d={d} onAdd={onEdit} />
          }

          <Card T={T} d={d} pad={0}>
            <div style={{ padding: '13px 15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Manuals</span>
              <button onClick={() => setManage(true)} style={{ border: 'none', background: 'none', color: T.teal, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Manage</button>
            </div>
            {ex.manuals.length ? ex.manuals.map((m, i) =>
            <div key={i} onClick={() => setViewer(m)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 15px', borderTop: `1px solid ${T.line}`, cursor: 'pointer' }}>
                <Icon name="file-text" size={16} style={{ color: T.sub, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                  <div style={{ fontSize: 11.5, color: T.faint }}>{m.pages} pages · {m.label}</div>
                </div>
                {m.role === 'primary' && <span style={{ fontSize: 9.5, fontWeight: 700, color: T.teal, background: T.tealWash, padding: '2px 6px', borderRadius: 4 }}>PRIMARY</span>}
                <Icon name="chevron-right" size={15} style={{ color: T.faint, flexShrink: 0 }} />
              </div>
            ) : <button onClick={() => setManage(true)} style={{ width: '100%', textAlign: 'left', padding: '14px 15px', borderTop: `1px solid ${T.line}`, fontSize: 12.5, color: T.sub, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="plus" size={15} style={{ color: T.teal }} /> Add a manual to unlock tasks & fixes.</button>}
          </Card>

          <Card T={T} d={d}>
            <SectionLabel T={T} style={{ marginBottom: 10 }}>Specs</SectionLabel>
            {ex.specs.map((s, i) =>
            <div key={s.k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: i ? `1px solid ${T.line}` : 'none', fontSize: 13 }}>
                <span style={{ color: T.sub }}>{s.k}</span>
                <span style={{ color: T.ink, fontWeight: 600, fontFamily: DT_MONO }}>{s.v}</span>
              </div>
            )}
          </Card>

          {ex.tags && ex.tags.length > 0 &&
          <Card T={T} d={d}>
              <SectionLabel T={T} style={{ marginBottom: 10 }}>Tags</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {ex.tags.map((tg) =>
              <span key={tg} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${T.line2}`, borderRadius: 99, padding: '5px 11px', fontSize: 12.5, fontWeight: 600, color: T.sub }}><Icon name="tag" size={11} style={{ color: T.teal }} /> {tg}</span>
              )}
              </div>
            </Card>
          }
        </div>
      </div>
      {viewer && <DesktopManualViewer T={T} d={d} manual={viewer} item={it} onClose={() => setViewer(null)} onAsk={() => { setViewer(null); onFix && onFix(id); }} />}
      {manage && <DesktopManualsManager T={T} d={d} item={it} onClose={() => setManage(false)} onOpenManual={(m) => { setManage(false); setViewer(m); }} />}
    </div>);

}

const ACT_ICON = { complete: 'check', tier: 'flag', add: 'plus', manual: 'file-text', warranty: 'shield-check', recall: 'megaphone' };

function Troubleshoot({ T, d, tr, onFix }) {
  const [open, setOpen] = useScB(false);
  return (
    <Card T={T} d={d} pad={0}>
      <div onClick={() => setOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: T.claySoft, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="wrench" size={16} style={{ color: T.clay }} /></div>
        <div style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: T.ink }}>{tr.symptom}</div>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} style={{ color: T.faint }} />
      </div>
      {open &&
      <div style={{ borderTop: `1px solid ${T.line}`, padding: 16, background: T.surface2, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Likely cause</div><div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.5 }}>{tr.cause}</div></div>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: T.sub, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Fix</div><div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.5 }}>{tr.fix}</div></div>
          {tr.page && <div style={{ fontSize: 12.5, color: T.teal, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="book-open" size={13} /> Manual · p.{tr.page}</div>}
        </div>
      }
    </Card>);

}

// ── Expandable task row — instructions + manual snippet inline ───────────────
function ExpandableTaskRow({ T, d, task, onOpen }) {
  const [open, setOpen] = useScB(false);
  const det = dtDetail(task);
  const hasHow = det.steps && det.steps.length > 0;
  return (
    <div style={{ borderTop: `1px solid ${T.line}` }}>
      <div onClick={() => setOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 16px', cursor: 'pointer', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, background: dtTier(T, task.tier).fg }} />
        <button onClick={(e) => e.stopPropagation()} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex' }}><CheckBox T={T} done={false} size={20} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, letterSpacing: -0.2 }}>{task.name}</div>
          <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>{dueLabel(task.due)} · {task.mins} min</div>
        </div>
        <TierChip T={T} tier={task.tier} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: T.teal }}>{open ? 'Hide' : 'See how'}<Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} /></span>
      </div>
      {open &&
      <div style={{ padding: '6px 16px 18px', display: 'flex', flexDirection: 'column', gap: 14, background: T.surface2 }}>
          <WhyNote T={T} text={det.why} />
          {hasHow ?
        <div style={{ display: 'grid', gridTemplateColumns: det.manual ? '1.3fr 1fr' : '1fr', gap: 22, alignItems: 'start' }}>
              <StepsList T={T} steps={det.steps} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SuppliesRow T={T} supplies={det.supplies} />
                <ManualSnippet T={T} manual={det.manual} />
              </div>
            </div> :
        <div style={{ fontSize: 13.5, color: T.sub }}>Add this item's manual to unlock step-by-step instructions.</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn T={T} icon="check" size="sm">Mark done</Btn>
            <Btn T={T} kind="ghost" size="sm" onClick={onOpen}>Open full view</Btn>
            <Btn T={T} kind="subtle" size="sm" icon="alarm-clock">Snooze</Btn>
          </div>
        </div>
      }
    </div>);

}

// ── Guides tab — how-to (with manual snippets), knowledge, cleaning guides ────
function HowToGuideCard({ T, d, guide, manual }) {
  const [open, setOpen] = useScB(false);
  return (
    <Card T={T} d={d} pad={0}>
      <div onClick={() => setOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', cursor: 'pointer' }}>
        <Glyph T={T} icon="list-checks" size={36} radius={10} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, letterSpacing: -0.2 }}>{guide.title}</div>
          <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{guide.steps.length} steps · {guide.mins} min</div>
        </div>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} style={{ color: T.faint }} />
      </div>
      {open &&
      <div style={{ borderTop: `1px solid ${T.line}`, padding: 16, background: T.surface2, display: 'flex', flexDirection: 'column', gap: 13 }}>
          <StepsList T={T} steps={guide.steps} columns={2} />
          {manual &&
        <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: T.teal, background: T.tealWash, padding: '5px 10px', borderRadius: 7 }}>
              <Icon name="book-open" size={13} /> From {manual.label || 'your manual'}
            </div>
        }
        </div>
      }
    </Card>);

}

function DesktopItemGuides({ T, d, it, ex, id, onFix, onOpenClean }) {
  const snips = itemTasks(id).map((t) => dtDetail(t)).filter((x) => x && x.manual).map((x) => x.manual);
  const primaryManual = (ex.manuals || []).find((m) => m.role === 'primary') || (ex.manuals || [])[0];
  const cleaning = typeof HH_GUIDES !== 'undefined' ? HH_GUIDES : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* how-to guides */}
      <div>
        <SectionLabel T={T} right={primaryManual ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.sub }}><Icon name="file-text" size={12} /> {primaryManual.label}</span> : null}>How-to guides</SectionLabel>
        {ex.howto && ex.howto.length ?
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ex.howto.map((g) => <HowToGuideCard key={g.title} T={T} d={d} guide={g} manual={primaryManual} />)}
          </div> :
        <Card T={T} d={d} style={{ textAlign: 'center', color: T.sub, fontSize: 13.5, padding: 24 }}>Add the manual to unlock step-by-step how-to guides.</Card>}
      </div>

      {/* manual snippets */}
      {snips.length > 0 &&
      <div>
          <SectionLabel T={T}>Straight from the manual</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {snips.slice(0, 2).map((m, i) => <ManualSnippet key={i} T={T} manual={m} />)}
          </div>
        </div>
      }

      {/* care knowledge */}
      {ex.care && ex.care.length > 0 &&
      <div>
          <SectionLabel T={T}>Care &amp; knowledge</SectionLabel>
          <Card T={T} d={d}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {ex.care.map((c, i) =>
            <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13.5, color: T.ink, lineHeight: 1.45 }}>
                  <Icon name="check" size={16} strokeWidth={2.4} style={{ color: T.teal, flexShrink: 0, marginTop: 2 }} />{c}
                </div>
            )}
            </div>
          </Card>
        </div>
      }

      {/* cleaning guides */}
      {cleaning.length > 0 &&
      <div>
          <SectionLabel T={T} right={<button onClick={onOpenClean} style={{ border: 'none', background: 'none', color: T.teal, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>All guides</button>}>Cleaning guides</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
            {cleaning.map((g) =>
            <Card T={T} d={d} key={g.name} pad={15} onClick={onOpenClean} style={{ cursor: 'pointer' }}>
                <Glyph T={T} icon={g.icon} size={38} radius={11} />
                <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, marginTop: 11, letterSpacing: -0.2 }}>{g.name}</div>
                <div style={{ fontSize: 12, color: T.sub, marginTop: 3 }}>{g.mins} min guide</div>
              </Card>
            )}
          </div>
        </div>
      }

      <button onClick={() => onFix && onFix(id)} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: T.teal, fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}>
        <Icon name="sparkles" size={15} /> Ask Homehub about {it.name}
      </button>
    </div>);

}

// ── Item edit — full desktop form ────────────────────────────────────────────
function DTToggle({ T, on, onToggle }) {
  return (
    <button onClick={onToggle} style={{ width: 46, height: 27, borderRadius: 14, border: 'none', cursor: 'pointer', background: on ? T.teal : T.line2, position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 22 : 3, width: 21, height: 21, borderRadius: 11, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left .15s' }} />
    </button>);

}
function EditField({ T, label, value, placeholder, mono, full }) {
  return (
    <label style={{ display: 'block', gridColumn: full ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: T.sub, display: 'block', marginBottom: 6 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 13px', borderRadius: 10, border: `1px solid ${T.line2}`, background: T.surface }}>
        <span style={{ flex: 1, fontSize: 14, color: value ? T.ink : T.faint, fontFamily: mono ? DT_MONO : 'inherit', fontWeight: value ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value || placeholder}</span>
        <Icon name="pencil" size={13} style={{ color: T.faint, flexShrink: 0 }} />
      </div>
    </label>);

}
function DesktopItemEdit({ T, d, id, onBack, onSave }) {
  const it = hhItem(id);
  const ex = itemExtras(id);
  const w = it.warranty || {};
  const [room, setRoom] = useScB(it.room);
  const [track, setTrack] = useScB(!!(w && w.active));
  const rooms = [...new Set([...HH_ITEMS.map((i) => i.room), 'Living Room', 'Garage', 'Outdoor'])];
  const EditGroup = ({ title, children, cols = 2, pad = 18 }) => (
    <div style={{ marginBottom: 20 }}>
      <SectionLabel T={T}>{title}</SectionLabel>
      <Card T={T} d={d} pad={pad}>
        {cols ? <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 14 }}>{children}</div> : children}
      </Card>
    </div>);

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, gap: 16 }}>
        <Btn T={T} kind="ghost" size="sm" onClick={onBack}>Cancel</Btn>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: T.ink, letterSpacing: -0.4, margin: 0 }}>Edit item</h1>
        <Btn T={T} size="sm" icon="check" onClick={onSave}>Save changes</Btn>
      </div>

      <Card T={T} d={d} pad={20} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 84, height: 84, borderRadius: 16, flexShrink: 0, background: T.dark ? T.raise : 'linear-gradient(135deg,#EEF3F1,#E0EAE5)', display: 'grid', placeItems: 'center', color: T.teal }}>
            <Icon name={it.icon} size={40} strokeWidth={1.5} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{it.name}</div>
            <div style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>{it.brand} · {it.model}</div>
          </div>
          <Btn T={T} kind="ghost" size="sm" icon="camera">Change photo</Btn>
        </div>
      </Card>

      <EditGroup title="Details">
        <EditField T={T} label="Name" value={it.name} />
        <EditField T={T} label="Brand" value={it.brand} />
        <EditField T={T} label="Model" value={it.model} mono />
        <EditField T={T} label="Serial number" value={it.serial} mono />
      </EditGroup>

      <div style={{ marginBottom: 20 }}>
        <SectionLabel T={T}>Location</SectionLabel>
        <Card T={T} d={d} pad={18}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.sub, marginBottom: 9 }}>Room</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {rooms.map((r) => <Pill T={T} key={r} size="sm" active={room === r} onClick={() => setRoom(r)}>{r}</Pill>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
            <EditField T={T} label="Category" value={it.category} />
          </div>
        </Card>
      </div>

      <EditGroup title="Purchase">
        <EditField T={T} label="Where you bought it" placeholder="Add a retailer" />
        <EditField T={T} label="Purchase date" value={it.purchased} />
        <EditField T={T} label="Price paid" placeholder="Add a price" />
      </EditGroup>

      <div style={{ marginBottom: 20 }}>
        <SectionLabel T={T}>Warranty</SectionLabel>
        <Card T={T} d={d} pad={0}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 18px', borderBottom: track ? `1px solid ${T.line}` : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>Track warranty</div>
              <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>Remind me before coverage ends</div>
            </div>
            <DTToggle T={T} on={track} onToggle={() => setTrack((v) => !v)} />
          </div>
          {track && <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}><EditField T={T} label="Warranty ends" value={w.ends || 'Add a date'} /></div>}
        </Card>
      </div>

      <div style={{ marginBottom: 20 }}>
        <SectionLabel T={T}>Tags</SectionLabel>
        <Card T={T} d={d} pad={18}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(ex.tags || []).map((tg) =>
            <span key={tg} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${T.line2}`, borderRadius: 99, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: T.ink }}>{tg}<Icon name="x" size={13} style={{ color: T.faint, cursor: 'pointer' }} /></span>
            )}
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px dashed ${T.line2}`, background: 'transparent', borderRadius: 99, padding: '6px 12px', fontSize: 13, fontWeight: 600, color: T.teal, cursor: 'pointer' }}><Icon name="plus" size={13} /> Add tag</button>
          </div>
        </Card>
      </div>

      <button style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: `1px solid ${T.clay}`, background: 'transparent', color: T.clay, borderRadius: 12, padding: '13px 0', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', marginBottom: 8 }}>
        <Icon name="trash-2" size={16} /> Delete item
      </button>
    </div>);

}

const SAVED_SRC = { manual: { icon: 'book-open', label: 'From manual' }, ask: { icon: 'sparkles', label: 'Saved from Ask' }, note: { icon: 'pencil', label: 'Your note' } };
function SavedAnswerCard({ T, d, s }) {
  const src = SAVED_SRC[s.source] || SAVED_SRC.ask;
  return (
    <Card T={T} d={d}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{s.q}</div>
      <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.5 }}>{s.a}</div>
      <div style={{ marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: T.teal, background: T.tealWash, padding: '4px 9px', borderRadius: 6 }}>
        <Icon name={src.icon} size={12} /> {src.label}
      </div>
    </Card>);

}

// ── Ask ──────────────────────────────────────────────────────────────────────
const ASK_CONVOS = [
{ id: 'c1', title: 'Descale Bosch dishwasher', scope: 'Bosch Dishwasher', icon: 'utensils', time: 'Just now' },
{ id: 'c2', title: 'HVAC filter size', scope: 'Furnace & A/C', icon: 'wind', time: 'Yesterday' },
{ id: 'c3', title: 'Fridge water tastes off', scope: 'LG Refrigerator', icon: 'refrigerator', time: '3 days ago' }];

function DesktopAsk({ T, d, onSave }) {
  return (
    <div>
      <h1 style={{ fontSize: 27, fontWeight: 800, color: T.ink, letterSpacing: -0.6, margin: '0 0 18px' }}>Ask Homehub</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        {/* conversations rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Btn T={T} icon="plus" style={{ width: '100%' }}>New question</Btn>
          <Card T={T} d={d} pad={0}>
            {ASK_CONVOS.map((c, i) =>
            <button key={c.id} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderTop: i ? `1px solid ${T.line}` : 'none', background: i === 0 ? T.tealWash2 : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <Glyph T={T} icon={c.icon} size={32} radius={8} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
                  <div style={{ fontSize: 11.5, color: T.faint }}>{c.time}</div>
                </div>
              </button>
            )}
          </Card>
        </div>

        {/* conversation */}
        <Card T={T} d={d} pad={0} style={{ display: 'flex', flexDirection: 'column', height: 640 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${T.line}` }}>
            <span style={{ fontSize: 12.5, color: T.sub, fontWeight: 600 }}>Topic</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: T.teal, background: T.tealWash, padding: '5px 11px', borderRadius: 99 }}><Icon name="refrigerator" size={13} /> Bosch Dishwasher</span>
            <Icon name="chevron-down" size={14} style={{ color: T.faint }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Bubble T={T} me>How often should I descale my Bosch dishwasher?</Bubble>
            <Answer T={T} onSave={onSave} body={<span>For your <strong>Bosch SHEM63W55N</strong>, the manual recommends descaling every 3 months with hard water, or every 6 months with soft water. Since you have a water softener installed, every 6 months is fine.</span>}
            cites={[{ icon: 'book-open', t: 'Bosch manual · p.38' }, { icon: 'package', t: 'Whirlpool softener' }]} />
            <Bubble T={T} me>Set a reminder every 6 months starting today</Bubble>
            <Answer T={T} body={<span>Done. I added <strong>“Descale dishwasher”</strong> as a Recommended task, repeating every 6 months. First due in October.</span>}
            created />
          </div>
          <div style={{ padding: '14px 18px', borderTop: `1px solid ${T.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: T.fieldBg, border: `1.5px solid ${T.teal}`, borderRadius: 14, padding: '11px 12px 11px 16px' }}>
              <Icon name="sparkles" size={17} style={{ color: T.teal }} />
              <span style={{ flex: 1, fontSize: 14, color: T.faint }}>Ask anything about your home…</span>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: T.teal, display: 'grid', placeItems: 'center' }}><Icon name="arrow-up" size={17} strokeWidth={2.6} style={{ color: '#fff' }} /></div>
            </div>
          </div>
        </Card>
      </div>
    </div>);

}

function Bubble({ T, me, children }) {
  return (
    <div style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '74%', padding: '11px 15px', borderRadius: 16, fontSize: 14, lineHeight: 1.5, background: me ? T.teal : T.surface2, color: me ? '#fff' : T.ink, borderBottomRightRadius: me ? 5 : 16, borderBottomLeftRadius: me ? 16 : 5, border: me ? 'none' : `1px solid ${T.line}` }}>{children}</div>);

}
function Answer({ T, body, cites, created, onSave }) {
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '82%' }}>
      <div style={{ padding: '13px 15px', background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 16, borderBottomLeftRadius: 5, fontSize: 14, lineHeight: 1.55, color: T.ink }}>
        {body}
        {cites &&
        <div style={{ marginTop: 11, paddingTop: 11, borderTop: `1px solid ${T.line}`, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {cites.map((c, i) =>
          <span key={i} style={{ fontSize: 11.5, color: T.sub, padding: '4px 9px', background: T.surface, border: `1px solid ${T.line}`, borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name={c.icon} size={11} /> {c.t}</span>
          )}
          </div>
        }
        {created && <div style={{ marginTop: 9 }}><span style={{ fontSize: 11.5, padding: '4px 9px', background: T.tealWash, color: T.teal, borderRadius: 6, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="check" size={11} strokeWidth={3} /> Task created</span></div>}
      </div>
      {cites && <button onClick={onSave} style={{ marginTop: 8, border: 'none', background: 'transparent', color: T.teal, fontWeight: 700, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><Icon name="bookmark" size={13} /> Save to Bosch Dishwasher</button>}
    </div>);

}

// ── Settings ─────────────────────────────────────────────────────────────────
function DesktopSettings({ T, d, level = 'simple', onLevel, appearance = 'light', onAppearance, nav = 'top', onNav }) {
  const rooms = [...new Set(HH_ITEMS.map((i) => i.room))];
  const [invite, setInvite] = useScB(false);
  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 27, fontWeight: 800, color: T.ink, letterSpacing: -0.6, margin: '0 0 4px' }}>Settings</h1>
      <div style={{ fontSize: 13.5, color: T.sub, marginBottom: 24 }}>Manage your home, members, and how much of Homehub shows up.</div>

      {/* level — the control that drives the unfold */}
      <SectionLabel T={T}>Homehub level</SectionLabel>
      <Card T={T} d={d} style={{ marginBottom: 24 }}>
        <Segmented T={T} value={level} onChange={onLevel} options={[{ value: 'simple', label: 'Simple' }, { value: 'standard', label: 'Standard' }, { value: 'advanced', label: 'Advanced' }]} />
        <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.5, marginTop: 12 }}>{LEVEL_DESC[level]}</div>
      </Card>

      <SectionLabel T={T}>Appearance</SectionLabel>
      <Card T={T} d={d} style={{ marginBottom: 24 }}>
        <Segmented T={T} value={appearance} onChange={onAppearance} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </Card>

      <SectionLabel T={T}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>Advanced
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, color: T.slate, background: T.slateSoft, padding: '2px 7px', borderRadius: 5 }}>LABS</span>
        </span>
      </SectionLabel>
      <Card T={T} d={d} style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Navigation layout</div>
            <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2, lineHeight: 1.45 }}>The top bar is recommended. Prefer a roomier workspace? Switch to a left sidebar.</div>
          </div>
        </div>
        <Segmented T={T} value={nav} onChange={onNav} options={[{ value: 'top', label: 'Top bar' }, { value: 'sidebar', label: 'Left sidebar' }]} />
      </Card>

      <SetGroup T={T} d={d} title="Profile">
        <SetRow T={T} label="Display name" value="Barb Haynes" />
        <SetRow T={T} label="Email" value="barb@haynes.family" muted last />
      </SetGroup>

      <SetGroup T={T} d={d} title="Home profile">
        <SetRow T={T} label="Home type" value="Single-family" />
        <SetRow T={T} label="Year built" value="1998" />
        <SetRow T={T} label="Ownership" value="Own" />
        <SetRow T={T} label="Top concerns" value="Surprise repairs · Seasonal upkeep" last />
      </SetGroup>

      <SetGroup T={T} d={d} title="Rooms">
        {rooms.map((r, i) => <SetRow T={T} key={r} label={r} value={`${HH_ITEMS.filter((it) => it.room === r).length} items`} muted edit last={i === rooms.length - 1} />)}
      </SetGroup>

      <div style={{ marginBottom: 22 }}>
        <SectionLabel T={T} right={<button onClick={() => setInvite(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', color: T.teal, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}><Icon name="user-plus" size={13} /> Invite</button>}>Home members</SectionLabel>
        <Card T={T} d={d} pad={0}>
          {[['Barb Haynes', 'barb@haynes.family', 'Owner'], ['Dave Haynes', 'dave@haynes.family', 'Member'], ['Maya Haynes', 'maya@haynes.family', 'Member']].map(([n, e, role], i, a) =>
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderTop: i ? `1px solid ${T.line}` : 'none' }}>
              <Avatar T={T} initials={n.split(' ').map((x) => x[0]).join('')} size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{n}</div>
                <div style={{ fontSize: 12, color: T.faint }}>{e}</div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: role === 'Owner' ? T.teal : T.surface2, color: role === 'Owner' ? '#fff' : T.sub }}>{role}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 16px', borderTop: `1px solid ${T.line}` }}>
            <Avatar T={T} initials="S" size={32} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.sub }}>sam@haynes.family</div>
              <div style={{ fontSize: 12, color: T.faint }}>Member · invite sent</div>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: T.goldSoft, color: T.gold }}>PENDING</span>
          </div>
        </Card>
      </div>
      {invite && <DesktopInviteModal T={T} d={d} onClose={() => setInvite(false)} />}
    </div>);

}

function Segmented({ T, options, value, onChange }) {
  return (
    <div style={{ display: 'flex', background: T.surface2, borderRadius: 11, padding: 3, gap: 2, border: `1px solid ${T.line}` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange && onChange(o.value)} style={{ flex: 1, border: 'none', borderRadius: 9, padding: '9px 4px', background: on ? T.surface : 'transparent', color: on ? T.ink : T.sub, fontSize: 13.5, fontWeight: on ? 700 : 500, boxShadow: on ? T.shadowSm : 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{o.label}</button>);

      })}
    </div>);

}
function SetGroup({ T, d, title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <SectionLabel T={T}>{title}</SectionLabel>
      <Card T={T} d={d} pad={0}>{children}</Card>
    </div>);

}
function SetRow({ T, label, value, muted, edit, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: last ? 'none' : `1px solid ${T.line}` }}>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: T.ink }}>{label}</div>
      <div style={{ fontSize: 13.5, color: muted ? T.sub : T.ink }}>{value}</div>
      {edit && <button style={{ border: 'none', background: 'none', color: T.teal, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Edit</button>}
    </div>);

}

Object.assign(window, { DesktopItemDetail, DesktopItemGuides, DesktopItemEdit, ExpandableTaskRow, HowToGuideCard, Troubleshoot, SavedAnswerCard, DesktopAsk, DesktopSettings, Segmented, Bubble, Answer, EditField, DTToggle });