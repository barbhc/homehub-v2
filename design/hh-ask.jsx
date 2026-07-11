// ── Homehub · Ask tab ────────────────────────────────────────────────────────
// The home assistant, grounded in the user's own manuals. Every conversation
// has a SCOPE — the whole home, or one item — so answers cite the right manual
// and good answers can be saved straight back onto that item. Surfaces: a calm
// launcher (scope · field · starters · recent), the conversation, and a scope
// picker sheet.

const { useState: useAkS } = React;

const AK_INK = '#0B1220', AK_SUB = '#6B7280', AK_TEAL = '#1B6B5A', AK_BG = '#F3F5F4';

// Per-item demo exchange, so scoping visibly changes what Ask talks about.
const ASK_DEMO = {
  dish:   { q: 'Why won’t my dishwasher drain?', intro: 'Usually a blockage rather than a fault. For your', steps: ['Check the drain hose for kinks behind the unit.', 'Clean the filter at the bottom of the tub.', 'Run the rinse-only cycle to clear standing water.'], quote: 'If water remains, clean the filter and check the drain hose before requesting service.', src: 'Dishwasher manual · p.31', follow: ['Still not draining', 'Where’s the filter?'] },
  fridge: { q: 'How do I replace the water filter?', intro: 'Quick job on your', steps: ['Find the filter in the upper-right interior.', 'Turn it counter-clockwise and pull it out.', 'Insert a new LT1000P and turn clockwise.', 'Run 2.5 gallons through to clear it.'], quote: 'Replace the filter every 6 months to maintain water and ice quality.', src: 'LG manual · p.22', follow: ['Which filter do I buy?', 'Reset the filter light'] },
  hvac:   { q: 'How often should I change the filter?', intro: 'Here’s the rule of thumb for your', steps: ['Switch the thermostat off.', 'Slide the old filter out by the return vent.', 'Insert the new one, arrow toward the furnace.'], quote: 'Replace every 90 days under normal use; every 30–60 with pets or allergies.', src: 'Furnace manual · p.14', follow: ['What size filter?', 'Set a reminder'] },
  washer: { q: 'How do I clear the musty smell?', intro: 'Common with front-loaders like your', steps: ['Run a monthly tub-clean cycle.', 'Wipe out the door gasket.', 'Leave the door ajar between loads.'], quote: 'Leave the door open after use to air-dry the drum.', src: 'Samsung manual · p.41', follow: ['Best tub cleaner?', 'Set monthly reminder'] },
  water:  { q: 'How do I flush the tank?', intro: 'Once-a-year maintenance for your', steps: ['Turn off power and the cold supply.', 'Attach a hose to the drain valve.', 'Open the valve and a hot tap to drain.', 'Refill before restoring power.'], quote: 'Flush the tank annually to reduce sediment build-up.', src: 'Rheem manual · p.18', follow: ['How often?', 'Is it safe to DIY?'] },
};
function askDemo(scope) { return ASK_DEMO[scope] || ASK_DEMO.dish; }
function askScopeLabel(scope) { return scope ? hhItem(scope).name : 'Across your home'; }

const AK_RECENT = [
  { q: 'How do I clean the range hood filter?', scope: null },
  { q: 'What size filter does my furnace take?', scope: 'hvac' },
  { q: 'Reset the dishwasher cycle', scope: 'dish' },
];

// ── Scope chip + picker ──────────────────────────────────────────────────────
function ScopeChip({ d, scope, onClick, tone }) {
  const dark = tone === 'dark';
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${dark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.12)'}`, background: dark ? 'rgba(255,255,255,0.08)' : '#fff', color: dark ? '#fff' : AK_INK, borderRadius: 99, padding: '6px 11px', fontSize: d.small + 1, fontWeight: 600, cursor: 'pointer' }}>
      <Icon name={scope ? hhItem(scope).icon : 'house'} size={14} style={{ color: AK_TEAL }} />
      {askScopeLabel(scope)}
      <Icon name="chevron-down" size={14} style={{ color: dark ? 'rgba(255,255,255,0.6)' : '#94A3B8' }} />
    </button>
  );
}

