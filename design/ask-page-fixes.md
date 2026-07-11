# Desktop Ask — fixes to match the redesign

**Scope:** the desktop **Ask** tab.
**Source of truth:** `Homehub Desktop.html` → `dt-screens-b.jsx`, component **`DesktopAsk`** (data: `ASK_CONVOS`).

This page diverges from the spec the most. The build is a centered "What can I help with?" launcher — a fine *empty state*, but it replaces the redesign's two-column conversation interface and drops Ask's two signature features.

---

## The spec is a two-column conversation interface
- **Left rail (~260px):** "New question" button + a **list of past conversations** from `ASK_CONVOS` (e.g. "Descale Bosch dishwasher," "HVAC filter size," "Fridge water tastes off") — each a row with icon + title + timestamp; the active one highlighted.
- **Right pane (flex):** the **active conversation** — a topic/scope chip at top, user/assistant message **bubbles**, and assistant **answer cards with manual citations** ("Bosch manual · p.38" + source chips) plus "task created" confirmations, and the input pinned at the bottom.

## 1. Restore the conversation-history rail
The left rail currently shows only a floating "New question" button, leaving a tall empty panel. Populate it from `ASK_CONVOS` (icon + title + time), active item highlighted.

## 2. Build the answered / cited-answer state (most important)
The build only shows the blank launcher. Ask's signature is **manual-grounded answers with citations** — e.g. an answer card citing "Bosch manual · p.38" + source chips, and a "I added 'Descale dishwasher' as a Recommended task" confirmation. This view is the core of Ask and must exist. See `Answer` / `Bubble` in `dt-screens-b.jsx`.

## 3. Make the launcher the empty state of the conversation pane — don't replace the layout
Keep the two-column shell always. When there's no active question, the right pane shows the launcher (below). Once the user asks, the right pane becomes the chat (bubbles + cited answers).

## Keep — good additions, fold them into the launcher empty state
- **Room pills + Item search** — scoping a question to a room/appliance (matches the mobile Ask "scope" concept). Good — keep.
- **Troubleshoot / Ask a manual** entry cards + suggested prompts. Good — keep, inside the right-pane empty state.

## Minor
- The centered launcher leaves large dead space top/bottom from vertical centering. Inside the conversation pane it sits naturally; don't full-viewport-center it.

---

### Layout (exact)
`grid-template-columns: 260px minmax(0, 1fr); gap: 20px; align-items: start;`
- Left: New question + `ASK_CONVOS` list.
- Right: conversation pane — empty state = launcher (scope pills + Item search + Troubleshoot/Ask-a-manual + suggestions); answered state = bubbles + **cited answer cards** + task-created confirmation + bottom input.

**Bottom line:** keep the launcher content, but put it back inside the **two-column shell** with a populated **history rail** and, above all, the **manual-cited answer view** — that's the heart of Ask and is currently missing.
