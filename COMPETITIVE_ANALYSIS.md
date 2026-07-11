# Homehub — Competitive Analysis

> Last updated: March 4, 2026

---

## Market Context

The US home management software market is ~$4.2B (2025) and growing at 11% annually. Despite that, **no app has nailed the full stack**: inventory + manuals + AI maintenance tasks + guided cleaning sessions. That's the gap Homehub is building into.

---

## The Competitive Map

Competitors positioned by **depth of inventory** vs. **AI / task intelligence**:

```
                        HIGH AI / TASK INTELLIGENCE
                                    │
                          Homehub ← you are here
                                    │
                 Homer ─────────────┤
                                    │
                 Dib ───────────────┤
                                    │
LOW INVENTORY ──────────────────────┼─────────────────── DEEP INVENTORY
                                    │
          Sweepy / Tody             │       HomeZada
          (cleaning only)           │       Dwellin
                                    │       HomeLedger
          Thumbtack                 │       Centriq (dead)
          (hire a pro)              │
                                    │
                       LOW AI / TASK INTELLIGENCE
```

---

## Competitor Profiles

### 1. Centriq — The Most Important Competitor (Shut Down Jan 2025)

Centriq was the closest thing to Homehub that ever existed. **It shut down January 31, 2025**, leaving thousands of power-user homeowners actively looking for an alternative.

| | |
|---|---|
| **What it did** | Photo-scan an appliance label → auto-retrieved manuals, parts, recall alerts, maintenance reminders |
| **What it didn't do** | No AI task generation, no guided clean sessions, no dashboard |
| **Why it shut down** | Sold to a buyer who killed it; no migration path for user data |
| **Media coverage** | Endorsed by Wired, National Association of Homebuilders, This Old House |
| **Pricing (was)** | Free–$100/year |

**The opportunity:** Centriq's displaced users are still looking. They already proved they'll pay for this kind of tool. Dib.io is the official migration target, but has **no native mobile app yet** (iOS/Android listed as "Q1 2026"). Homehub can compete for this audience.

**Where to see their old UI:** Search YouTube for "Centriq app review" — several walkthrough videos from 2021–2024 still show the appliance scanning flow.

---

### 2. Homer — Most Direct Current Competitor

Homer (homer.co) is the closest active competitor to Homehub right now.

| | |
|---|---|
| **Features** | Home inventory, manual auto-retrieval, "Homer Helper" AI bot, AI task lists, AI chat with manuals, family sharing |
| **Platforms** | iOS, Android |
| **Android rating** | 3.33/5 (220 reviews) — users report bugs, instability |
| **Pricing** | Free basic; AI features behind subscription |
| **What they're missing** | No guided clean sessions, no room-by-room deep clean mode, no maintenance dashboard |

**Where to see UI:** App Store → search "Homer home management" — 10+ screenshots.

**Key gap vs. Homehub:** Homer has an AI assistant, but there's no evidence of model-specific tasks from actual PDF manuals. Their 3.3 star rating suggests significant execution issues — this is Homehub's clearest opportunity to win on quality.

---

### 3. HomeZada — Established Player, Financial Focus

| | |
|---|---|
| **Founded** | ~2012 — one of the oldest in this space |
| **Features** | Inventory with AI photo scanning, maintenance calendar, financial tracking (home equity, budget, project ROI), document storage, Pinterest/Google Calendar integration |
| **Pricing** | Free Essentials / $59/year / $99/year (multi-home) |
| **Target** | Renovation-focused homeowners, property investors, insurance-conscious households |
| **AI features** | AI photo scan to identify items and extract brand/model/serial; "Homeowner AI" for insights |
| **What they're missing** | Generates insights, not model-specific task lists; no guided cleaning sessions; UI complexity is a common complaint |

**Where to see UI:** homezada.com homepage has a full product tour video; App Store screenshots show calendar and inventory views.

HomeZada is broad but shallow. Their AI generates "insights" ("you should service your HVAC this month"), not model-specific task instructions.

---

### 4. Dib — The Emerging Centriq Successor

| | |
|---|---|
| **Features** | Inventory, manuals, AI photo ID, AI chat with your home (Pro), conversational manuals, Centriq migration tool |
| **Pricing** | Free (generous) / $10/month or $60/year; Centriq users get 50% off for life |
| **Platforms** | **Web only as of March 2026.** Native iOS/Android listed as "Q1 2026." |
| **AI features** | Yes — AI label reading, AI chat, AI maintenance prediction |
| **What they're missing** | No native mobile app, no guided clean sessions, early stage/unproven |

