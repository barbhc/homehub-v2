// ── Homehub · Items tab + Item detail ───────────────────────────────────────
// Items = the home's appliances & fixtures. Simple state: a calm, scannable
// list (organizable by room / category / flat), tapping into a full detail
// screen with tasks, specs, warranty, manuals, care notes and history.

const { useState: useItS } = React;

const IT_INK = '#0B1220', IT_SUB = '#6B7280', IT_TEAL = '#1B6B5A', IT_BG = '#F3F5F4';

const HH_ITEM_EXTRAS = {
  hvac:   { manuals: [{ name: 'Carrier 59TP6 — Owner’s Manual', pages: 48, role: 'primary', label: 'Owner’s manual', status: 'parsed' }], tags: ['Gas', '16×25×1 filter'], specs: [{ k: 'Stages', v: '2-stage' }, { k: 'AFUE', v: '96%' }, { k: 'Filter', v: '16×25×1' }], care: ['Replace the filter every 90 days', 'Keep 2 ft of clearance around the unit', 'Book a pro tune-up each fall'], howto: [{ title: 'Replace the filter', mins: 2, steps: ['Switch the thermostat off', 'Slide the old filter out by the return vent', 'Insert the new filter, arrow toward the furnace', 'Switch the thermostat on'] }], trouble: [{ symptom: 'No warm air', cause: 'Usually a tripped breaker, dead thermostat batteries, or a filter so clogged it chokes airflow.', fix: 'Check the thermostat batteries and the breaker, then the filter for clogs.', page: 14 }], notes: '', history: [{ date: 'May 12', text: 'Filter replaced', kind: 'complete' }, { date: 'Oct 4, 2024', text: 'Set to Essential', kind: 'tier' }, { date: 'Mar 3, 2021', text: 'Added to Homehub', kind: 'add' }] },
  fridge: { manuals: [{ name: 'LG LRFVS3006S — Owner’s Manual', pages: 64, role: 'primary', label: 'Owner’s manual', status: 'parsed' }, { name: 'Quick Start Guide', pages: 8, role: 'reference', label: 'Quick start', status: 'parsed' }], tags: ['Counter-depth', 'InstaView', 'Energy Star'], specs: [{ k: 'Capacity', v: '30 cu ft' }, { k: 'Width', v: '35.75 in' }, { k: 'Energy use', v: '643 kWh/yr' }, { k: 'Water filter', v: 'LT1000P' }], care: ['Clean condenser coils twice a year', 'Replace the water filter every 6 months', 'Wipe the door gaskets monthly'], howto: [{ title: 'Replace the water filter', mins: 5, steps: ['Find the filter in the upper-right interior', 'Turn it counter-clockwise and pull it out', 'Insert a new LT1000P and turn clockwise', 'Run 2.5 gallons through the dispenser to clear it'] }, { title: 'Reset the ice maker', mins: 2, steps: ['Press and hold the test button for 3 seconds', 'Wait for the chime', 'Production resumes within 24 hours'] }], trouble: [{ symptom: 'Water dispenses slowly', cause: 'A saturated filter or a kinked supply line restricts the flow.', fix: 'Replace the water filter or check the supply line for kinks.', page: 22 }, { symptom: 'Ice tastes off', cause: 'A fresh filter sheds carbon at first, and an old bin holds onto odours.', fix: 'Discard the first batch after a filter change and wash the bin.' }, { symptom: 'Fridge runs warm', cause: 'Dusty condenser coils or a weak door seal make it work harder.', fix: 'Clean the condenser coils and check the door seal.', page: 31 }], notes: 'Bought during the spring sale — sits on the left side of the kitchen.', history: [{ date: 'Jun 2', text: 'Cleaned condenser coils', kind: 'complete' }, { date: 'Jul 9, 2025', text: 'Owner’s manual added', kind: 'manual' }, { date: 'Jul 9, 2025', text: 'Warranty registered', kind: 'warranty' }, { date: 'Jul 9, 2025', text: 'Added to Homehub', kind: 'add' }] },
  dish:   { manuals: [{ name: 'Bosch SHEM63W55N — Manual', pages: 56, role: 'primary', label: 'Owner’s manual', status: 'parsed' }], tags: ['Third rack', '44 dBA'], specs: [{ k: 'Place settings', v: '16' }, { k: 'Noise', v: '44 dBA' }], care: ['Run a clean cycle monthly', 'Clear the bottom filter weekly', 'Check spray arms for clogs'], howto: [{ title: 'Clean the filter', mins: 5, steps: ['Remove the bottom rack', 'Twist out the cylindrical filter', 'Rinse under warm water', 'Twist it back until it locks'] }], trouble: [{ symptom: 'Won’t drain', cause: 'A clogged filter or a kinked drain hose is the usual culprit.', fix: 'Clean the filter and check the drain hose for kinks before calling service.', page: 31 }], recall: { brand: 'Bosch', model: '300-series', body: 'Bosch issued a recall on some 300-series dishwashers over a control board that can overheat. It takes a minute to check whether your unit is included.', range: 'FD9701–FD9806', affected: true, remedy: 'Bosch will repair affected units free of charge — no proof of purchase needed. Book through an authorised servicer.' }, notes: '', history: [{ date: 'Jun 1', text: 'Recall notice received', kind: 'recall' }, { date: 'May 20, 2024', text: 'Added to Homehub', kind: 'add' }] },
  washer: { manuals: [], tags: ['Front-load', 'Steam'], specs: [{ k: 'Capacity', v: '4.5 cu ft' }], care: ['Clean the door gasket monthly', 'Run a tub-clean cycle monthly', 'Leave the door ajar to air-dry'], howto: [], trouble: [], notes: '', history: [{ date: 'Aug 14, 2023', text: 'Added to Homehub', kind: 'add' }] },
  water:  { manuals: [{ name: 'Rheem XE40 — Use & Care', pages: 40, role: 'primary', label: 'Owner’s manual', status: 'parsed' }], tags: ['40 gal', 'Electric'], specs: [{ k: 'Capacity', v: '40 gal' }, { k: 'First-hour', v: '52 gal' }], care: ['Flush the tank once a year', 'Test the T&P valve yearly', 'Check the anode rod every 3 years'], howto: [{ title: 'Flush the tank', mins: 30, steps: ['Turn off power and the cold supply', 'Attach a hose to the drain valve', 'Open the valve and a hot tap to drain', 'Refill before restoring power'] }], trouble: [{ symptom: 'Not enough hot water', cause: 'High demand, or sediment on the lower element cutting output.', fix: 'Lower demand or check the lower heating element; flush sediment.', page: 18 }], notes: '', history: [{ date: 'Nov 2, 2020', text: 'Added to Homehub', kind: 'add' }] },
};
function itemExtras(id) { return HH_ITEM_EXTRAS[id] || { manuals: [], tags: [], specs: [], care: [], howto: [], trouble: [], notes: '', history: [] }; }
function itemTasks(id) { return HH_TASKS.filter((t) => t.item === id).sort((a, b) => a.due - b.due); }
// What's still missing — drives the "complete this item" nudges (manual unlocks
// tasks, receipt/warranty unlocks tracking).
function itemGaps(id) {
  const it = hhItem(id);
  const ex = itemExtras(id);
  return { needsManual: ex.manuals.length === 0, needsReceipt: !(it.warranty && it.warranty.active) };
}

