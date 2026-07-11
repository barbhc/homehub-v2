# Desktop Warranties — fixes to match the redesign

**Scope:** the desktop **Warranties** tab.
**Source of truth:** `Homehub Desktop.html` → `dt-screens-c.jsx`, component **`DesktopWarranties`** (data: `HH_ITEMS` filtered by `it.warranty`).

Structure is right (header, 3 stat cards, grouped lists, empty groups hidden). Three fixes — #1 is the recurring data-binding bug (see `data-binding-pattern.md`).

---

## 1. Row subtitle is the full warranty legal text — fix first
Each row's secondary line is showing raw warranty terms ("The Beast B10 Blender is warranted to be free from defects in material and workmanship f…"). The spec subtitle is **concise metadata: `{brand} · {room}`** (e.g. "Beast · Kitchen"). Bind the subtitle to `it.brand · it.room`, NOT the warranty prose. (Same class of bug as Home guides / Item specs / Tasks — see `data-binding-pattern.md`.) The full terms live in the item's warranty detail, never the list subtitle.

## 2. Show the coverage end date, not "Ongoing"
The right column should show the concrete **warranty end date** (`it.warranty.ends`, e.g. "Jul 2026"), colored by status, plus a one-word hint:
- Expiring soon → gold, hint "worth a look"
- Active → teal, hint "covered"
- Lapsed → faint, hint "expired"

The build shows a generic "Ongoing" with no date, which defeats the purpose of the view (knowing *when* coverage ends). Use the date + hint.

## 3. Use the item's icon, not a uniform shield
Rows should use `ItemThumb` with each appliance's own icon (blender, dishwasher, dryer…). The build uses the same shield-check glyph on every row, losing item identity.

## Minor
- Stat-card order: lead with **Expiring soon → Active → Lapsed** (expiring first — it's the actionable one). The build leads with Active.
- Group header wording: "Active coverage" (not just "Active").

---

### Row layout (exact)
`item icon (ItemThumb) · [name + "{brand} · {room}"] · [end date (toned) + hint] · chevron`

**Bottom line:** subtitle = `{brand} · {room}` (not warranty terms), right column = **coverage end date + status hint** (not "Ongoing"), and use the item icon. Same flatten-the-dataset root cause as the other pages.
