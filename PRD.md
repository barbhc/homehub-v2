# Homehub — Product Requirements Document (Feature Edition)

**Audience:** Product, marketing, and anyone who needs to understand *what Homehub does and for whom* — not how it's built.
**Status:** Reflects the live product as of June 2026 (post Phase 4 / "Partner, not delinquent" arc).
**Production:** https://homehub-pied.vercel.app

> This is a **feature- and benefit-led** document, not an engineering spec. It describes the product as a user experiences it. Architecture, schema, and ticket-level scope live in `BACKLOG.md` and the project memory.

---

## 1. The one-liner

**Homehub is the calm operating system for your home — snap a photo of anything you own, and Homehub remembers the manual, the warranty, the upkeep, and what to do when it breaks.**

It turns the scattered reality of home ownership (a drawer of manuals, a vague memory of when the HVAC filter was last changed, a leaking dishwasher at 9pm) into one quiet, trustworthy place.

---

## 2. Who it's for

**Primary user: the overwhelmed-but-conscientious homeowner.**
Recently bought or has long owned a home. Owns dozens of appliances, fixtures, and systems. *Wants* to take care of their home but has no system — manuals are lost, maintenance is reactive, and every repair starts from zero on Google.

**What they're hiring Homehub to do (jobs-to-be-done):**

| When… | They want to… | So they can… |
|---|---|---|
| I buy or move into a home | capture everything I own without busywork | finally have one source of truth |
| I think about upkeep | know what actually matters vs. noise | not feel like a failure for "22 overdue tasks" |
| Something breaks | get a real answer fast | avoid a $150 service call for a 5-minute fix |
| A warranty clock is ticking | be told before it's too late | claim what I'm owed |
| I share a home | keep a partner/household in the loop | stop being the only one who knows things |

