// ── Homehub · shared data + density tokens ───────────────────────────────────
// Simple-home ("essentials") dataset: a first-time user with a handful of items
// and only the tasks that genuinely need them. Everything here is meant to be
// relevant, useful and timely — no vanity metrics, no filler.

// ── Density tokens ────────────────────────────────────────────────────────────
// The one global, fully-wired tweak. Every direction reads `d` and scales its
// own spacing/type from it, so "Spacious / Cozy / Compact" is a real layout
// change, not a font-size hack.
const DENSITY = {
  spacious: { pad: 24, gap: 16, rowPy: 17, cardPad: 21, stack: 22, big: 36, h2: 21, body: 16, small: 13.5, tap: 30, radius: 24, dot: 9 },
  cozy:     { pad: 20, gap: 12, rowPy: 13, cardPad: 17, stack: 17, big: 33, h2: 19, body: 15, small: 12.5, tap: 27, radius: 20, dot: 8 },
  compact:  { pad: 16, gap: 8,  rowPy: 9,  cardPad: 13, stack: 12, big: 28, h2: 17, body: 14, small: 11.5, tap: 23, radius: 16, dot: 7 },
};
function dens(name) { return DENSITY[name] || DENSITY.cozy; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function hhGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
function hhToday() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function hhShortDate(offset = 0) {
  const dt = new Date();
  dt.setDate(dt.getDate() + offset);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
// Natural-language due label — calm, never alarmist unless truly overdue.
function dueLabel(due) {
  if (due < 0) return `${Math.abs(due)} day${Math.abs(due) === 1 ? '' : 's'} overdue`;
  if (due === 0) return 'Today';
  if (due === 1) return 'Tomorrow';
  if (due <= 7) return `In ${due} days`;
  return hhShortDate(due);
}

// ── Items (kitchen-table reality of a small home) ──────────────────────────────
const HH_ITEMS = [
  { id: 'hvac',   name: 'Furnace & A/C',    short: 'HVAC',         room: 'Utility', icon: 'wind',            category: 'Climate',    brand: 'Carrier', model: '59TP6A080',     serial: 'CAR59TP-0421',  purchased: 'Mar 2021',     warranty: { ends: 'Mar 2027', active: true } },
  { id: 'fridge', name: 'LG Refrigerator',  short: 'Fridge',       room: 'Kitchen', icon: 'refrigerator',    category: 'Appliances', brand: 'LG',      model: 'LRFVS3006S',    serial: '902KRWX1A47',   purchased: 'Jul 9, 2025',  warranty: { ends: 'Jul 9, 2026', active: true, soon: true } },
  { id: 'dish',   name: 'Bosch Dishwasher', short: 'Dishwasher',   room: 'Kitchen', icon: 'utensils',        category: 'Appliances', brand: 'Bosch',   model: 'SHEM63W55N',    serial: 'FD9803K2210',   purchased: 'May 2024',     warranty: { ends: 'May 2025', active: false } },
  { id: 'washer', name: 'Samsung Washer',   short: 'Washer',       room: 'Laundry', icon: 'washing-machine', category: 'Appliances', brand: 'Samsung', model: 'WF45T6000AW',   serial: '0H8M7AKT900',   purchased: 'Aug 2023',     warranty: { ends: 'Aug 2024', active: false } },
  { id: 'water',  name: 'Water Heater',     short: 'Water heater', room: 'Utility', icon: 'flame',           category: 'Plumbing',   brand: 'Rheem',   model: 'XE40M06ST45U1', serial: 'RHE4006ST112',  purchased: 'Nov 2020',     warranty: { ends: 'Nov 2026', active: true } },
];
function hhItem(id) { return HH_ITEMS.find((i) => i.id === id) || { name: id, short: id, room: '', icon: 'box' }; }

// ── Tasks · SIMPLE state ────────────────────────────────────────────────────────
// Only essentials + one recommended. Just enough that the home stays healthy.
const HH_TASKS = [
  { id: 's1', name: 'Replace the HVAC filter',     item: 'hvac',   due: 0,  mins: 2,  tier: 'essential' },
  { id: 's2', name: 'Clean refrigerator coils',    item: 'fridge', due: 4,  mins: 15, tier: 'essential' },
  { id: 's3', name: 'Run a dishwasher clean cycle', item: 'dish',  due: 9,  mins: 5,  tier: 'recommended' },
];

// ── Tasks · ENGAGED state (the unfold) ─────────────────────────────────────────
// More items in the home → more surfaces, one thing slips overdue, warranty
// windows start to matter. Still calm, but fuller.
const HH_TASKS_ENGAGED = [
  { id: 'e1', name: 'Replace the HVAC filter',      item: 'hvac',   due: -3, mins: 2,  tier: 'essential' },
  { id: 'e2', name: 'Flush the water heater',       item: 'water',  due: 0,  mins: 30, tier: 'essential' },
  { id: 'e3', name: 'Clean refrigerator coils',     item: 'fridge', due: 2,  mins: 15, tier: 'essential' },
  { id: 'e4', name: 'Clean the washer gasket',      item: 'washer', due: 5,  mins: 10, tier: 'recommended' },
  { id: 'e5', name: 'Run a dishwasher clean cycle', item: 'dish',   due: 6,  mins: 5,  tier: 'recommended' },
  { id: 'e6', name: 'Descale the coffee maker',     item: 'fridge', due: 11, mins: 20, tier: 'optional' },
];

// A warranty worth surfacing once the home is fuller (timely, not noise).
const HH_WARRANTY = { item: 'fridge', label: 'LG Refrigerator', days: 21 };

// ── Ask suggestions (the AI assistant entry) ───────────────────────────────────
const HH_ASKS = [
  'How do I clean the range hood filter?',
  'When is my HVAC filter due again?',
  'My dishwasher won’t drain — what now?',
  'What size filter does my furnace take?',
];

// Tier accent — semantic, restrained. Essential reads as "worth your attention",
// not "danger". Used sparingly as a 2px rail or a small dot, never a fill.
const TIER = {
  essential:   { dot: '#C2410C', soft: '#FFF1E8', label: 'Essential' },
  recommended: { dot: '#1B6B5A', soft: '#E8F2EF', label: 'Recommended' },
  optional:    { dot: '#94A3B8', soft: '#F1F5F9', label: 'Optional' },
};

Object.assign(window, {
  DENSITY, dens, hhGreeting, hhToday, hhShortDate, dueLabel,
  HH_ITEMS, hhItem, HH_TASKS, HH_TASKS_ENGAGED, HH_WARRANTY, HH_ASKS, TIER,
});
