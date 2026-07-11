// ── Homehub · Marketing landing pages (3 versions) ───────────────────────────
// Full-length mobile marketing pages, each ending in sign-up. Three angles:
//   A · Calm / editorial  — warm, spacious, serif display, reassuring
//   B · Bold benefit      — dark hero, punchy, stats + feature grid
//   C · Utility / feature  — structured, feature-forward, how-it-works
// Each reuses a small in-app PhoneMock so the product feels real.

const LD_TEAL = '#1B6B5A', LD_INK = '#0B1220', LD_SUB = '#5A6663';
const LD_SERIF = 'Georgia, "Times New Roman", serif';

// ── Shared: a small live-looking app preview inside a phone ──────────────────
function PhoneMock({ scale = 1, tone = 'light' }) {
  return (
    <div style={{ width: 248 * scale, borderRadius: 34 * scale, background: '#0A0C0B', padding: 7 * scale, boxShadow: '0 30px 60px rgba(11,26,22,0.30)' }}>
      <div style={{ borderRadius: 28 * scale, overflow: 'hidden', background: '#F3F5F4' }}>
        {/* status + header */}
        <div style={{ padding: `${16 * scale}px ${15 * scale}px 0` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 * scale }}>
            <div style={{ width: 54 * scale, height: 8 * scale, borderRadius: 4 * scale, background: '#0A0C0B' }} />
            <div style={{ display: 'flex', gap: 3 * scale }}>{[0, 1, 2].map((i) => <div key={i} style={{ width: 4 * scale, height: 8 * scale, borderRadius: 1, background: '#9AA6A2' }} />)}</div>
          </div>
          <div style={{ fontSize: 9 * scale, fontWeight: 700, color: LD_TEAL, letterSpacing: 0.4 }}>TUESDAY</div>
          <div style={{ fontSize: 18 * scale, fontWeight: 800, color: LD_INK, letterSpacing: -0.5 }}>Good morning, Barb</div>
        </div>
        {/* hero task */}
        <div style={{ margin: `${12 * scale}px ${15 * scale}px`, background: '#fff', borderRadius: 16 * scale, boxShadow: '0 6px 18px rgba(11,26,22,0.08)', padding: 13 * scale }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 9 * scale }}>
            <span style={{ fontSize: 8 * scale, fontWeight: 700, color: '#C2410C', background: '#FFF1E8', borderRadius: 20, padding: `${3 * scale}px ${7 * scale}px`, letterSpacing: 0.3 }}>ESSENTIAL</span>
            <span style={{ fontSize: 8.5 * scale, fontWeight: 700, color: LD_TEAL }}>Today · 2 min</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 * scale }}>
            <div style={{ width: 34 * scale, height: 34 * scale, borderRadius: 11 * scale, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="wind" size={17 * scale} style={{ color: LD_TEAL }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13 * scale, fontWeight: 800, color: LD_INK, letterSpacing: -0.2 }}>Replace the HVAC filter</div>
              <div style={{ fontSize: 9.5 * scale, color: LD_SUB, marginTop: 2 * scale }}>Furnace &amp; A/C · Utility</div>
            </div>
            <div style={{ width: 22 * scale, height: 22 * scale, borderRadius: 11 * scale, border: `2px solid ${LD_TEAL}`, flexShrink: 0 }} />
          </div>
        </div>
        {/* agenda rows */}
        <div style={{ margin: `0 ${15 * scale}px ${16 * scale}px` }}>
          {[['refrigerator', 'Clean fridge coils', 'In 4 days'], ['utensils', 'Dishwasher clean cycle', 'In 9 days']].map(([ic, t, w]) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 9 * scale, padding: `${8 * scale}px 0` }}>
              <div style={{ width: 26 * scale, height: 26 * scale, borderRadius: 8 * scale, background: '#EEF2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={ic} size={13 * scale} style={{ color: LD_TEAL }} /></div>
              <div style={{ flex: 1, fontSize: 11.5 * scale, fontWeight: 600, color: LD_INK }}>{t}</div>
              <div style={{ fontSize: 9 * scale, color: '#9AA6A2', fontWeight: 600 }}>{w}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StarRow({ size = 14, color = '#E8B45A' }) {
  return <div style={{ display: 'inline-flex', gap: 2 }}>{[0, 1, 2, 3, 4].map((i) => <Icon key={i} name="star" size={size} style={{ color, fill: color }} />)}</div>;
}

function SignupRow({ dark, cta = 'Get started free', onGo }) {
  const border = dark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.14)';
  const fg = dark ? '#fff' : LD_INK;
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 9, background: dark ? 'rgba(255,255,255,0.08)' : '#fff', border: `1px solid ${border}`, borderRadius: 13, padding: '0 14px' }}>
          <Icon name="mail" size={16} style={{ color: dark ? 'rgba(255,255,255,0.6)' : '#9AA6A2', flexShrink: 0 }} />
          <input placeholder="you@email.com" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 15, color: fg, padding: '14px 0' }} />
        </div>
        <button onClick={onGo} style={{ flexShrink: 0, border: 'none', background: LD_TEAL, color: '#fff', borderRadius: 13, padding: '0 20px', height: 50, fontSize: 15, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{cta}</button>
      </div>
    </div>
  );
}