**Design north star (the product's spine):**
> **Treat the user as a partner in maintenance, not a delinquent.**
> The app should feel like a calm, competent house manager — never a guilt-tripping chore app. Quiet by default, helpful on demand.

---

## 3. The five core principles (what makes Homehub *Homehub*)

1. **Capture is one step.** Adding an item costs exactly one field: a name. Everything else — photo, manual, warranty, specs — is zero-pressure enrichment that happens *after* the thing exists.
2. **Only what matters can nag you.** Tasks are tiered. Only **Essential** tasks can go "overdue," turn red, or send a notification. Recommended is a gentle "consider soon." Optional is pure reference. No firehose.
3. **Cleaning ≠ maintenance.** A wipe-down and a pump-saving filter change are different jobs and live in different places. Classification is consequence-based ("what breaks if you skip this for a year?"), never keyword-based.
4. **The magic should arrive during capture, not after.** Snap a nameplate → brand, model, age, warranty, and common issues appear *while* you're adding the item — not buried behind a later parse step.
5. **Every feature must earn its place against real home data.** If a change is neutral-but-better-for-new-users it ships behind a toggle; if it makes the core experience worse, it doesn't ship.

---

## 4. Feature catalog — organized by what the user can *do*

Homehub's navigation maps to five user verbs: **Home · Tasks · Inventory · Ask · Fix.**

### Pillar A — Capture: "Get it into Homehub in seconds"

The highest-leverage moment. Everything downstream depends on low-friction capture.

- **One-step Add Item.** Type a name, you're done. The item exists immediately; enrichment is optional and incremental.
- **Snap-to-autofill (OCR).** Photograph an appliance nameplate, a receipt, or a spec sheet. Homehub detects *which kind* of image it is and extracts brand, model, serial number, purchase date, and price automatically.
- **Smart document detection.** Upload a PDF and Homehub classifies it — Owner's Manual, Spec Sheet, Install Guide, Warranty Card — and handles each appropriately, with a confirmation chip so you stay in control.
- **AI spec lookup.** Know the brand and model but nothing else? Homehub fills in specifications and estimated age from the model number.
- **Automatic product photos.** Items get a real product image pulled in automatically, so your inventory looks like a catalog, not a spreadsheet.
- **Manual parsing.** Drop in an owner's manual and Homehub reads it — extracting maintenance tasks, troubleshooting tables, setup steps, and diagrams into structured, searchable knowledge.
- **Curated briefing on capture.** Instead of dumping 20 tasks, capture surfaces a handful of high-signal cards: warranty status, estimated age, one common issue, one maintenance habit worth keeping. The full task list is one tap away for power users.

### Pillar B — Inventory: "Know everything you own"

- **Room-organized inventory.** Every item lives in a room; the home reads like a walk-through, not a database.
- **Rich item detail.** A hero card with editable photo and inline-editable fields; manuals and documents attached; warranty and purchase tracking; tier-grouped tasks.
- **Warranty & purchase tracking** with prominent "warranty expires in 30 days" alerts — a moment of genuine value almost no competitor nails.
- **Recall checking.** Homehub checks your items against known product recalls — turning a passive inventory into an active safety net.
- **Document & manual library** with custom labels, so multiple files per item stay organized and reference-only docs are distinguished from scannable manuals.

### Pillar C — Tasks: "Stay ahead, without the guilt"

- **Tiered tasks.** Essential / Recommended / Optional, color-coded (red / amber / blue). Only Essentials can be overdue or notify.
- **Cleaning vs. maintenance separation.** Real maintenance lives in the Tasks list; routine cleaning lives in a **Deep Clean library** surfaced during cleaning sessions — never cluttering the maintenance feed.
- **Setup checklists.** Install-time, one-time tasks (level the washer, verify grounding, check the drain hose) render as a checklist on the item — with "re-do if…" trigger hints — instead of recurring forever.
- **Habits & reminders.** After-each-use and as-needed habits get their own soft surface, with safety-critical ones emphasized.
- **Schedule view & smart filtering.** Filter by tier, room, and status; group by room or tier; bulk-complete, snooze, or re-tier.
- **Essential-only push notifications.** Opt-in reminders that only fire for things that genuinely matter — honest by design.
- **Completion history.** "When did I last replace the filter?" is answerable.

### Pillar D — Fix: "Get unstuck when something breaks"

The newest pillar — a unified troubleshooting flow that's a real differentiator.

- **Symptom-first diagnosis.** Tap a symptom (leaking, won't start, noise, error code…) or describe it in plain words; Homehub maps it to the right diagnostic path.
- **Multi-source brief.** Homehub assembles an answer from *your* manual's troubleshooting tables, relevant setup re-checks, and related maintenance — specific to your exact model.
- **AI "three things to try."** A prioritized, plain-language diagnostic recommendation synthesized from all of the above.
- **Escalate intelligently.** Not fixed? Hand off to chat with full context, or route to a saved service provider ("Mike's Plumbing handles drainage") with a pre-filled summary of what you already tried.

### Pillar E — Ask: "A house expert that's read your manuals"

- **Chat grounded in your home.** Ask anything; answers come from your actual manuals (RAG), not generic internet advice.
- **Automatic item scoping.** "Why is it beeping?" — Homehub infers which item you mean.
- **Web fallback with citations.** When the manual hits a dead end, Homehub searches the web and shows where the answer came from (manual / web / AI badges).
- **Care notes & FAQ.** AI-suggested care tips and an FAQ surface, plus the ability to import care instructions from a URL.

### Pillar F — Household & personalization

- **Shared homes & invites.** Invite household members with role management — stop being the only person who knows where the manuals are.
- **Onboarding that builds context.** A short Q&A captures home type, ownership, and top concerns, then tailors what the app shows you.
- **Shape-shifting modes.** Users who think "my dishwasher is leaking" get an **Ask-first** layout; users who think "show me what I own" get an **Inventory-first** layout. Same data, different front door.
- **Service provider contacts.** A per-home address book of plumbers, HVAC techs, electricians — tappable phone/email/website, ready to escalate to.

---

## 5. Signature user journeys

**Journey 1 — "I just bought a house" (cold start → value)**
Onboarding Q&A → snap nameplates of major appliances → each one autofills brand/model/age/warranty and surfaces one common issue → Homehub flags two warranties expiring soon and one recalled item. *Within minutes, the user knows more about their home than they did after a year of ownership.*

**Journey 2 — "It's 9pm and the dishwasher is leaking"**
Open **Fix** → tap "leaking" → Homehub pulls the leak section from *their* dishwasher's manual + a setup re-check (drain hose position) + the relevant maintenance task → "three things to try" → step 2 solves it. *A service call avoided.*

**Journey 3 — "Staying ahead without dread"**
Home screen shows a calm, short list — only Essentials that genuinely need attention. Cleaning lives in its own library. The user completes one task, snoozes another, and closes the app feeling on top of things rather than behind.

---

## 6. Competitive positioning

| Most home-inventory apps | Homehub |
|---|---|
| Manual data entry | Snap-a-photo autofill + manual parsing |
| Static list of stuff | Live home that maintains, warns, and answers |
| Generic maintenance checklists | Model-specific tasks parsed from *your* manuals |
| "You have 22 overdue tasks" guilt | Tiered, essential-only, calm by default |
| Google-the-problem when it breaks | Built-in troubleshooting grounded in your manuals |
| No warranty/recall awareness | Proactive warranty and recall alerts |

**Moat:** the combination of *frictionless capture* + *manual-grounded intelligence* + *calm, consequence-based prioritization*. Each is hard alone; together they're a category of one.

---

## 7. Scope boundaries (what Homehub deliberately is *not* — yet)

- **Not a marketplace.** No parts/supplies commerce (a supply-list feature exists in the data model but is not a storefront).
- **Not offline-first.** Cloud-backed; offline support is a "later" item.
- **Not a contractor/B2B tool yet.** Renter mode and builder/property-manager seeding are future market-expansion bets, not current scope.
- **Not a social/community product.** No forums; web wisdom is pulled in via search with citations, not user-generated.

---

## 8. Where the product is heading (themes, not tickets)

- **Bulk inventory management** — multi-select to move, tag, or re-schedule many items at once (next up).
- **Confidence through testing** — E2E coverage of the core capture → maintain → fix loop.
- **Resale & move-in moments** — auto-generated move-in checklists and a shareable home-history/resale report (high-motivation moments, strong differentiators).
- **Deeper sourcing** — model-specific wisdom from forums/manufacturer sources, building on the existing web-with-citations foundation.

---

*Maintained alongside `BACKLOG.md` (strategic queue) and `notes/phase-4-tracker.md` (tactical state). When a major feature ships, update Section 4.*
