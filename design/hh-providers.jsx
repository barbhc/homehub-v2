// ── Homehub · Service providers ──────────────────────────────────────────────
// Your trusted pros, one tap away: who to call for each system, their contact
// methods, notes, the items they've worked on, and a short job history. Same
// calm teal system. Surfaces: hub → provider detail → add / edit.

const { useState: usePvS } = React;

const PV_INK = '#0B1220', PV_SUB = '#6B7280', PV_TEAL = '#1B6B5A', PV_BG = '#F3F5F4';

// Category meta — colour + glyph per trade.
const PV_CATS = {
  'HVAC':             { icon: 'wind',          bg: '#EAF3EF', fg: '#1B6B5A' },
  'Plumbing':         { icon: 'droplets',      bg: '#E8F1F7', fg: '#3A6EA5' },
  'Electrical':       { icon: 'zap',           bg: '#FBF4E2', fg: '#9A7B3A' },
  'Appliance repair': { icon: 'wrench',        bg: '#FBF1EC', fg: '#C2410C' },
  'Landscaping':      { icon: 'sprout',        bg: '#ECF4E6', fg: '#5B7A3A' },
  'General':          { icon: 'hammer',        bg: '#F1F3F5', fg: '#6B7280' },
};
const PV_CAT_LIST = Object.keys(PV_CATS);
function pvCat(c) { return PV_CATS[c] || PV_CATS.General; }

const PV_SEED = [
  { id: 'p-ace', name: 'Ace Heating & Air', category: 'HVAC', phone: '(555) 201-4477', email: 'service@acehvac.com', website: 'aceheatingair.com', notes: 'Ask for Marco — did the spring tune-up. Flat $89 diagnostic, waived if you book the repair.', items: ['hvac'], history: [{ date: 'Mar 2025', text: 'Furnace tune-up' }, { date: 'Oct 2023', text: 'Replaced capacitor' }] },
  { id: 'p-proplumb', name: 'Pro Plumb', category: 'Plumbing', phone: '(555) 778-1200', email: '', website: 'proplumb.co', notes: '24/7 emergency line. Installed the water heater and knows the layout.', items: ['water'], history: [{ date: 'Nov 2020', text: 'Installed water heater' }] },
  { id: 'p-spark', name: 'Bright Spark Electric', category: 'Electrical', phone: '(555) 332-9080', email: 'hello@brightspark.com', website: '', notes: 'Licensed and fast. Quoted a panel upgrade — hold for now.', items: [], history: [{ date: 'Jan 2025', text: 'Panel upgrade quote' }] },
  { id: 'p-sears', name: 'Sears Appliance Repair', category: 'Appliance repair', phone: '(555) 446-7711', email: '', website: 'searshomeservices.com', notes: 'Handled the dishwasher recall service under warranty.', items: ['dish'], history: [{ date: 'Jun 2024', text: 'Recall service — dishwasher' }] },
];