function TopBar({ dark }) {
  const fg = dark ? '#fff' : LD_INK;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(150deg,#1B6B5A,#2D9B82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="house" size={17} strokeWidth={2} style={{ color: '#fff' }} /></div>
        <span style={{ fontSize: 17, fontWeight: 800, color: fg, letterSpacing: -0.3 }}>Homehub</span>
      </div>
      <button style={{ border: 'none', background: 'transparent', color: dark ? 'rgba(255,255,255,0.85)' : LD_TEAL, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Sign in</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// VERSION A — Calm / editorial
// ════════════════════════════════════════════════════════════════════════════
function LandingCalm({ d }) {
  const PAD = 24;
  return (
    <div style={{ width: '100%', background: '#F6F3EC', fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif', color: LD_INK }}>
      <TopBar />
      {/* hero */}
      <div style={{ padding: `36px ${PAD}px 8px` }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #E7E0D0', borderRadius: 99, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: LD_SUB, marginBottom: 22 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: LD_TEAL }} /> The calm home-care app
        </div>
        <h1 style={{ fontFamily: LD_SERIF, fontSize: 42, fontWeight: 600, color: LD_INK, letterSpacing: -1, lineHeight: 1.08, margin: 0, textWrap: 'balance' }}>Your home, finally in order.</h1>
        <p style={{ fontSize: 17, color: LD_SUB, lineHeight: 1.5, margin: '18px 0 26px', maxWidth: 330 }}>Homehub quietly keeps track of every appliance, manual and warranty — and tells you what needs doing, right when it matters.</p>
        <SignupRow />
      </div>
      {/* phone */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '34px 0 40px', background: 'linear-gradient(180deg,#F6F3EC,#EFEADF)' }}>
        <PhoneMock scale={1.18} />
      </div>
      {/* value props */}
      <div style={{ padding: `8px ${PAD}px 4px` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: LD_TEAL, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 18 }}>Why people love it</div>
        {[
          { icon: 'camera', t: 'Add anything in seconds', s: 'Snap a photo or scan the label — we pull the model, manual and the upkeep it needs.' },
          { icon: 'bell-ring', t: 'Nothing slips through', s: 'Gentle, well-timed reminders for filters, flushes and seasonal jobs — never a wall of alerts.' },
          { icon: 'sparkles', t: 'Answers from your own manuals', s: 'Ask anything about your home and get a clear answer, grounded in the docs you actually own.' },
        ].map((v, i) => (
          <div key={v.t} style={{ display: 'flex', gap: 15, padding: '20px 0', borderTop: i ? '1px solid #E7E0D0' : 'none' }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: '#fff', border: '1px solid #E7E0D0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={v.icon} size={22} style={{ color: LD_TEAL }} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: LD_INK, letterSpacing: -0.3 }}>{v.t}</div>
              <div style={{ fontSize: 14.5, color: LD_SUB, lineHeight: 1.5, marginTop: 5 }}>{v.s}</div>
            </div>
          </div>
        ))}
      </div>
      {/* testimonial */}
      <div style={{ margin: `28px ${PAD}px`, background: '#fff', border: '1px solid #E7E0D0', borderRadius: 22, padding: 26 }}>
        <StarRow />
        <p style={{ fontFamily: LD_SERIF, fontSize: 21, color: LD_INK, lineHeight: 1.4, margin: '14px 0 18px', letterSpacing: -0.3 }}>“It's the first app that made owning a home feel calm instead of like a second job.”</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#5B748F,#8AA2B8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 }}>R</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: LD_INK }}>Rachel M.</div>
            <div style={{ fontSize: 12.5, color: LD_SUB }}>Homeowner · 2 years</div>
          </div>
        </div>
      </div>
      {/* closing CTA */}
      <div style={{ padding: `8px ${PAD}px 44px` }}>
        <h2 style={{ fontFamily: LD_SERIF, fontSize: 30, fontWeight: 600, color: LD_INK, letterSpacing: -0.6, margin: '0 0 16px', lineHeight: 1.15 }}>Start with one item today.</h2>
        <SignupRow />
        <div style={{ marginTop: 34, paddingTop: 22, borderTop: '1px solid #E7E0D0', display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: LD_SUB }}>
          <span>© Homehub</span><span>Privacy · Terms</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// VERSION B — Bold benefit (dark hero)
// ════════════════════════════════════════════════════════════════════════════
function LandingBold({ d }) {
  const PAD = 24;
  return (
    <div style={{ width: '100%', background: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif', color: LD_INK }}>
      {/* dark hero */}
      <div style={{ background: 'radial-gradient(120% 80% at 50% 0%, #1B6B5A 0%, #0E1B17 60%)', color: '#fff', paddingBottom: 40 }}>
        <TopBar dark />
        <div style={{ padding: `40px ${PAD}px 0` }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 99, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 22 }}>
            <StarRow size={11} /> 4.9 · 12,000+ homes
          </div>
          <h1 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1.04, margin: 0, textWrap: 'balance' }}>Stop chasing your home’s to-do list.</h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.78)', lineHeight: 1.5, margin: '18px 0 26px', maxWidth: 330 }}>Homehub tracks every appliance and tells you exactly what to do, when — so maintenance stops piling up into expensive surprises.</p>
          <SignupRow dark cta="Get started" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 38 }}><PhoneMock scale={1.2} /></div>
      </div>
      {/* stats */}
      <div style={{ display: 'flex', padding: `26px ${PAD}px`, borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
        {[['$2,400', 'saved a year, on average'], ['38', 'tasks tracked per home'], ['3 min', 'to set up']].map(([n, l], i) => (
          <div key={l} style={{ flex: 1, textAlign: 'center', borderLeft: i ? '1px solid rgba(15,23,42,0.08)' : 'none', padding: '0 6px' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: LD_TEAL, letterSpacing: -0.6 }}>{n}</div>
            <div style={{ fontSize: 11.5, color: LD_SUB, marginTop: 4, lineHeight: 1.3 }}>{l}</div>
          </div>
        ))}
      </div>
      {/* feature grid */}
      <div style={{ padding: `34px ${PAD}px 8px` }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.7, margin: '0 0 6px' }}>Everything your home needs.</h2>
        <p style={{ fontSize: 15, color: LD_SUB, margin: '0 0 22px' }}>One app instead of a drawer full of manuals.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { icon: 'package', t: 'Smart inventory', s: 'Every appliance, scanned and organized by room.' },
            { icon: 'list-checks', t: 'Upkeep on autopilot', s: 'The right schedule, built from your models.' },
            { icon: 'shield-check', t: 'Warranty radar', s: 'Never miss a coverage window again.' },
            { icon: 'sparkles', t: 'Ask anything', s: 'Manual-grounded answers in seconds.' },
          ].map((f) => (
            <div key={f.t} style={{ background: '#F7F8F8', border: '1px solid rgba(15,23,42,0.07)', borderRadius: 18, padding: 18 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Icon name={f.icon} size={20} style={{ color: LD_TEAL }} /></div>
              <div style={{ fontSize: 16, fontWeight: 800, color: LD_INK, letterSpacing: -0.3 }}>{f.t}</div>
              <div style={{ fontSize: 13, color: LD_SUB, lineHeight: 1.45, marginTop: 5 }}>{f.s}</div>
            </div>
          ))}
        </div>
      </div>
      {/* closing CTA band */}
      <div style={{ margin: `34px ${PAD}px 40px`, background: 'linear-gradient(150deg,#1B6B5A,#0E1B17)', borderRadius: 26, padding: 30, color: '#fff' }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.7, margin: '0 0 8px', lineHeight: 1.1 }}>Get ahead this weekend.</h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.78)', margin: '0 0 20px', lineHeight: 1.5 }}>Add your first item in two minutes and let Homehub take it from there.</p>
        <SignupRow dark cta="Start free" />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// VERSION C — Utility / feature-forward
// ════════════════════════════════════════════════════════════════════════════
function LandingUtility({ d }) {
  const PAD = 24;
  const Feature = ({ icon, kicker, t, s, flip }) => (
    <div style={{ display: 'flex', flexDirection: flip ? 'row-reverse' : 'row', alignItems: 'center', gap: 16, padding: '18px 0' }}>
      <div style={{ width: 76, height: 76, borderRadius: 20, background: '#EAF3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={34} strokeWidth={1.6} style={{ color: LD_TEAL }} /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: LD_TEAL, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>{kicker}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: LD_INK, letterSpacing: -0.3 }}>{t}</div>
        <div style={{ fontSize: 14, color: LD_SUB, lineHeight: 1.5, marginTop: 4 }}>{s}</div>
      </div>
    </div>
  );
  return (
    <div style={{ width: '100%', background: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif', color: LD_INK }}>
      {/* dark hero (B-style contrast) */}
      <div style={{ background: 'radial-gradient(120% 80% at 50% 0%, #1B6B5A 0%, #0E1B17 60%)', color: '#fff', paddingBottom: 40 }}>
        <TopBar dark />
        <div style={{ padding: `34px ${PAD}px 0`, textAlign: 'center' }}>
          <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: -1, lineHeight: 1.1, margin: 0, textWrap: 'balance' }}>Everything your home needs, in one place.</h1>
          <p style={{ fontSize: 16.5, color: 'rgba(255,255,255,0.78)', lineHeight: 1.5, margin: '16px auto 24px', maxWidth: 340 }}>Items, manuals, warranties, maintenance and a built-in assistant — organized to effortlessly care for your home.</p>
          <div style={{ maxWidth: 380, margin: '0 auto' }}><SignupRow dark cta="Get started" /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 38 }}><PhoneMock scale={1.15} /></div>
      </div>
      {/* feature list */}
      <div style={{ padding: `8px ${PAD}px`, background: '#F7F8F8' }}>
        <div style={{ padding: '28px 0 6px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.6, margin: 0 }}>Built around your home</h2>
        </div>
        <Feature icon="package" kicker="Inventory" t="Every appliance, organized" s="Scan a label or snap a photo. Homehub identifies the model and files it by room." />
        <div style={{ height: 1, background: 'rgba(15,23,42,0.07)' }} />
        <Feature icon="list-checks" kicker="Maintenance" t="A schedule that builds itself" flip s="From your real manuals, not generic advice — with calm reminders so nothing slips." />
        <div style={{ height: 1, background: 'rgba(15,23,42,0.07)' }} />
        <Feature icon="shield-check" kicker="Warranties" t="Coverage you won't forget" s="See what's protected and what's lapsing soon, all in one tidy list." />
        <div style={{ height: 1, background: 'rgba(15,23,42,0.07)' }} />
        <Feature icon="sparkles" kicker="Ask" t="Answers from your manuals" flip s="Ask a question to any item's manual and get a clear, sourced answer in seconds." />
        <div style={{ height: 24 }} />
      </div>
      {/* how it works */}
      <div style={{ padding: `34px ${PAD}px 6px` }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.6, margin: '0 0 20px', textAlign: 'center' }}>Up and running in minutes</h2>
        {[
          ['1', 'Add your home’s items', 'Photo, scan, or search — a few taps each.'],
          ['2', 'We build the care plan', 'Tailored to your manuals and your home.'],
          ['3', 'Stay ahead, calmly', 'Get proactive reminders on maintenance tasks.'],
        ].map(([n, t, s], i, arr) => (
          <div key={n} style={{ display: 'flex', gap: 15, paddingBottom: i === arr.length - 1 ? 0 : 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: LD_TEAL, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{n}</div>
              {i < arr.length - 1 && <div style={{ flex: 1, width: 2, background: 'rgba(15,23,42,0.1)', marginTop: 4 }} />}
            </div>
            <div style={{ paddingTop: 4 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: LD_INK, letterSpacing: -0.3 }}>{t}</div>
              <div style={{ fontSize: 14, color: LD_SUB, lineHeight: 1.5, marginTop: 3 }}>{s}</div>
            </div>
          </div>
        ))}
      </div>
      {/* sign-up card */}
      <div style={{ padding: `30px ${PAD}px 44px` }}>
        <div style={{ background: 'linear-gradient(150deg,#1B6B5A,#0E1B17)', borderRadius: 24, padding: 28, color: '#fff', textAlign: 'center' }}>
          <h2 style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.5, margin: '0 0 8px' }}>Create your free account</h2>
          <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.74)', margin: '0 0 20px', lineHeight: 1.5 }}>Join 12,000 homeowners staying ahead of upkeep.</p>
          <SignupRow dark cta="Sign up" />
        </div>
        <div style={{ marginTop: 26, textAlign: 'center', fontSize: 12.5, color: LD_SUB }}>© Homehub · Privacy · Terms</div>
      </div>
    </div>
  );
}

Object.assign(window, { LandingCalm, LandingBold, LandingUtility, PhoneMock });
