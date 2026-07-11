// ── Homehub · task how-to detail ────────────────────────────────────────────
// The payoff of opening a task: why it matters, what you need, the steps, and
// the line from the manual that backs it up. Written plainly for a non-expert.

const HH_DETAIL = {
  s1: {
    why: 'A clogged filter makes the furnace work harder — higher bills, more wear, dustier air.',
    supplies: [{ name: '16×25×1 filter', spec: 'MERV 11' }],
    time: 2,
    steps: [
      'Switch the thermostat to Off.',
      'Find the filter slot by the return vent and slide the old one out.',
      'Check the airflow arrow — it points toward the furnace.',
      'Slide the new filter in, arrow pointing inward.',
      'Switch the thermostat back on.',
    ],
    manual: { quote: 'Replace every 90 days under normal use; every 30–60 days with pets or allergies.', src: 'Furnace manual · p.14' },
  },
  s2: {
    why: 'Dusty coils trap heat, so the fridge runs longer and the motor ages faster.',
    supplies: [{ name: 'Coil brush', spec: 'or vacuum crevice tool' }],
    time: 15,
    steps: [
      'Unplug the refrigerator.',
      'Pop off the kick plate at the bottom front.',
      'Brush and vacuum the coils until dust is gone.',
      'Refit the kick plate and plug back in.',
    ],
    manual: { quote: 'Clean the condenser coils twice a year to maintain cooling efficiency.', src: 'LG Refrigerator manual · p.22' },
  },
  s3: {
    why: 'A monthly clean cycle clears grease and limescale so dishes actually come out clean.',
    supplies: [{ name: 'Dishwasher cleaner', spec: '1 tablet' }],
    time: 5,
    steps: [
      'Empty the dishwasher completely.',
      'Place a cleaner tablet in the detergent cup.',
      'Run the hottest / longest cycle.',
    ],
    manual: { quote: 'Run a cleaning cycle monthly using a dishwasher-safe cleaner to prevent buildup.', src: 'Bosch Dishwasher manual · p.31' },
  },
};
function hhDetail(id) {
  return HH_DETAIL[id] || { why: '', supplies: [], time: 5, steps: [], manual: null };
}

// ── Informative notices ─────────────────────────────────────────────────────
// Not tasks — things worth knowing, surfaced calmly. Deliberately phrased as
// helpful FYIs, never as red-alert warnings.
const HH_NOTICES = [
  {
    id: 'n-recall', kind: 'recall', item: 'dish',
    title: 'Safety update for your dishwasher',
    body: 'Bosch issued a recall on some 300-series units. Takes a minute to check if yours is included.',
    action: 'Check my model',
  },
  {
    id: 'n-warranty', kind: 'warranty', item: 'fridge',
    title: 'Fridge warranty ends in 21 days',
    body: 'Your LG Refrigerator’s coverage runs out Jul 9 — worth a look while it’s still active.',
    action: 'View warranty',
  },
];

Object.assign(window, { HH_DETAIL, hhDetail, HH_NOTICES });