**Where to see UI:** dib.io — full web app tour, no account needed.

Dib is executing smartly (free Centriq migration, generous free tier) but mobile-first users can't really use them yet. **This is Homehub's biggest window** — if Homehub is already on iOS/Android, it wins against Dib by default for mobile-first users.

---

### 5. Dwellin — Sustainability Angle

| | |
|---|---|
| **Features** | AI manual auto-fetch, drag-and-drop maintenance schedule ("UpKeep Plan"), carbon footprint calculator, annual cost estimates |
| **Pricing** | Free / $4.99/month |
| **Unique angle** | Environmental impact — tracks your home's carbon footprint |
| **What they're missing** | No Claude-level AI, no PDF manual storage, no guided clean sessions |

**Where to see UI:** App Store → "Dwellin" — clean screenshots of the UpKeep plan UI.

---

### 6. HomeLedger — Pro Referral Play

| | |
|---|---|
| **Features** | Inventory, AI assistant for Q&A, repair history, document storage, Thumbtack integration for pro referrals |
| **Pricing** | Free / $4.99/month |
| **Partnership** | Announced Thumbtack integration (September 2025) |
| **What they're missing** | No model-specific AI, no guided sessions |

Their Thumbtack partnership shows that home management + pro referral is where revenue lives. Worth watching as a potential partner or future competitor.

---

### 7. Thumbtack — The 800-Pound Gorilla (Adjacent)

| | |
|---|---|
| **Revenue** | ~$400M (2024), growing 27% YoY |
| **Professionals** | 300,000+ active local pros |
| **AI** | Partnered with OpenAI — Thumbtack's services embedded in ChatGPT (October 2025) |
| **Target** | Homeowners who need to hire someone |
| **What they're NOT** | Not an inventory or maintenance tracking tool — they're a marketplace |

Thumbtack is upstream: "I have a problem, find me a pro." Homehub is downstream: "I own this, help me maintain it." These can be complementary — Homehub's task cards could have a "Book a pro" CTA linking to Thumbtack. Their ChatGPT integration means conversational AI home help is coming to mainstream users fast.

---

### 8. Sweepy — Best Cleaning Scheduler (Different Niche)

| | |
|---|---|
| **Features** | Room-by-room cleaning gamification, family chore distribution, Work Approval for kids, leaderboard |
| **Pricing** | Free (1 user) / $2.49/month or $12.99/year |
| **Target** | Families, households with children, neurodivergent users |
| **Rating** | Well-reviewed for its niche |
| **What they're missing** | No appliance inventory, no manual storage, no AI task generation |

**Where to see UI:** App Store → "Sweepy" — best UI in the cleaning category; worth studying for the clean session design.

Sweepy is excellent for "who does the dishes tonight." Homehub is "when was the last time someone serviced the dishwasher."

---

### 9. Tody — Highly Configurable Cleaning Tracker (Different Niche)

| | |
|---|---|
| **Features** | Room-by-room tasks, three cleaning modes (Relaxed/Standard/Proactive), multi-property, highly customizable schedules |
| **Pricing** | Free + in-app purchase |
| **What they're missing** | Same as Sweepy — no inventory, no AI, no maintenance |

Same niche as Sweepy, more control-focused. No overlap with Homehub's core value.

---

### 10. DomiDocs — Premium Security Play

| | |
|---|---|
| **Features** | Digital vault, HomeLock property fraud monitoring, TrueValueIndex property valuation, home inventory, ML-based maintenance recommendations |
| **Pricing** | Free / $249/year |
| **Unique angle** | Property fraud protection (monitors for deed fraud, rental scams) |
| **What they're missing** | Home management is secondary; no appliance-level AI, no guided sessions |

At $249/year, positioned for security-anxious homeowners, not everyday maintenance tracking.

---

## Feature Comparison Matrix

| Feature | **Homehub** | Homer | HomeZada | Dib | Dwellin | Centriq (dead) |
|---|---|---|---|---|---|---|
| Appliance inventory | ✓ | ✓ | ✓ (AI photo) | ✓ | ✓ | ✓ (photo scan) |
| Manual storage (PDF) | ✓ | ✓ (auto-fetch) | Partial | ✓ (AI) | ✓ (Pro) | ✓ (auto-fetch) |
| AI task generation | **✓ Claude** | ✓ (AI helper) | Insights only | ✓ (AI) | Suggestions | ✗ |
| Model-specific tasks | **✓** | Unclear | ✗ | Unclear | ✗ | ✗ |
| Guided clean sessions | **✓** | ✗ | ✗ | ✗ | ✗ | ✗ |
| Maintenance dashboard | **✓** | Basic | ✓ | ✗ | ✓ | Basic |
| Room organization | **✓** | ✗ | ✗ | ✗ | ✗ | ✗ |
| Native mobile app | **✓** | ✓ | ✓ | ✗ (Q1 2026) | ✓ | Was ✓ |
| Web app | ✓ | ✗ | ✓ | ✓ | ✓ | Was ✓ |
| Recall alerts | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (was best) |
| Free tier | TBD | ✓ | ✓ | ✓ | ✓ | Was ✓ |
| App Store rating | — | 3.3★ | Not tracked | N/A | — | Was 4–5★ |