// ── Photo placeholder (item thumbnail) ───────────────────────────────────────
function ItemThumb({ icon, size = 46, radius = 12 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: 'linear-gradient(135deg,#EEF3F1,#E3ECE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: IT_TEAL }}>
      <Icon name={icon} size={size * 0.5} strokeWidth={1.8} />
    </div>
  );
}

// ── Items tab ────────────────────────────────────────────────────────────────
function ItemsTab({ d, org = 'room', tabs = TABS_FULL, current = 'items', onTab, onOpenItem, onAdd }) {
  const [sort, setSort] = useItS(org);
  // Build groups per sort mode.
  let groups;
  if (sort === 'flat') {
    groups = [{ key: null, items: [...HH_ITEMS].slice().reverse() }];
  } else {
    const keyOf = (it) => (sort === 'category' ? it.category : it.room);
    const map = {};
    HH_ITEMS.forEach((it) => { (map[keyOf(it)] = map[keyOf(it)] || []).push(it); });
    groups = Object.entries(map).map(([key, items]) => ({ key, items }));
  }

  const Row = ({ it, last }) => {
    const due = itemTasks(it.id).find((t) => t.due <= 1);
    return (
      <div onClick={() => onOpenItem && onOpenItem(it.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: last ? 'none' : '0.5px solid rgba(15,23,42,0.07)', cursor: 'pointer' }}>
        <ItemThumb icon={it.icon} size={d.tap + 20} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: d.body, fontWeight: 600, color: IT_INK, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
          <div style={{ fontSize: d.small, color: IT_SUB, marginTop: 2 }}>{it.brand} · {sort === 'room' ? it.category : it.room}</div>
        </div>
        {due && <span title="Task due" style={{ width: 8, height: 8, borderRadius: 4, background: TIER.essential.dot, flexShrink: 0 }} />}
        <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4' }} />
      </div>
    );
  };

  return (
    <Screen bg={IT_BG}>
      <div style={{ padding: `10px ${d.pad}px 0`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: d.big, fontWeight: 800, color: IT_INK, letterSpacing: -0.7, margin: 0 }}>Items</h1>
        <div onClick={onAdd} style={{ width: d.tap + 6, height: d.tap + 6, borderRadius: '50%', background: IT_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Icon name="plus" size={20} strokeWidth={2.6} style={{ color: '#fff' }} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.gap + 4}px ${d.pad}px 0` }}>
        {/* search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: 12, padding: '10px 13px', marginBottom: d.gap + 2 }}>
          <Icon name="search" size={16} style={{ color: '#9AA6A2', flexShrink: 0 }} />
          <span style={{ fontSize: d.body, color: '#9AA6A2', whiteSpace: 'nowrap' }}>Search {HH_ITEMS.length} items…</span>
        </div>

        {/* sort control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: d.stack }}>
          <span style={{ fontSize: d.small + 0.5, color: IT_SUB, fontWeight: 600, flexShrink: 0 }}>Sort</span>
          {[{ k: 'room', label: 'Room' }, { k: 'category', label: 'Type' }, { k: 'flat', label: 'Recent' }].map((o) => {
            const on = sort === o.k;
            return (
              <button key={o.k} onClick={() => setSort(o.k)} style={{ border: `1px solid ${on ? IT_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? '#E8F2EF' : '#fff', color: on ? IT_TEAL : IT_SUB, borderRadius: 99, padding: '6px 13px', fontSize: d.small + 0.5, fontWeight: 600 }}>{o.label}</button>
            );
          })}
        </div>

        {groups.map((g) => (
          <div key={g.key || 'all'} style={{ marginBottom: d.stack }}>
            {g.key && <div style={{ fontSize: 12, fontWeight: 700, color: IT_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2 }}>{g.key}</div>}
            <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
              {g.items.map((it, i) => <Row key={it.id} it={it} last={i === g.items.length - 1} />)}
            </div>
          </div>
        ))}
        <div style={{ height: d.pad }} />
      </div>

      <TabBar tabs={tabs} current={current} onSelect={onTab} accent={IT_TEAL} solidBg="rgba(243,245,244,0.85)" />
    </Screen>
  );
}

