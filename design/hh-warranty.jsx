// ── Homehub · Warranties hub ─────────────────────────────────────────────────
// One calm place to see coverage across the whole home: what's still protected,
// what lapses soon (surfaced, never alarmist), and what's already ended. Reads
// HH_ITEMS; a small extras map adds coverage wording and the soon countdown.
// Rows push into the item's detail screen (where coverage is edited).

const { useState: useWrS } = React;

const WR_INK = '#0B1220', WR_SUB = '#6B7280', WR_TEAL = '#1B6B5A', WR_BG = '#F3F5F4', WR_AMBER = '#B4791F';

const WR_EXTRA = {
  hvac:   { coverage: '10-yr parts · registered' },
  fridge: { coverage: '1-yr manufacturer', days: 21 },
  dish:   { coverage: '1-yr manufacturer' },
  washer: { coverage: '1-yr manufacturer' },
  water:  { coverage: '6-yr tank & parts' },
};

function wrList() {
  return HH_ITEMS.filter((it) => it.warranty).map((it) => ({ ...it, w: it.warranty, x: WR_EXTRA[it.id] || {} }));
}

// Status tone per coverage state — amber = worth a look, never red.
const WR_TONE = {
  soon:    { fg: WR_AMBER, soft: '#FBF3E2', border: '#EFE0C2', label: 'Expiring soon' },
  active:  { fg: WR_TEAL,  soft: '#E8F2EF', border: '#D4E7E0', label: 'Active' },
  expired: { fg: '#7A8690', soft: '#F1F4F6', border: '#E4E9ED', label: 'Lapsed' },
};
function wrStatus(it) { return it.w.soon ? 'soon' : it.w.active ? 'active' : 'expired'; }

function WarRow({ d, it, onOpen, last }) {
  const st = wrStatus(it); const tn = WR_TONE[st];
  const right = st === 'soon' ? `${it.x.days} days left` : st === 'active' ? `Until ${it.w.ends}` : `Ended ${it.w.ends}`;
  return (
    <button onClick={() => onOpen && onOpen(it.id)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: 'none', borderTop: last ? 'none' : '0', padding: `${d.rowPy}px ${d.cardPad}px`, cursor: 'pointer' }}>
      <ItemGlyph icon={it.icon} size={d.tap + 8} bg={tn.soft} fg={tn.fg} radius={11} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: d.body, fontWeight: 700, color: WR_INK, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
        <div style={{ fontSize: d.small, color: WR_SUB, marginTop: 1 }}>{it.x.coverage || it.category}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: d.small + 0.5, fontWeight: 700, color: tn.fg, whiteSpace: 'nowrap' }}>{right}</span>
        <Icon name="chevron-right" size={17} style={{ color: '#C2CBD4' }} />
      </div>
    </button>
  );
}

function WarGroup({ d, title, items, onOpen }) {
  if (!items.length) return null;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: WR_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>{title} · {items.length}</div>
      <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
        {items.map((it, i) => (
          <div key={it.id} style={{ borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>
            <WarRow d={d} it={it} onOpen={onOpen} last />
          </div>
        ))}
      </div>
    </div>
  );
}

function WarrantiesHub({ d, onBack, onOpenItem }) {
  const items = wrList();
  const soon = items.filter((it) => wrStatus(it) === 'soon');
  const active = items.filter((it) => wrStatus(it) === 'active');
  const lapsed = items.filter((it) => wrStatus(it) === 'expired');
  const stats = [
    { n: active.length, l: 'active', c: WR_TEAL },
    { n: soon.length, l: 'expiring', c: WR_AMBER },
    { n: lapsed.length, l: 'lapsed', c: '#7A8690' },
  ];

  return (
    <Screen bg={WR_BG} padBottom={d.pad}>
      {/* header */}
      <div style={{ padding: `2px ${d.pad}px 0` }}>
        {onBack && (
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: WR_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 6px 8px 0', marginLeft: -2, cursor: 'pointer' }}>
            <Icon name="chevron-left" size={22} strokeWidth={2.4} /> Back
          </button>
        )}
        <h1 style={{ fontSize: d.big, fontWeight: 800, color: WR_INK, letterSpacing: -0.7, margin: `${onBack ? 0 : 8}px 0 0` }}>Warranties</h1>
        <p style={{ fontSize: d.small + 1, color: WR_SUB, margin: '3px 0 0' }}>Coverage across your home, at a glance.</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 0`, display: 'flex', flexDirection: 'column', gap: d.stack + 2 }}>
        {/* summary */}
        <div style={{ display: 'flex', gap: d.gap }}>
          {stats.map((s) => (
            <div key={s.l} style={{ flex: 1, background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', padding: `${d.cardPad}px 6px`, textAlign: 'center' }}>
              <div style={{ fontSize: d.big - 6, fontWeight: 800, color: s.c, letterSpacing: -0.5 }}>{s.n}</div>
              <div style={{ fontSize: d.small, color: WR_SUB, marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* expiring soon — gentle highlight */}
        {soon.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: WR_AMBER, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>Worth a look</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
              {soon.map((it) => (
                <button key={it.id} onClick={() => onOpenItem && onOpenItem(it.id)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 13, background: WR_TONE.soon.soft, border: `1px solid ${WR_TONE.soon.border}`, borderRadius: d.radius - 4, padding: d.cardPad, cursor: 'pointer' }}>
                  <ItemGlyph icon={it.icon} size={d.tap + 16} bg="#fff" fg={WR_AMBER} radius={13} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: WR_AMBER, letterSpacing: 0.4, textTransform: 'uppercase' }}><Icon name="shield-alert" size={12} /> Expires in {it.x.days} days</div>
                    <div style={{ fontSize: d.h2, fontWeight: 800, color: WR_INK, letterSpacing: -0.3, margin: '3px 0 1px', lineHeight: 1.1 }}>{it.name}</div>
                    <div style={{ fontSize: d.small + 0.5, color: '#6B5E3E' }}>Coverage ends {it.w.ends} · {it.x.coverage}</div>
                  </div>
                  <Icon name="chevron-right" size={19} style={{ color: WR_AMBER }} />
                </button>
              ))}
            </div>
          </div>
        )}

        <WarGroup d={d} title="Active" items={active} onOpen={onOpenItem} />
        <WarGroup d={d} title="Lapsed" items={lapsed} onOpen={onOpenItem} />

        {lapsed.length > 0 && (
          <p style={{ fontSize: d.small + 0.5, color: WR_SUB, textAlign: 'center', margin: '0 8px', lineHeight: 1.45 }}>
            Renewed or bought a protection plan? Open the item to update its coverage.
          </p>
        )}
        <div style={{ height: 4 }} />
      </div>
    </Screen>
  );
}

// ── Connector: hub ↔ item detail (so rows are tappable in the prototype) ─────
function WarrantiesApp({ d }) {
  const [openId, setOpenId] = useWrS(null);
  if (openId) {
    return <ItemDetail d={d} id={openId} onBack={() => setOpenId(null)} onComplete={() => {}} onEdit={() => {}} onOpenTask={() => {}} />;
  }
  return <WarrantiesHub d={d} onOpenItem={(id) => setOpenId(id)} />;
}

Object.assign(window, { WarrantiesHub, WarrantiesApp, WR_EXTRA });