---

## Pricing Benchmarks

| App | Free Tier | Paid Entry | Mid Tier | Premium |
|---|---|---|---|---|
| HomeZada | Yes (Essentials) | $9.95/mo or $59/yr | — | $99/yr (multi-home) |
| Centriq (defunct) | Yes | ~$32/yr | $59.95/yr | $99.95/yr |
| Homer | Yes (basic) | Subscription (undisclosed) | — | — |
| Dwellin | Yes | $4.99/mo | — | — |
| HomeLedger | Yes | $4.99/mo | — | — |
| Dib | Yes (generous) | $10/mo or $60/yr | — | — |
| DomiDocs | Yes | — | — | $249/yr |
| Sweepy | Yes (1 user) | $2.49/mo or $12.99/yr | — | — |

**Takeaway:** The market clusters at $5–$10/month or $60–$100/year. Centriq proved users will pay even $60–100/year for a well-executed appliance tracking tool. Homehub's AI differentiation supports **$8–12/month or $79–99/year** for a Pro tier with unlimited AI task generation and guided sessions.

---

## Where to See Competitor UIs

| Competitor | Where to see UI |
|---|---|
| Homer | App Store → search "Homer home management" — 10+ screenshots |
| HomeZada | homezada.com homepage has a product tour video; App Store screenshots |
| Dib | dib.io — full web app tour, no account needed |
| Dwellin | App Store → "Dwellin" — clean screenshots of the UpKeep plan UI |
| Sweepy | App Store → "Sweepy" — best UI in the cleaning category |
| Centriq (historical) | YouTube "Centriq app review 2022" — multiple walkthroughs |

---

## What This Means for Homehub

### 3 Clear Positioning Advantages

1. **Model-specific AI tasks via Claude** — nobody else is doing this at quality. This is the core moat.
2. **Guided deep clean sessions tied to inventory** — completely unoccupied. No app knows what's in your kitchen AND walks you through cleaning it.
3. **Mobile-first, now** — Dib is the strongest AI competitor but has no native app. Homehub is already there.

### 3 Things to Build to Close Gaps

1. **Automatic manual retrieval** — Centriq and Homer both fetched manuals automatically from a model number. Right now Homehub requires the user to find the PDF URL. Closing this gap would dramatically improve the Add Item flow.
2. **Recall alerts** — Centriq's killer feature that nothing else does. The CPSC has a public API. Big trust-builder with new homeowners.
3. **Photo-based item identification** — HomeZada and Dib both use AI to read a label photo and extract brand/model/serial. This would make onboarding frictionless vs. manual data entry.

### Primary Target Audiences

| Audience | Why | How to reach |
|---|---|---|
| **Former Centriq users** | High intent, proven they'll pay, actively seeking alternatives | Reddit r/homeowners, search "Centriq alternative" |
| **New homeowners** | No entrenched habits, high anxiety about home maintenance | First-time homebuyer communities, real estate agents |
| **Notion/spreadsheet power users** | Want a real tool but haven't found one good enough | Reddit r/Notion, r/productivity, tech-forward communities |

### Homehub's Positioning Statement

> "The first home management app that knows your home as well as you do — because it has your appliances' manuals, model numbers, and maintenance history, and uses them to tell you exactly what to do next."

---

## Risks to Watch

- **Dib** is executing fast and has a generous free tier — if they ship native mobile apps and the AI chat is good, they become a direct threat
- **Thumbtack's OpenAI integration** gives them a conversational AI distribution channel that could expand into inventory management
- **HomeZada's AI photo scanning** is a meaningful onboarding shortcut that Homehub should match or exceed
- **Market consolidation** — well-funded players (Thumbtack, Houzz) could acquire a smaller app and bolt on inventory features

---

*Research conducted March 2026. Market data sourced from Straits Research, Expert Market Research, company websites, App Store listings, G2, and Capterra.*