// ── Item detail ──────────────────────────────────────────────────────────────
function SectionLabel({ children, right, d }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9, paddingLeft: 2 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: IT_SUB, letterSpacing: 0.6, textTransform: 'uppercase' }}>{children}</span>
      {right}
    </div>
  );
}

function ItemDetail({ d, id, onBack, onOpenTask, onComplete, onEdit, onFix, saved, onSaveAdd, onSaveDelete }) {
  const it = hhItem(id);
  const ex = itemExtras(id);
  const tasks = itemTasks(id);
  const gaps = itemGaps(id);
  const w = it.warranty || {};
  const [kTab, setKTab] = useItS('care');
  const [recallChecked, setRecallChecked] = useItS(false);
  const [viewer, setViewer] = useItS(null);
  const [manage, setManage] = useItS(false);
  const [addNote, setAddNote] = useItS(false);
  // Saved answers: lifted (live app) when handlers are passed, else local.
  const lifted = !!onSaveAdd;
  const [localSaved, setLocalSaved] = useItS(() => itemSaved(id, saved));
  const mySaved = lifted ? (saved || []).filter((e) => e.item === id) : localSaved;
  const addSaved = (e) => lifted ? onSaveAdd(e) : setLocalSaved((s) => [e, ...s]);
  const delSaved = (eid) => lifted ? onSaveDelete(eid) : setLocalSaved((s) => s.filter((e) => e.id !== eid));

  const Card = ({ children, pad = true }) => (
    <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden', padding: pad ? d.cardPad : 0 }}>{children}</div>
  );
  const KV = ({ k, v, last }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: `${d.rowPy - 1}px 0`, borderBottom: last ? 'none' : '0.5px solid rgba(15,23,42,0.07)' }}>
      <span style={{ fontSize: d.small + 1, color: IT_SUB }}>{k}</span>
      <span style={{ fontSize: d.small + 1, color: IT_INK, fontWeight: 600, fontFamily: k === 'Serial' || k === 'Model' ? 'ui-monospace, monospace' : 'inherit' }}>{v}</span>
    </div>
  );

  return (
    <Screen bg={IT_BG} padBottom={20}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `2px ${d.pad - 6}px 6px` }}>
        <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: IT_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 4px' }}>
          <Icon name="chevron-left" size={22} strokeWidth={2.4} /> Items
        </button>
        <button onClick={onEdit} style={{ border: 'none', background: 'transparent', color: IT_TEAL, fontSize: d.body, fontWeight: 600, padding: '6px 8px', cursor: 'pointer' }}>Edit</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        {/* photo + identity */}
        <div>
          <div style={{ position: 'relative', height: 150, borderRadius: d.radius, overflow: 'hidden', background: 'linear-gradient(135deg,#EAF3EF,#DCE9E4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={it.icon} size={66} strokeWidth={1.3} style={{ color: IT_TEAL, opacity: 0.85 }} />
            <button style={{ position: 'absolute', right: 12, bottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.92)', border: 'none', borderRadius: 99, padding: '7px 12px', fontSize: d.small, fontWeight: 600, color: IT_INK }}>
              <Icon name="camera" size={15} /> Add photo
            </button>
          </div>
          <h1 style={{ fontSize: d.big - 2, fontWeight: 800, color: IT_INK, letterSpacing: -0.5, margin: '14px 0 0' }}>{it.name}</h1>
          <div style={{ fontSize: d.body, color: IT_SUB, marginTop: 3 }}>{it.brand} · {it.model}</div>
          <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#EEF2F1', borderRadius: 99, padding: '5px 11px', fontSize: d.small, fontWeight: 600, color: IT_INK }}><Icon name="map-pin" size={13} style={{ color: IT_TEAL }} /> {it.room}</span>
            <span style={{ background: '#EEF2F1', borderRadius: 99, padding: '5px 11px', fontSize: d.small, fontWeight: 600, color: IT_INK }}>{it.category}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: w.active ? '#E8F2EF' : '#F1F3F5', borderRadius: 99, padding: '5px 11px', fontSize: d.small, fontWeight: 600, color: w.active ? IT_TEAL : '#94A3B8' }}>
              <Icon name={w.active ? 'shield-check' : 'shield'} size={13} /> {w.active ? 'Under warranty' : 'Warranty ended'}
            </span>
          </div>
          {/* tags */}
          <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap', alignItems: 'center' }}>
            {(ex.tags || []).map((tg) => (
              <span key={tg} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid rgba(15,23,42,0.12)', borderRadius: 99, padding: '4px 10px', fontSize: d.small, fontWeight: 600, color: IT_SUB }}><Icon name="tag" size={11} /> {tg}</span>
            ))}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, border: '1px dashed rgba(15,23,42,0.22)', borderRadius: 99, padding: '4px 9px', fontSize: d.small, fontWeight: 600, color: IT_TEAL, cursor: 'pointer' }}><Icon name="plus" size={11} /> Tag</span>
          </div>
        </div>

        {/* recall — calm, item-level safety notice */}
        {ex.recall && (
          <div style={{ background: '#F1F5F8', border: '1px solid #DBE6EF', borderRadius: d.radius - 4, padding: d.cardPad }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: d.tap + 4, height: d.tap + 4, borderRadius: 10, background: '#fff', border: '1px solid #DBE6EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="megaphone" size={18} style={{ color: '#5B748F' }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#5B748F', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 }}>Safety notice</div>
                <div style={{ fontSize: d.body, fontWeight: 700, color: IT_INK, letterSpacing: -0.2 }}>Possible recall · {ex.recall.brand} {ex.recall.model}</div>
                <div style={{ fontSize: d.small + 0.5, color: '#5A6863', lineHeight: 1.45, marginTop: 4, textWrap: 'pretty' }}>{ex.recall.body}</div>
              </div>
            </div>
            {!recallChecked ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingLeft: d.tap + 16 }}>
                <button onClick={() => setRecallChecked(true)} style={{ border: 'none', background: '#5B748F', color: '#fff', borderRadius: 11, padding: '10px 15px', fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}>Check my serial</button>
                <span style={{ fontSize: d.small, color: IT_SUB, fontFamily: 'ui-monospace, monospace' }}>{it.serial}</span>
              </div>
            ) : (
              <div style={{ marginTop: 12, marginLeft: d.tap + 16, background: '#fff', border: '1px solid #DBE6EF', borderRadius: 12, padding: `${d.rowPy}px ${d.cardPad}px` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <Icon name={ex.recall.affected ? 'info' : 'check-circle'} size={15} style={{ color: ex.recall.affected ? '#5B748F' : IT_TEAL }} />
                  <span style={{ fontSize: d.small + 1, fontWeight: 700, color: IT_INK }}>{ex.recall.affected ? 'Your unit is included' : 'Your unit isn’t affected'}</span>
                </div>
                <div style={{ fontSize: d.small + 0.5, color: '#5A6863', lineHeight: 1.45 }}>{ex.recall.affected ? ex.recall.remedy : `Serial ${it.serial} falls outside the affected range (${ex.recall.range}). Nothing to do.`}</div>
                {ex.recall.affected && (
                  <button onClick={() => onFix && onFix(id)} style={{ marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #DBE6EF', background: '#fff', color: IT_INK, borderRadius: 10, padding: '9px 13px', fontSize: d.small + 0.5, fontWeight: 700, cursor: 'pointer' }}><Icon name="wrench" size={14} style={{ color: '#5B748F' }} /> Find a servicer</button>
                )}
              </div>
            )}
          </div>
        )}

        {/* complete this item — benefit-framed nudges for what's missing */}
        {(gaps.needsManual || gaps.needsReceipt) && (
          <div>
            <SectionLabel d={d}>Complete this item</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
              {gaps.needsManual && (
                <button onClick={onComplete} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 13, background: '#fff', border: '1px solid rgba(15,23,42,0.10)', borderRadius: d.radius - 4, padding: d.cardPad, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', cursor: 'pointer' }}>
                  <div style={{ width: d.tap + 8, height: d.tap + 8, borderRadius: 11, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="book-open" size={19} style={{ color: IT_TEAL }} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: d.body, fontWeight: 700, color: IT_INK, letterSpacing: -0.2 }}>Add the manual</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: IT_TEAL, background: '#E8F2EF', borderRadius: 99, padding: '3px 8px' }}><Icon name="unlock" size={11} /> Unlocks maintenance tasks</div>
                    <div style={{ fontSize: d.small + 0.5, color: IT_SUB, marginTop: 6, lineHeight: 1.4 }}>Paste a link or upload the PDF and we’ll build the upkeep schedule.</div>
                  </div>
                  <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4', marginTop: 4 }} />
                </button>
              )}
              {gaps.needsReceipt && (
                <button onClick={onComplete} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 13, background: '#fff', border: '1px solid rgba(15,23,42,0.10)', borderRadius: d.radius - 4, padding: d.cardPad, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', cursor: 'pointer' }}>
                  <div style={{ width: d.tap + 8, height: d.tap + 8, borderRadius: 11, background: '#FAF6EC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="receipt" size={19} style={{ color: '#9A7B3A' }} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: d.body, fontWeight: 700, color: IT_INK, letterSpacing: -0.2 }}>Add proof of purchase</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: IT_TEAL, background: '#E8F2EF', borderRadius: 99, padding: '3px 8px' }}><Icon name="unlock" size={11} /> Unlocks warranty tracking</div>
                    <div style={{ fontSize: d.small + 0.5, color: IT_SUB, marginTop: 6, lineHeight: 1.4 }}>Add the receipt so we can warn you before coverage ends.</div>
                  </div>
                  <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4', marginTop: 4 }} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* upcoming tasks */}
        <div>
          <SectionLabel d={d} right={<span style={{ fontSize: d.small, color: IT_TEAL, fontWeight: 600 }}>{tasks.length}</span>}>Upcoming tasks</SectionLabel>
          <Card pad={false}>
            {tasks.length === 0
              ? <div style={{ padding: d.cardPad, fontSize: d.small + 1, color: IT_SUB }}>Nothing scheduled — you’re all set here.</div>
              : tasks.map((t, i) => (
                <div key={t.id} onClick={() => onOpenTask && onOpenTask(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: i === tasks.length - 1 ? 'none' : '0.5px solid rgba(15,23,42,0.07)', borderLeft: `3px solid ${TIER[t.tier].dot}`, cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: d.body, fontWeight: 600, color: IT_INK, letterSpacing: -0.2 }}>{t.name}</div>
                    <div style={{ fontSize: d.small, color: IT_SUB, marginTop: 2 }}>{dueLabel(t.due)} · {t.mins} min</div>
                  </div>
                  <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4' }} />
                </div>
              ))}
          </Card>
        </div>

        {/* specs */}
        <div>
          <SectionLabel d={d}>Details</SectionLabel>
          <Card>
            <KV k="Model" v={it.model} />
            <KV k="Serial" v={it.serial} />
            <KV k="Purchased" v={it.purchased} />
            <KV k="Warranty" v={w.active ? `Until ${w.ends}` : `Ended ${w.ends}`} last />
          </Card>
        </div>

        {/* manual-extracted specs */}
        {(ex.specs || []).length > 0 && (
          <div>
            <SectionLabel d={d} right={<span style={{ fontSize: d.small, color: '#9AA6A2' }}>From the manual</span>}>Specs</SectionLabel>
            <Card>
              {ex.specs.map((s, i) => <KV key={s.k} k={s.k} v={s.v} last={i === ex.specs.length - 1} />)}
            </Card>
          </div>
        )}

        {/* manuals */}
        <div>
          <SectionLabel d={d} right={<button onClick={() => setManage(true)} style={{ border: 'none', background: 'transparent', color: IT_TEAL, fontSize: d.small + 1, fontWeight: 700, padding: 2, cursor: 'pointer' }}>Manage</button>}>Manuals &amp; docs</SectionLabel>
          <Card pad={false}>
            {ex.manuals.length === 0 ? (
              <button onClick={() => setManage(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'transparent', padding: `${d.rowPy}px ${d.cardPad}px`, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: d.tap, height: d.tap, borderRadius: 9, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="plus" size={17} style={{ color: IT_TEAL }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: d.body - 0.5, fontWeight: 600, color: IT_INK }}>Add a manual</div>
                  <div style={{ fontSize: d.small, color: IT_SUB, marginTop: 1 }}>Unlocks tasks, specs &amp; fixes</div>
                </div>
                <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4' }} />
              </button>
            ) : ex.manuals.map((m, i) => (
              <div key={m.name} onClick={() => setViewer(m)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: i === ex.manuals.length - 1 ? 'none' : '0.5px solid rgba(15,23,42,0.07)', cursor: 'pointer' }}>
                <div style={{ width: d.tap, height: d.tap, borderRadius: 9, background: '#FBF1EC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="file-text" size={17} style={{ color: '#C2410C' }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: d.body - 0.5, fontWeight: 600, color: IT_INK, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label || m.name}</div>
                  <div style={{ fontSize: d.small, color: IT_SUB, marginTop: 1 }}>{m.role === 'primary' ? 'Primary · ' : ''}PDF · {m.pages} pages</div>
                </div>
                <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4' }} />
              </div>
            ))}
          </Card>
        </div>

        {/* guides — care / how-to / troubleshooting */}
        <div>
          <SectionLabel d={d}>Guides</SectionLabel>
          <div style={{ display: 'flex', background: '#E7EAE9', borderRadius: 11, padding: 3, gap: 2, marginBottom: d.gap + 2 }}>
            {[{ k: 'care', label: 'Care' }, { k: 'howto', label: 'How-to' }, { k: 'trouble', label: 'Fix it' }].map((tb) => {
              const on = kTab === tb.k;
              return <button key={tb.k} onClick={() => setKTab(tb.k)} style={{ flex: 1, border: 'none', borderRadius: 9, padding: '8px 4px', background: on ? '#fff' : 'transparent', color: on ? IT_INK : IT_SUB, fontSize: d.small + 1, fontWeight: on ? 700 : 500, boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none', cursor: 'pointer' }}>{tb.label}</button>;
            })}
          </div>
          {kTab === 'trouble' ? (
            <Troubleshoot d={d} items={ex.trouble} onFix={() => onFix && onFix(id)} onOpenManual={() => setViewer(ex.manuals[0] || { name: `${it.name} — Manual`, pages: 40 })} />
          ) : (
          <Card>
            {kTab === 'care' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
                {ex.care.map((c) => (
                  <div key={c} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Icon name="check" size={16} strokeWidth={2.6} style={{ color: IT_TEAL, marginTop: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: d.body, color: '#26302D', lineHeight: 1.4 }}>{c}</span>
                  </div>
                ))}
              </div>
            )}
            {kTab === 'howto' && (ex.howto || []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: d.stack - 2 }}>
                {ex.howto.map((g) => (
                  <div key={g.title}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: d.body, fontWeight: 700, color: IT_INK, letterSpacing: -0.2 }}>{g.title}</span>
                      <span style={{ fontSize: d.small, color: IT_SUB }}>{g.mins} min</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {g.steps.map((s, i) => (
                        <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                          <span style={{ width: 19, height: 19, borderRadius: 10, background: '#EAF3EF', color: IT_TEAL, fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                          <span style={{ fontSize: d.small + 1.5, color: '#26302D', lineHeight: 1.4 }}>{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : kTab === 'howto' ? <div style={{ fontSize: d.small + 1, color: IT_SUB }}>Add the manual to unlock step-by-step guides.</div> : null}
          </Card>
          )}
        </div>

        {/* saved answers (folded-in care guide) */}
        <div>
          <SectionLabel d={d} right={mySaved.length ? <button onClick={() => setAddNote(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: IT_TEAL, fontSize: d.small + 1, fontWeight: 700, padding: 2, cursor: 'pointer' }}><Icon name="plus" size={14} /> Add</button> : null}>Saved answers</SectionLabel>
          <SavedAnswers d={d} entries={mySaved} onAsk={() => onFix && onFix(id)} onAdd={() => setAddNote(true)} onDelete={delSaved} />
        </div>

        {/* notes */}
        <div>
          <SectionLabel d={d} right={<span style={{ fontSize: d.small, color: IT_TEAL, fontWeight: 600 }}>Edit</span>}>Notes</SectionLabel>
          <Card>
            <div style={{ fontSize: d.body, color: ex.notes ? '#26302D' : '#9AA6A2', lineHeight: 1.45 }}>{ex.notes || 'Add a private note about this item…'}</div>
          </Card>
        </div>

        {/* history */}
        <div>
          <SectionLabel d={d}>Activity</SectionLabel>
          <ActivityLog d={d} history={ex.history} />
        </div>
        <div style={{ height: d.pad }} />
      </div>
      {viewer && <ManualViewer d={d} manual={viewer} item={it} onClose={() => setViewer(null)} />}
      {manage && <ManualsManager d={d} item={it} onClose={() => setManage(false)} onOpenManual={(m) => setViewer(m)} />}
      {addNote && <AddTipSheet d={d} lockItem={id} onBack={() => setAddNote(false)} onSave={(e) => { addSaved(e); setAddNote(false); }} />}
    </Screen>
  );
}

// ── Item edit ────────────────────────────────────────────────────────────────
function ItemEdit({ d, id, onBack, onSave }) {
  const it = hhItem(id);
  const w = it.warranty || {};
  const [room, setRoom] = useItS(it.room);
  const [track, setTrack] = useItS(!!w.active);
  const rooms = ['Kitchen', 'Laundry', 'Utility', 'Living room', 'Garage'];

  const EditRow = ({ label, value, placeholder, mono, last }) => (
    <div style={{ padding: `${d.rowPy - 1}px ${d.cardPad}px`, borderBottom: last ? 'none' : '0.5px solid rgba(15,23,42,0.07)' }}>
      <div style={{ fontSize: d.small, fontWeight: 600, color: IT_SUB, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: d.body, color: value ? IT_INK : '#9AA6A2', fontFamily: mono ? 'ui-monospace, monospace' : 'inherit', fontWeight: 500, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value || placeholder}</span>
        <Icon name="pencil" size={14} style={{ color: '#C2CBD4', flexShrink: 0 }} />
      </div>
    </div>
  );
  const Card = ({ title, children }) => (
    <div style={{ marginBottom: d.stack }}>
      {title && <div style={{ fontSize: 12, fontWeight: 700, color: IT_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2 }}>{title}</div>}
      <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>{children}</div>
    </div>
  );

  return (
    <Screen bg={IT_BG} padBottom={20}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `4px ${d.pad - 2}px 10px` }}>
        <button onClick={onBack} style={{ border: 'none', background: 'transparent', color: IT_SUB, fontSize: d.body, fontWeight: 500, padding: '6px 2px', cursor: 'pointer' }}>Cancel</button>
        <span style={{ fontSize: d.body, fontWeight: 700, color: IT_INK }}>Edit item</span>
        <button onClick={onSave} style={{ border: 'none', background: 'transparent', color: IT_TEAL, fontSize: d.body, fontWeight: 700, padding: '6px 2px', cursor: 'pointer' }}>Save</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.gap + 2}px ${d.pad}px 0` }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 11, marginBottom: d.stack }}>
          <div style={{ width: 92, height: 92, borderRadius: 22, background: 'linear-gradient(135deg,#EAF3EF,#DCE9E4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={it.icon} size={44} strokeWidth={1.4} style={{ color: IT_TEAL }} /></div>
          <button style={{ border: 'none', background: 'transparent', color: IT_TEAL, fontSize: d.small + 1, fontWeight: 700, cursor: 'pointer' }}>Change photo</button>
        </div>

        <Card title="Details">
          <EditRow label="Name" value={it.name} />
          <EditRow label="Brand" value={it.brand} />
          <EditRow label="Model" value={it.model} mono />
          <EditRow label="Serial number" value={it.serial} mono last />
        </Card>

        <Card title="Location">
          <div style={{ padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: '0.5px solid rgba(15,23,42,0.07)' }}>
            <div style={{ fontSize: d.small, fontWeight: 600, color: IT_SUB, marginBottom: 8 }}>Room</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {rooms.map((r) => {
                const on = room === r;
                return <button key={r} onClick={() => setRoom(r)} style={{ border: `1px solid ${on ? IT_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? IT_TEAL : '#fff', color: on ? '#fff' : IT_INK, borderRadius: 99, padding: '7px 13px', fontSize: d.small + 0.5, fontWeight: 600, cursor: 'pointer' }}>{r}</button>;
              })}
            </div>
          </div>
          <EditRow label="Category" value={it.category} last />
        </Card>

        <Card title="Purchase">
          <EditRow label="Where you bought it" placeholder="Add a retailer" />
          <EditRow label="Purchase date" value={it.purchased} />
          <EditRow label="Price paid" placeholder="Add a price" last />
        </Card>

        <Card title="Warranty">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderBottom: track ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: d.body, fontWeight: 500, color: IT_INK }}>Track warranty</div>
              <div style={{ fontSize: d.small, color: IT_SUB, marginTop: 1 }}>Remind me before it ends</div>
            </div>
            <Switch on={track} onToggle={() => setTrack((v) => !v)} />
          </div>
          {track && <EditRow label="Warranty ends" value={w.ends || 'Add a date'} last />}
        </Card>

        <button style={{ width: '100%', border: '1px solid rgba(220,38,38,0.25)', background: '#fff', color: '#DC2626', borderRadius: d.radius - 4, padding: '14px 0', fontSize: d.body, fontWeight: 700, marginBottom: d.pad, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="trash-2" size={17} /> Delete item
        </button>
      </div>
    </Screen>
  );
}

// ── Manual viewer (PDF reader sheet) ─────────────────────────────────────────
function ManualViewer({ d, manual, item, onClose }) {
  const lines = [100, 92, 96, 78, 88, 64, 94, 70];
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: '#2B302E', display: 'flex', flexDirection: 'column', paddingTop: SB_H }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `4px ${d.pad - 4}px 10px` }}>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#9FE7D2', fontSize: d.body, fontWeight: 700, padding: '6px 4px', cursor: 'pointer' }}>Done</button>
        <div style={{ textAlign: 'center', minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: d.small + 1, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(manual.name || 'Manual').split('—')[0].trim()}</div>
          <div style={{ fontSize: d.small - 0.5, color: 'rgba(255,255,255,0.5)' }}>Page 14 of {manual.pages || 48}</div>
        </div>
        <button style={{ border: 'none', background: 'transparent', color: '#9FE7D2', padding: '6px 6px', cursor: 'pointer' }}><Icon name="search" size={18} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px ${d.pad}px` }}>
        <div style={{ background: '#fff', borderRadius: 6, padding: '26px 22px', boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9AA6A2', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 14 }}>Maintenance · Water filter</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1A1A', letterSpacing: -0.3, marginBottom: 14 }}>Replacing the water filter</div>
          <p style={{ fontSize: 12.5, color: '#3A3A3A', lineHeight: 1.7, margin: '0 0 14px' }}>Replace the filter every 6 months, or when the indicator light turns on, to keep water and ice tasting fresh. Use only genuine LT1000P cartridges.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
            {lines.map((wd, i) => <div key={i} style={{ height: 7, width: wd + '%', borderRadius: 4, background: '#ECEEF0' }} />)}
          </div>
          <div style={{ height: 120, borderRadius: 6, background: 'repeating-linear-gradient(45deg,#F1F3F4,#F1F3F4 9px,#E7EAEC 9px,#E7EAEC 18px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#9AA6A2', fontFamily: 'ui-monospace, monospace' }}>fig. 12 — filter housing</div>
        </div>
      </div>
      <div style={{ padding: `10px ${d.pad}px calc(14px + env(safe-area-inset-bottom))`, background: 'rgba(43,48,46,0.9)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button style={{ width: '100%', border: 'none', background: '#1B6B5A', color: '#fff', borderRadius: 13, padding: '13px 0', fontSize: d.body, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
          <Icon name="sparkles" size={17} /> Ask about this page
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { ItemsTab, ItemDetail, ItemEdit, ItemThumb, ManualViewer, HH_ITEM_EXTRAS, itemExtras, itemTasks, itemGaps });