// ── Contact action button ────────────────────────────────────────────────────
function PvAction({ d, icon, label, href, tone }) {
  const teal = tone !== 'muted';
  return (
    <a href={href || undefined} style={{ flex: 1, textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: teal ? '#EAF3EF' : '#F1F3F5', borderRadius: 14, padding: `${d.rowPy}px 4px`, cursor: 'pointer' }}>
      <Icon name={icon} size={20} style={{ color: teal ? PV_TEAL : '#9AA6A2' }} />
      <span style={{ fontSize: d.small, fontWeight: 600, color: teal ? PV_INK : '#9AA6A2' }}>{label}</span>
    </a>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HUB
// ════════════════════════════════════════════════════════════════════════════
function ProvidersHub({ d, providers, tabs = TABS_FULL, currentTab = 'settings', onTab, onOpen, onAdd, onBack }) {
  // Group by category, in PV_CAT_LIST order.
  const groups = PV_CAT_LIST.map((c) => ({ cat: c, items: providers.filter((p) => p.category === c) })).filter((g) => g.items.length);

  return (
    <Screen bg={PV_BG} padBottom={onBack ? d.pad : undefined}>
      <div style={{ padding: `${onBack ? 2 : 10}px ${d.pad}px 0`, display: 'flex', alignItems: onBack ? 'flex-end' : 'center', justifyContent: 'space-between' }}>
        <div>
          {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: PV_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 6px 6px 0', marginLeft: -2, cursor: 'pointer' }}><Icon name="chevron-left" size={22} strokeWidth={2.4} /> Settings</button>}
          <h1 style={{ fontSize: d.big, fontWeight: 800, color: PV_INK, letterSpacing: -0.7, margin: 0 }}>Providers</h1>
          <p style={{ fontSize: d.small + 1, color: PV_SUB, margin: '3px 0 0' }}>Your trusted pros, one tap away.</p>
        </div>
        <button onClick={onAdd} style={{ width: d.tap + 6, height: d.tap + 6, borderRadius: '50%', border: 'none', background: PV_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Icon name="plus" size={20} strokeWidth={2.6} style={{ color: '#fff' }} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 0` }}>
        {providers.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', padding: `${d.cardPad + 10}px ${d.cardPad}px`, textAlign: 'center', marginTop: d.stack }}>
            <div style={{ width: 54, height: 54, borderRadius: 15, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}><Icon name="contact" size={26} style={{ color: PV_TEAL }} /></div>
            <div style={{ fontSize: d.body, fontWeight: 700, color: PV_INK }}>No providers yet</div>
            <div style={{ fontSize: d.small + 1, color: PV_SUB, marginTop: 4, lineHeight: 1.4, maxWidth: 250, marginInline: 'auto' }}>Save the pros you trust so the right number is here when something breaks.</div>
            <button onClick={onAdd} style={{ marginTop: 16, border: 'none', background: PV_TEAL, color: '#fff', borderRadius: 12, padding: '11px 18px', fontSize: d.body, fontWeight: 700, cursor: 'pointer' }}>Add a provider</button>
          </div>
        ) : groups.map((g) => {
          const cm = pvCat(g.cat);
          return (
            <div key={g.cat} style={{ marginBottom: d.stack }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: PV_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>{g.cat}</div>
              <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
                {g.items.map((p, i) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>
                    <button onClick={() => onOpen(p.id)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                      <ItemGlyph icon={cm.icon} size={d.tap + 8} bg={cm.bg} fg={cm.fg} radius={11} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: d.body, fontWeight: 700, color: PV_INK, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                        <div style={{ fontSize: d.small, color: PV_SUB, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.history && p.history[0] ? p.history[0].text + ' · ' + p.history[0].date : p.phone}</div>
                      </div>
                    </button>
                    <a href={p.phone ? `tel:${p.phone.replace(/[^0-9+]/g, '')}` : undefined} title="Call" style={{ flexShrink: 0, width: d.tap + 4, height: d.tap + 4, borderRadius: '50%', background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', textDecoration: 'none' }}>
                      <Icon name="phone" size={16} style={{ color: PV_TEAL }} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <div style={{ height: d.pad }} />
      </div>

      {!onBack && <TabBar tabs={tabs} current={currentTab} onSelect={onTab} accent={PV_TEAL} solidBg="rgba(243,245,244,0.85)" />}
    </Screen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DETAIL
// ════════════════════════════════════════════════════════════════════════════
function ProviderDetail({ d, provider: p, onBack, onEdit, onOpenItem }) {
  const cm = pvCat(p.category);
  const tel = p.phone ? `tel:${p.phone.replace(/[^0-9+]/g, '')}` : null;
  return (
    <Screen bg={PV_BG} padBottom={20}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `2px ${d.pad - 6}px 6px` }}>
        <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: PV_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 4px', cursor: 'pointer' }}>
          <Icon name="chevron-left" size={22} strokeWidth={2.4} /> Providers
        </button>
        <button onClick={onEdit} style={{ border: 'none', background: 'transparent', color: PV_TEAL, fontSize: d.body, fontWeight: 600, padding: '6px 8px', cursor: 'pointer' }}>Edit</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${d.pad}px`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        {/* identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 4 }}>
          <ItemGlyph icon={cm.icon} size={d.tap + 30} bg={cm.bg} fg={cm.fg} radius={18} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: d.big - 4, fontWeight: 800, color: PV_INK, letterSpacing: -0.5, margin: 0, lineHeight: 1.12, textWrap: 'balance' }}>{p.name}</h1>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: cm.bg, color: cm.fg, borderRadius: 99, padding: '4px 10px', fontSize: d.small, fontWeight: 700, marginTop: 7 }}>{p.category}</span>
          </div>
        </div>

        {/* contact actions */}
        <div style={{ display: 'flex', gap: d.gap }}>
          <PvAction d={d} icon="phone" label="Call" href={tel} tone={p.phone ? '' : 'muted'} />
          <PvAction d={d} icon="message-square" label="Text" href={p.phone ? `sms:${p.phone.replace(/[^0-9+]/g, '')}` : null} tone={p.phone ? '' : 'muted'} />
          <PvAction d={d} icon="mail" label="Email" href={p.email ? `mailto:${p.email}` : null} tone={p.email ? '' : 'muted'} />
          <PvAction d={d} icon="globe" label="Website" href={p.website ? `https://${p.website}` : null} tone={p.website ? '' : 'muted'} />
        </div>

        {/* contact details */}
        <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
          {[['phone', p.phone], ['mail', p.email], ['globe', p.website]].filter(([, v]) => v).map(([ic, v], i, arr) => (
            <div key={ic} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>
              <Icon name={ic} size={16} style={{ color: '#9AA6A2', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: d.body, color: PV_INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* notes */}
        {p.notes && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: PV_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>Notes</div>
            <div style={{ background: '#FBFCF8', border: '1px solid #E6ECD9', borderRadius: d.radius - 4, padding: d.cardPad, fontSize: d.body, color: '#3A4030', lineHeight: 1.5, textWrap: 'pretty' }}>{p.notes}</div>
          </div>
        )}

        {/* linked items */}
        {(p.items || []).length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: PV_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>Works on</div>
            <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
              {p.items.map((iid, i) => {
                const it = hhItem(iid);
                return (
                  <button key={iid} onClick={() => onOpenItem && onOpenItem(iid)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'transparent', borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none', padding: `${d.rowPy}px ${d.cardPad}px`, cursor: 'pointer' }}>
                    <ItemGlyph icon={it.icon} size={d.tap} bg="#EEF2F1" fg={PV_TEAL} radius={9} />
                    <span style={{ flex: 1, fontSize: d.body, fontWeight: 600, color: PV_INK }}>{it.name}</span>
                    <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4' }} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* history */}
        {(p.history || []).length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: PV_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 9, paddingLeft: 2 }}>Job history</div>
            <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
              {p.history.map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: `${d.rowPy}px ${d.cardPad}px`, borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none' }}>
                  <div style={{ width: d.tap, height: d.tap, borderRadius: 9, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="check" size={15} strokeWidth={2.6} style={{ color: PV_TEAL }} /></div>
                  <span style={{ flex: 1, fontSize: d.body, color: PV_INK }}>{h.text}</span>
                  <span style={{ fontSize: d.small, color: PV_SUB }}>{h.date}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ height: d.pad }} />
      </div>
    </Screen>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ADD / EDIT
// ════════════════════════════════════════════════════════════════════════════
function ProviderEdit({ d, provider, onBack, onSave, onDelete }) {
  const editing = !!provider;
  const [name, setName] = usePvS(provider ? provider.name : '');
  const [category, setCategory] = usePvS(provider ? provider.category : 'HVAC');
  const [phone, setPhone] = usePvS(provider ? provider.phone : '');
  const [email, setEmail] = usePvS(provider ? provider.email : '');
  const [website, setWebsite] = usePvS(provider ? provider.website : '');
  const [notes, setNotes] = usePvS(provider ? provider.notes : '');
  const [items, setItems] = usePvS(provider ? (provider.items || []) : []);
  const toggleItem = (id) => setItems((x) => x.includes(id) ? x.filter((y) => y !== id) : [...x, id]);
  const [importUrl, setImportUrl] = usePvS('');
  const [importing, setImporting] = usePvS(false);
  const [imported, setImported] = usePvS(null);

  // Mock "scrape" — in a real build this calls a fetch-and-parse service. We
  // detect the source from the URL and prefill the fields for the user to edit.
  const importFromUrl = () => {
    if (!importUrl.trim() || importing) return;
    const u = importUrl.toLowerCase();
    const src = u.includes('yelp') ? 'Yelp' : (u.includes('google') || u.includes('maps') || u.includes('goo.gl')) ? 'Google Maps' : 'the web';
    setImporting(true);
    setTimeout(() => {
      setName('Maple Leaf Plumbing & Heating');
      setCategory('Plumbing');
      setPhone('(555) 612-8890');
      setWebsite('mapleleafplumbing.com');
      setNotes(`4.6★ on ${src} · 212 reviews · Open until 8 PM · Licensed & insured. Imported ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`);
      setImported(src);
      setImporting(false);
    }, 1300);
  };

  const fieldStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(15,23,42,0.14)', borderRadius: 11, padding: '12px 13px', fontFamily: 'inherit', fontSize: d.body, color: PV_INK, outline: 'none', background: '#fff' };
  const Lbl = ({ children }) => <div style={{ fontSize: 11, fontWeight: 700, color: PV_SUB, letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 0 8px 2px' }}>{children}</div>;

  const save = () => onSave({ id: provider ? provider.id : 'p-' + Date.now(), name: name || 'New provider', category, phone, email, website, notes, items, history: provider ? provider.history : [] });

  return (
    <Screen bg={PV_BG} padBottom={20}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `4px ${d.pad - 2}px 10px` }}>
        <button onClick={onBack} style={{ border: 'none', background: 'transparent', color: PV_SUB, fontSize: d.body, fontWeight: 500, padding: '6px 2px', cursor: 'pointer' }}>Cancel</button>
        <span style={{ fontSize: d.body, fontWeight: 700, color: PV_INK }}>{editing ? 'Edit provider' : 'Add provider'}</span>
        <button onClick={save} style={{ border: 'none', background: 'transparent', color: PV_TEAL, fontSize: d.body, fontWeight: 700, padding: '6px 2px', cursor: 'pointer' }}>Save</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.gap}px ${d.pad}px 0`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        <style>{'@keyframes pvspin{to{transform:rotate(360deg)}}'}</style>
        {/* autofill from a link */}
        <div style={{ background: '#fff', border: '1px solid rgba(15,23,42,0.10)', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', padding: d.cardPad }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
            <Icon name="link" size={15} style={{ color: PV_TEAL }} />
            <span style={{ fontSize: d.body - 0.5, fontWeight: 700, color: PV_INK, letterSpacing: -0.2 }}>Autofill from a link</span>
          </div>
          <div style={{ display: 'flex', gap: d.gap - 2 }}>
            <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="Paste a Yelp or Google Maps link" style={{ ...fieldStyle, flex: 1, minWidth: 0 }} />
            <button onClick={importFromUrl} disabled={importing || !importUrl.trim()} style={{ flexShrink: 0, border: 'none', background: importing || !importUrl.trim() ? '#C9D4D0' : PV_TEAL, color: '#fff', borderRadius: 11, padding: '0 16px', fontSize: d.small + 1, fontWeight: 700, cursor: importing || !importUrl.trim() ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              {importing ? <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'pvspin .8s linear infinite' }} /> : <Icon name="sparkles" size={15} />}
              {importing ? 'Reading' : 'Autofill'}
            </button>
          </div>
          {imported ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, background: '#E8F2EF', border: '1px solid #D4E7E0', borderRadius: 10, padding: '9px 11px' }}>
              <Icon name="check-circle" size={16} style={{ color: PV_TEAL, flexShrink: 0 }} />
              <span style={{ fontSize: d.small + 0.5, color: '#2B3A36', lineHeight: 1.35 }}>Imported from <strong>{imported}</strong> — review and edit below.</span>
            </div>
          ) : (
            <div style={{ fontSize: d.small, color: PV_SUB, marginTop: 8, lineHeight: 1.4 }}>We’ll pull the name, phone, website and rating. Everything stays editable.</div>
          )}
        </div>

        <div>
          <Lbl>Name</Lbl>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ace Heating & Air" style={fieldStyle} />
        </div>
        <div>
          <Lbl>Category</Lbl>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {PV_CAT_LIST.map((c) => {
              const on = category === c;
              const cm = pvCat(c);
              return <button key={c} onClick={() => setCategory(c)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1.5px solid ${on ? PV_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? '#E8F2EF' : '#fff', color: on ? PV_TEAL : PV_INK, borderRadius: 99, padding: '8px 12px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}><Icon name={cm.icon} size={14} style={{ color: on ? PV_TEAL : cm.fg }} /> {c}</button>;
            })}
          </div>
        </div>
        <div>
          <Lbl>Contact</Lbl>
          <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap }}>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" style={fieldStyle} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={fieldStyle} />
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" style={fieldStyle} />
          </div>
        </div>
        <div>
          <Lbl>Notes</Lbl>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Who to ask for, pricing, anything worth remembering…" style={{ ...fieldStyle, resize: 'none', lineHeight: 1.45 }} />
        </div>
        <div>
          <Lbl>Works on</Lbl>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {HH_ITEMS.map((it) => {
              const on = items.includes(it.id);
              return <button key={it.id} onClick={() => toggleItem(it.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1.5px solid ${on ? PV_TEAL : 'rgba(15,23,42,0.14)'}`, background: on ? PV_TEAL : '#fff', color: on ? '#fff' : PV_INK, borderRadius: 99, padding: '8px 12px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}>{on && <Icon name="check" size={13} strokeWidth={3} />} {it.short || it.name}</button>;
            })}
          </div>
        </div>

        {editing && (
          <button onClick={() => onDelete(provider.id)} style={{ width: '100%', border: '1px solid rgba(220,38,38,0.25)', background: '#fff', color: '#DC2626', borderRadius: d.radius - 4, padding: '14px 0', fontSize: d.body, fontWeight: 700, marginTop: 4, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="trash-2" size={17} /> Remove provider
          </button>
        )}
        <div style={{ height: d.pad }} />
      </div>
    </Screen>
  );
}

// ── Connector ────────────────────────────────────────────────────────────────
function ProvidersApp({ d, tabs = TABS_FULL, onTab, onBack }) {
  const [providers, setProviders] = usePvS(PV_SEED);
  const [view, setView] = usePvS({ type: 'hub' });
  const byId = (id) => providers.find((p) => p.id === id);

  if (view.type === 'detail') {
    return <ProviderDetail d={d} provider={byId(view.id)} onBack={() => setView({ type: 'hub' })} onEdit={() => setView({ type: 'edit', id: view.id })} onOpenItem={() => {}} />;
  }
  if (view.type === 'edit' || view.type === 'add') {
    const prov = view.type === 'edit' ? byId(view.id) : null;
    return <ProviderEdit d={d} provider={prov}
      onBack={() => setView(prov ? { type: 'detail', id: prov.id } : { type: 'hub' })}
      onSave={(p) => { setProviders((ps) => ps.some((x) => x.id === p.id) ? ps.map((x) => x.id === p.id ? p : x) : [...ps, p]); setView({ type: 'detail', id: p.id }); }}
      onDelete={(id) => { setProviders((ps) => ps.filter((x) => x.id !== id)); setView({ type: 'hub' }); }} />;
  }
  return <ProvidersHub d={d} providers={providers} tabs={tabs} currentTab="settings" onTab={onTab} onBack={onBack} onOpen={(id) => setView({ type: 'detail', id })} onAdd={() => setView({ type: 'add' })} />;
}

Object.assign(window, { ProvidersHub, ProviderDetail, ProviderEdit, ProvidersApp, PV_SEED });