function ScopePicker({ d, scope, onPick, onClose }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(11,18,32,0.34)' }} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: '22px 22px 0 0', padding: `10px ${d.pad}px calc(16px + env(safe-area-inset-bottom))`, maxHeight: '74%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(15,23,42,0.16)', margin: '0 auto 12px' }} />
        <div style={{ fontSize: d.body + 1, fontWeight: 800, color: AK_INK, letterSpacing: -0.3, marginBottom: 4 }}>What should I focus on?</div>
        <div style={{ fontSize: d.small + 1, color: AK_SUB, marginBottom: d.gap + 2 }}>Pick an item to ground answers in its manual.</div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {[{ id: null, name: 'Across your home', icon: 'house', sub: 'General help' }, ...HH_ITEMS.map((it) => ({ id: it.id, name: it.name, icon: it.icon, sub: `${it.brand} · ${itemExtras(it.id).manuals.length ? 'manual ready' : 'no manual yet'}` }))].map((o, i) => {
            const on = scope === o.id;
            return (
              <button key={o.id || 'home'} onClick={() => onPick(o.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'transparent', borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none', padding: `${d.rowPy}px 2px`, textAlign: 'left', cursor: 'pointer' }}>
                <ItemGlyph icon={o.icon} size={d.tap + 8} bg={on ? AK_TEAL : '#EEF2F1'} fg={on ? '#fff' : AK_TEAL} radius={11} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: d.body, fontWeight: 600, color: AK_INK }}>{o.name}</div>
                  <div style={{ fontSize: d.small, color: AK_SUB, marginTop: 1 }}>{o.sub}</div>
                </div>
                {on && <Icon name="check" size={18} strokeWidth={3} style={{ color: AK_TEAL }} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Launcher ─────────────────────────────────────────────────────────────────
function AskLauncher({ d, scope, onScope, onStart, tabs, current, onTab }) {
  const [picker, setPicker] = useAkS(false);
  return (
    <Screen bg={AK_BG}>
      <div style={{ padding: `10px ${d.pad}px 0` }}>
        <h1 style={{ fontSize: d.big, fontWeight: 800, color: AK_INK, letterSpacing: -0.7, margin: 0 }}>Ask</h1>
        <p style={{ fontSize: d.body, color: AK_SUB, margin: '4px 0 0' }}>Your home assistant — grounded in your manuals.</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 0` }}>
        {/* scope */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: d.small + 0.5, color: AK_SUB, fontWeight: 600 }}>Asking about</span>
          <ScopeChip d={d} scope={scope} onClick={() => setPicker(true)} />
        </div>

        {/* field */}
        <div onClick={onStart} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid rgba(15,23,42,0.10)', borderRadius: 15, padding: '13px 13px 13px 15px', boxShadow: '0 2px 10px rgba(15,23,42,0.05)', cursor: 'pointer', marginBottom: d.stack }}>
          <Icon name="sparkles" size={18} style={{ color: AK_TEAL }} />
          <span style={{ flex: 1, fontSize: d.body, color: '#8A9994' }}>{scope ? `Ask about your ${hhItem(scope).short || hhItem(scope).name}…` : 'Ask about your home…'}</span>
          <div style={{ width: d.tap, height: d.tap, borderRadius: '50%', background: AK_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="arrow-up" size={16} strokeWidth={2.6} style={{ color: '#fff' }} /></div>
        </div>

        {/* launchers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: d.gap, marginBottom: d.stack }}>
          <button onClick={onStart} style={{ display: 'flex', alignItems: 'center', gap: 13, background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: d.radius - 4, padding: d.cardPad, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ width: d.tap + 10, height: d.tap + 10, borderRadius: 12, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="wrench" size={20} style={{ color: AK_TEAL }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: d.body, fontWeight: 700, color: AK_INK, letterSpacing: -0.2 }}>Troubleshoot</div>
              <div style={{ fontSize: d.small, color: AK_SUB, marginTop: 1 }}>Something’s not working</div>
            </div>
            <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4' }} />
          </button>
          <button onClick={() => setPicker(true)} style={{ display: 'flex', alignItems: 'center', gap: 13, background: '#fff', border: '1px solid rgba(15,23,42,0.08)', borderRadius: d.radius - 4, padding: d.cardPad, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ width: d.tap + 10, height: d.tap + 10, borderRadius: 12, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="book-open" size={20} style={{ color: AK_TEAL }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: d.body, fontWeight: 700, color: AK_INK, letterSpacing: -0.2 }}>Ask a manual</div>
              <div style={{ fontSize: d.small, color: AK_SUB, marginTop: 1 }}>Pick an item, search its docs</div>
            </div>
            <Icon name="chevron-right" size={18} style={{ color: '#C2CBD4' }} />
          </button>
        </div>

        {/* recent */}
        <div style={{ fontSize: 12, fontWeight: 700, color: AK_SUB, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2 }}>Recent</div>
        <div style={{ background: '#fff', borderRadius: d.radius - 4, boxShadow: '0 1px 2px rgba(15,23,42,0.05)', overflow: 'hidden' }}>
          {AK_RECENT.map((r, i) => (
            <button key={r.q} onClick={() => { onScope(r.scope); onStart(); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: `${d.rowPy}px ${d.cardPad}px`, background: '#fff', border: 'none', borderTop: i ? '0.5px solid rgba(15,23,42,0.07)' : 'none', textAlign: 'left', cursor: 'pointer' }}>
              <Icon name="clock" size={15} style={{ color: '#9AA6A2', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: d.body - 0.5, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.q}</div>
                {r.scope && <div style={{ fontSize: d.small - 0.5, color: '#9AA6A2', marginTop: 1 }}>{hhItem(r.scope).name}</div>}
              </div>
              <Icon name="arrow-up-right" size={15} style={{ color: '#C2CBD4' }} />
            </button>
          ))}
        </div>
        <div style={{ height: d.pad }} />
      </div>

      {picker && <ScopePicker d={d} scope={scope} onPick={(s) => { onScope(s); setPicker(false); }} onClose={() => setPicker(false)} />}
      <TabBar tabs={tabs} current={current} onSelect={onTab} accent={AK_TEAL} solidBg="rgba(243,245,244,0.85)" />
    </Screen>
  );
}

// ── Conversation ─────────────────────────────────────────────────────────────
function AskConversation({ d, scope, onScope, onSave, onBack, tabs, current, onTab }) {
  const [picker, setPicker] = useAkS(false);
  const [saved, setSaved] = useAkS(false);
  const targetItem = scope || 'dish';
  const it = hhItem(targetItem);
  const demo = askDemo(targetItem);

  const doSave = () => {
    if (saved) return;
    onSave && onSave({ id: 'k-' + Date.now(), q: demo.q, a: demo.steps.join(' '), item: targetItem, source: 'ai' });
    setSaved(true);
  };

  return (
    <Screen bg="#FFFFFF" padBottom={TAB_H + 64}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: `2px ${d.pad - 6}px 8px`, borderBottom: '0.5px solid rgba(15,23,42,0.06)' }}>
        <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: 'none', background: 'transparent', color: AK_TEAL, fontSize: d.body + 1, fontWeight: 600, padding: '6px 4px', flexShrink: 0 }}>
          <Icon name="chevron-left" size={22} strokeWidth={2.4} />
        </button>
        <ScopeChip d={d} scope={scope} onClick={() => setPicker(true)} />
        <button style={{ border: 'none', background: 'transparent', color: AK_TEAL, padding: '6px 8px', flexShrink: 0 }}><Icon name="square-pen" size={19} /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${d.stack}px ${d.pad}px 0`, display: 'flex', flexDirection: 'column', gap: d.stack }}>
        <div style={{ alignSelf: 'flex-end', maxWidth: '82%', background: AK_TEAL, color: '#fff', borderRadius: '16px 16px 4px 16px', padding: '11px 15px', fontSize: d.body }}>{demo.q}</div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: d.tap, height: d.tap, borderRadius: '50%', background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}><Icon name="sparkles" size={16} style={{ color: AK_TEAL }} /></div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: d.body, color: '#26302D', lineHeight: 1.5, textWrap: 'pretty' }}>{demo.intro} <strong>{it.brand} {it.model}</strong>, try these in order:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {demo.steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ width: 21, height: 21, borderRadius: 11, background: '#EAF3EF', color: AK_TEAL, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                  <span style={{ fontSize: d.body, color: '#26302D', lineHeight: 1.4 }}>{s}</span>
                </div>
              ))}
            </div>
            <div style={{ borderLeft: `3px solid ${AK_TEAL}`, background: '#EEF4F2', borderRadius: '0 12px 12px 0', padding: '10px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <Icon name="book-open" size={14} style={{ color: AK_TEAL }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: AK_TEAL, letterSpacing: 0.5, textTransform: 'uppercase' }}>From your {it.short || it.name} manual</span>
              </div>
              <div style={{ fontSize: d.small + 1.5, color: '#2B3A36', lineHeight: 1.45, fontStyle: 'italic' }}>“{demo.quote}”</div>
              <div style={{ fontSize: d.small, color: AK_SUB, marginTop: 4 }}>{demo.src}</div>
            </div>

            {/* save + follow-ups */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button onClick={doSave} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: saved ? '1px solid rgba(27,107,90,0.3)' : 'none', background: saved ? '#E8F2EF' : AK_TEAL, color: saved ? AK_TEAL : '#fff', borderRadius: 99, padding: '8px 14px', fontSize: d.small + 0.5, fontWeight: 700, cursor: 'pointer' }}>
                <Icon name={saved ? 'check' : 'bookmark'} size={14} strokeWidth={saved ? 3 : 2} /> {saved ? `Saved to ${it.short || it.name}` : `Save to ${it.short || it.name}`}
              </button>
              {demo.follow.map((f) => (
                <button key={f} style={{ border: `1px solid rgba(27,107,90,0.25)`, background: '#fff', color: AK_TEAL, borderRadius: 99, padding: '7px 13px', fontSize: d.small + 0.5, fontWeight: 600, cursor: 'pointer' }}>{f}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: TAB_H, padding: `10px ${d.pad}px`, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(18px)', borderTop: '0.5px solid rgba(15,23,42,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F4F6F5', borderRadius: 14, padding: '10px 10px 10px 15px' }}>
          <span style={{ flex: 1, fontSize: d.body, color: '#8A9994' }}>Reply…</span>
          <div style={{ width: d.tap, height: d.tap, borderRadius: '50%', background: AK_TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="arrow-up" size={16} strokeWidth={2.6} style={{ color: '#fff' }} /></div>
        </div>
      </div>

      {picker && <ScopePicker d={d} scope={scope} onPick={(s) => { onScope(s); setSaved(false); setPicker(false); }} onClose={() => setPicker(false)} />}
      <TabBar tabs={tabs} current={current} onSelect={onTab} accent={AK_TEAL} solidBg="rgba(255,255,255,0.9)" />
    </Screen>
  );
}

function AskTab({ d, initialMode = 'launcher', initialScope = null, tabs = TABS_FULL, current = 'ask', onTab, onSave }) {
  const [mode, setMode] = useAkS(initialMode);
  const [scope, setScope] = useAkS(initialScope);
  return mode === 'conversation'
    ? <AskConversation d={d} scope={scope} onScope={setScope} onSave={onSave} onBack={() => setMode('launcher')} tabs={tabs} current={current} onTab={onTab} />
    : <AskLauncher d={d} scope={scope} onScope={setScope} onStart={() => setMode('conversation')} tabs={tabs} current={current} onTab={onTab} />;
}

Object.assign(window, { AskTab, AskLauncher, AskConversation, ScopePicker, askScopeLabel });
