# Demo feedback, 2026-11-17: seven points, designs and requirements

**Status: the owner decided the direction of every point on 2026-11-18. Nothing is built.** Each point still needs a build-ready mock before code. D7 is the owner's own addition from the review.
Review page with the sketches: https://claude.ai/artifact/NpwhqZ8tEj832z8Zw4uCho

Source: two friends, at the owner's live demo on 2026-11-17. "Today" lines were
checked against the code on 2026-11-18 (main at `b5c1b90`); each names the file
it came from. The sketches on the review page show the idea only. Per CLAUDE.md
rule 7, every point gets a build-ready mock from the live screens before code,
and the "Must be true" list under each point becomes that mock's assertions.

## The read

Points 1, 2 and 4 are one journey: snap the label, Homehub finds the manual, the
person gets the few tasks that matter. Recommended build order runs back to front
(4, 5, 2, 1, 3), because a faster front door on top of a finder that judges a
manual by title and URL alone shows more new people the weak spot.

| ID | Point | Size | Order | Server change |
|---|---|---|---|---|
| D4 | Task level, chosen before adding (decided 2026-11-18) | 2 days | 1st | none |
| D5 | Short Ask answers (decided 2026-11-18) | 1 day | 2nd | `chatQuery` deploy |
| D2 | Verified automatic manual finding (bar decided) | about 2 weeks | 3rd | `findManual` deploy |
| D1 | Snap first, photo queue, guest mode during the beta (decided) | 2 days, then about 2 weeks | 4th | step C |
| D3 | Receipt reading, one receipt for several items (decided) | 3 to 4 days | 5th | `ocr` deploy |
| D6 | Monthly AI opportunity scan (decided and scheduled) | set up | ongoing | none |
| D7 | Region from a zip code, replacing the climate question (decided) | about 1 week | with D4 | to be settled in design |

---

## D1. Snap labels first, answer questions later

**Said:** start photographing appliance labels right away instead of creating an
account and answering questions; queue the photos so the process is not interrupted.

**Today**
- Sign-in is required: `AuthGate` and `HomeGate` redirect to `/` (`src/modules/auth/components/AuthGate.tsx:23`, `src/modules/home/components/HomeGate.tsx:25`). Methods are Apple and email/password. No `signInAnonymously` anywhere; functions reject a token that belongs to no home (`firebase/functions/src/lib/membership.ts:3`).
- `HomeOnboarding` requires a home name, and an invite code when the growth gate is on; a missing `config/growth` doc counts as on (`src/modules/home/services/growthGate.ts:22`). Whether it is on in production was not checked.
- `/onboarding/profile` is five skippable steps (`HomeProfileOnboarding.tsx:75`), then a choice screen (`src/pages/OnboardingProfile.tsx:84`).
- "Scan the label" takes one file through `<input capture="environment">` (`IdentifyStep.tsx:735`, `files?.[0]` at `:435`) and calls `ocr` (Google Vision, then `claude-haiku-4-5`). One item at a time; no batch or queue.
- In-progress state is `localStorage` key `homehub-smart-add-session` (`src/lib/wizardSession.ts`).

**Proposed**
- **A. Camera right after sign-in (2 days, client only).** Create the home as "My Home" (renamable). Remove the profile questions from the front door and build the approved nudge instead (`design/profile-nudge.md`, BACKLOG 4.3): climate is asked the first time a freeze task appears. That also addresses HH-168.
- **B. Photo queue (about 1 week).** A camera that stays open; each tap adds a photo to a tray; reads run in the background; a review list at the end shows brand and model per photo with fix, retake and type-it actions; "Add N items".
- **C. Try before sign-in (about 1 week plus a security review). Decided by the owner, 2026-11-18: on "during this beta period"; revisit before a public launch.** Proposed limits: 5 labels per guest, App Check, one daily cap across all guests, no manual scans before sign-in. Open design point: if the growth gate is on, a guest who signs in to keep their items would be asked for an invite code. A guest snaps up to 5 labels and sees what was recognised; sign-in is asked at "Keep these".

**Must be true**
1. After sign-in the camera is open within 2 taps, and no question is asked before the first item is saved.
2. The shutter is ready again within 1 second; reading never blocks the camera.
3. Every read shows the brand and model it found; a low-confidence read asks for a retake or typing and never guesses.
4. The queue survives closing the app; photos stay on the device until added.
5. Manual scans from a queue start only after an explicit yes that states how many scans it will use.
6. A model already in the home is flagged ("you already have one, add another?").
7. A queue holds at most 20 photos; the 21st says why.
8. When the photo shows the appliance and no label, the screen says where that type's label usually is.

**Edge cases:** glare or a worn label; camera permission denied (photo library and typing still work); the app is killed mid-queue; no connection (the queue waits, nothing is lost); `ocr` quota reached partway through a queue (the unread photos stay in the tray with the reason).

**Sync rule (required by the architecture rules):** the queue is device-only, written by one device, and never synced. Items sync only once added, through the existing item writes. No merge rules are needed; a queue on one device is invisible on another, and the review list says so.

**Risks**
- A camera that stays open needs `getUserMedia` inside the iOS shell's WKWebView. Untested in this shell. Half a day to test before step B is sized; if it fails, step B needs a native camera plugin and a TestFlight build.
- Step C: anonymous accounts can be created without limit, so the per-user caps in `config/spend` stop bounding spend. It needs App Check, a small guest allowance, a global guest ceiling, and a path through `membership.ts` for a user with no home. Run `/codex:adversarial-review` (auth).

**Docs:** this changes the add-item flow, so `docs/add-item-flow.md` and `docs/user-journeys.md` are amended in the same PR, with the journey spec.

**Done means:** a journey walk measures first open to first saved item, and the median on a fresh account is under 90 seconds.

---

## D2. Find the right manual automatically

**Said:** most people do not have the manual to hand, so automatic finding is critical.

**Today**
- `findManual` (`firebase/functions/src/products/findManual.ts:149`) uses Brave only: `"brand model" owner's manual filetype:pdf`, then a looser query (`:189`). The Icecat, Brave, Haiku chain is product identity, not manuals.
- A candidate is judged by title and URL: PDF path, SSRF guard, refused host types, brand or model named (`shared/products/manualCandidates.ts:42`). Ranking is manufacturer host first; at most 4 results (`findManual.ts:105`). **The PDF is never opened before it is offered.**
- The client shows up to 4 results with a page-1 preview and asks the person to check the cover (`FindManualCard.tsx:225`).
- Labelled Beta and "a last resort" (`ManualStep.tsx:527`); auto-search defaults to off (`src/hooks/useAutoFindManuals.ts:22`). `docs/add-item-flow.md:191` requires that placement (HH-107, HH-115).
- Global `manualSearchCache`, 30 days, misses cached. 11 unit tests. No accuracy eval and no hit-rate telemetry.

**Research (2026-11-18, web; source links at the end of this section)**
- Accuracy comes from verifying the PDF, more than from a better search step. No published accuracy benchmarks were found; the order below is judgment until measured.
- No source offers a clean public API for appliance manuals. Manufacturer sites have model lookup pages (Whirlpool, GE) but no documented URL pattern. Aggregators (ManualsLib and similar) are broad, likely forbid scraping (terms not read), and carry more wrong documents. Internet Archive has a public API and suits old models. Icecat XML has manual URL fields; whether the free tier returns them is unconfirmed. Bluon has an HVAC manuals API behind partner credentials.
- Search APIs: Brave is about $5 per 1,000 and supports `site:` and `filetype:` in the query. Google Programmable Search is closed to new customers and shuts down 2027-01-01. Bing's API was retired 2025-08-11. Anthropic web search is $10 per 1,000 plus tokens, with domain allowlists and no filetype filter. Stay on Brave.

Sources: [Brave search operators](https://api-dashboard.search.brave.com/documentation/resources/search-operators) · [Google search API shutdown](https://brave.com/learn/google-api-shutdown/) · [Bing API retirement](https://ppc.land/microsoft-ends-bing-search-apis-on-august-11-alternative-costs-40-483-more/) · [Anthropic web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) · [Whirlpool manuals lookup](https://www.whirlpool.com/services/manuals) · [GE literature lookup](https://www.geappliances.com/ge/service-and-support/literature.htm) · [Icecat product XML](https://iceclog.com/manual-downloading-individual-product-xmls/) · [Bluon manuals API](https://docs.bluon.com/api/manuals) · [Centriq on needing the model number](https://intercom.help/centriq/articles/2017584-how-do-i-add-appliances-and-items-to-centriq). Not verified: aggregator terms of use, parts-retailer APIs, Brave's exact current price, and every accuracy-gain estimate.

**Proposed pipeline**
1. **Read the label well:** brand, model, serial, each with a confidence; retake when unsure (the `ocr` call already returns a confidence).
2. **Look in order:** a verified-manual library keyed by normalized brand and model; the manufacturer's own domain (the brand registry of BACKLOG 4.1, used for `site:` scoping); then the open web.
3. **Verify every candidate:** fetch the first pages; require the normalized model, or a series pattern that contains it, in the text and the brand on the cover; classify the document type with a forced-schema call (owner's or use-and-care manual only); check language and page count.
4. **Confirm with the cover:** one verified answer, "Is this your manual?". A yes writes the URL and content hash to the library; a "Not mine" is recorded against that pairing.
5. **Say so when nothing verifies:** a general care plan for the category, labelled General everywhere it shows, with upload and paste-a-link still offered.

**Must be true**
1. No document is offered unless its own text names the model or its series.
2. Installation guides, spec sheets, parts lists, energy guides and service manuals are never offered as the manual.
3. Nothing attaches without a tap on "Yes, that's it".
4. A golden set of at least 50 brand and model pairs with known-correct manuals runs with one command (`evals/manual-finder/`), and every PR that touches finding reports found rate and wrong-document rate against the current pipeline's baseline.
5. A general plan is labelled General wherever it shows and never contains gas, combustion or electrical DIY steps (pro-task safety model).
6. The library stores a link and a content hash, and re-checks links; it does not hand a stored PDF to another home.
7. Every server-side fetch of a candidate goes through the `isAllowedUrl` guard (non-negotiable 8).
8. The document-type call is a forced tool call with a schema, validated with Zod.

**Edge cases:** a series manual that never prints the full model; colour and finish suffixes; regional variants (US only for now); a scanned PDF with no text layer (the first pages need a vision read); a dead link in the library.

**Failure modes:** the search API is unavailable (say so; offer upload); verification times out (the candidate is not offered); a wrong manual is confirmed by one person (the "Not mine" count from later homes demotes it).

**Copyright (not legal advice):** manuals are copyrighted. Link to the manufacturer's PDF, fetch it for that person's scan, and keep extracted tasks with a source link. Do not redistribute stored PDFs. The shared parse cache the owner deferred on 2026-08-25 (BACKLOG 3.3) stays a separate decision; this design does not need it.

**Supersedes:** once the bar is met, this replaces `docs/add-item-flow.md:191` ("last, muted, badged Beta") and absorbs BACKLOG 4.1 (brand registry). The PR must say so and amend the spec.

**Bar for making finding the default (decided by the owner, 2026-11-18):** on the 50-model set, a wrong document offered under 2% of the time and the right one found over 70%. Until the eval shows both, the rule at `docs/add-item-flow.md:191` stands.

**Done means:** the eval exists with a recorded baseline for today's pipeline, the bar is met, and the journey walk covers the confirm card and the nothing-found state.

---

## D3. Read the receipt for purchase details

**Said:** when adding warranty details, an uploaded receipt should be parsed for all purchase information. The owner was not sure whether this exists.

**Today: partly.**
- `ItemUnit` already has `purchase_date`, `store_name`, `price_paid`, `receipt_storage_path`, and nine `warranty_*` fields (`src/integrations/types.ts:275`).
- The `ocr` callable classifies a photo as `nameplate` or `receipt` and returns `purchaseDate` and `purchasePrice` (`firebase/functions/src/ai/ocr.ts:64`). That only runs from "Scan the label" in the add flow, and fills blank fields only (`IdentifyStep.tsx:403`). Store, order number and plan terms are not extracted.
- Receipt file upload exists only in `HeroCard`, which now mounts only in the desktop Edit dialog (`ItemDetailPage.tsx:696`). The file is stored and never read.
- On the phone the details are typed in `ItemDetailsSheet.tsx`; warranty length is a fixed list.

**Proposed:** an "Add receipt" control on the purchase and warranty sheet, phone and desktop. Photo, PDF, or a screenshot of an order email. One read fills store, purchase date, price paid, order number, and any protection plan with its length. Warranty length comes from the manual when the manual states it, with its source shown. A review step shows each field beside the receipt; Save writes them and keeps the file.

**Must be true**
1. Every extracted field is shown for review before saving; nothing replaces a value the person typed.
2. Card numbers, addresses and loyalty numbers are never extracted or stored as fields.
3. A detail the receipt does not show stays blank.
4. The warranty reminder is off until switched on.
5. A golden set of at least 10 receipts ships in the same PR (`evals/receipt/`): big-box, online order email, faded thermal, multi-item, handwritten.
6. The extraction is a forced tool call with a schema, validated with Zod at the callable's boundary.
7. A failed read shows an error, keeps the file attached, and leaves typing available.

**Edge cases:** a store SKU with no model on the line; a multi-item receipt (decided by the owner, 2026-11-18: offer to apply it to each matching item, confirmed before saving; about half a day more); no receipt at all.

**Done means:** the 10-receipt eval reports per-field accuracy, the failure-path test asserts a visible error, and the phone sheet has the same control as desktop.

---

## D4. Fewer tasks, chosen before any are added

**Decided by the owner, 2026-11-18:** new homes start on Recommended too, and the tasks are shown to the person before they are added. Her reason: editing and deleting tasks after they have been added is tedious. Assumed, not yet confirmed: Recommended tasks arrive switched on and the person switches off what they do not want.

**Said:** neither friend wants many tasks to manage; cleaning, setup and non-critical upkeep should not be pushed.

**Today**
- Raw parser output on the seven goldens (`scripts/parse-eval/golden/`): 7 to 18 tasks per manual; 0 to 5 recurring; 0 to 2 that are both Essential and recurring.
- Every tier reaches Home when due, provided the task recurs and is not item-scoped cleaning (`shared/tasks/agendaEligibility.ts:26`, `src/modules/care/services/weekAgenda.ts:107`, `src/lib/dashboard.ts:588`).
- Only Essential notifies by default (`shared/tasks/reviewBuckets.ts:162`); the push sweep applies the same rule (`firebase/functions/src/push/sweep.ts:223`).
- The review after a scan lists every task in four groups, each row with kind, tier, cadence, bell and Skip (`TaskReviewSheet.tsx:395`).
- There is no "only essentials" setting. `useUserLevel` governs navigation depth, not tasks.
- The owner's home holds 210 tasks, 138 unscheduled (`reviewBuckets.ts:7`).

So notifications are already rare. The load is in what people see: the review and the lists.

**Proposed: a task level per home.** Just the essentials, Recommended too, or Everything. New homes start on Recommended too.
- Home and Tasks show tasks at or above the level.
- Nothing from a scan is added until the person taps Add. The review lists the Essential and Recommended tasks that would land on the schedule, switched on; Optional sits in one collapsed line, off. Accepting is one tap.
- The same review reopens from the item page, so removing tasks later is switching them off in one list instead of editing or deleting them one at a time.
- Optional tasks, cleaning, setup and usage tips stay on the item page; they are not added and not asked about in the review.
- A manual with nothing for the schedule says "Nothing to schedule for this one. N optional things are saved on its page."
- The level is a filter. It deletes nothing and changing it is instant.

**Must be true**
1. A new home on the default level never sees an Optional task on Home or in a notification.
2. The review after a scan takes one tap when what is switched on is accepted.
3. The level is visible in Settings and on the review, and reversible in one step.
4. Existing homes see no change until someone picks a level (no backfill, no migration of choices).
5. An Essential task with no date still shows on the item page with its priority.
6. A task the person switches on by hand shows on Home whatever the level is.
7. The level is stored on the home, so every member sees the same list.
8. No task from a scan is written to the home before the person taps Add.
9. Reopening the review from the item page can remove several tasks in one action.

**Edge cases:** a person promotes one Recommended task; two members disagree on the level (last write wins, shown in Settings with who set it); the Essential tier is inflated on install-heavy manuals (`evals/manual-parser/BASELINE.md:72`), which is a parse-quality item tracked in BACKLOG section 5, not here.

**The filters people forget (owner, 2026-11-18).** Her finding from living with the app: the tasks that matter most are filters on appliances people forget to maintain (dishwasher, washer, range hood) and replacing filters in air purifiers and the heater. The dryer lint screen is not one of them, because people clean it as they go.

Checked against the code the same day:
- The care library (`shared/care/library.ts`, `design/care-library.md`, decided 2026-09-06) already lists filters first: dishwasher filter, range-hood mesh and charcoal, purifier HEPA and pre-filter, fridge water filter, furnace and HVAC air filter.
- It is offered only as a "Suggested" band on the item page and a last group on Tasks. It is not part of the review after a scan.
- The washer has one entry (`washer.tub`) and no filter entry. In the `washer-lg` golden both filter tasks are `as_needed`, so they never reach Home.
- `dryer.lint` is `essential`, and the `dryer-lg` golden has "Clean the Lint Filter" as `essential` / `after_each_use`.

Added to this design:
- Library filter entries for the item's kind appear in the same review list as the manual's tasks, with a provenance line ("Typical for dishwashers").
- A filter task the manual leaves `as_needed` is offered with the library's typical interval (the existing backstop, moved into the review).
- The library gains washer drain-pump and inlet-filter entries.
- After-each-use habits such as the lint screen become tips with no reminder. This changes a tier the library and the parser both assign, so it goes through the goldens (non-negotiable 5).

**Docs:** amends the review rules in `docs/add-item-flow.md:368-405` and `design/care-library.md` (the "three surfaces" gain a fourth). Keep the name distinct from the interface level in `useUserLevel`.

**Done means:** a mock approved by the owner; assertions for 1 to 7 in the journey walk; all four emulator suites green; the owner's home unchanged in production.

### D4 as built (2026-11-20)

Both mock screens were approved by the owner (review after a scan 2026-11-19;
Task level in Settings 2026-11-20): https://claude.ai/artifact/Ao4AvquYrsTwZDs4oUUSuo.
The live review screen already showed everything before Save and already had
Skip, and it groups by kind (round 18), so the build is narrower than the first
sketch above.

**Data model** (no server change, no rules change)

| Where | Field | Meaning |
|---|---|---|
| `homes/{id}` | `taskLevel`: `"essential" \| "recommended" \| "everything"` | Written at creation as `"recommended"`. Absent = a home from before the setting; it behaves as `"everything"` (`taskLevelOf`). |
| `homes/{id}` | `taskLevelHidden: number` | How many tasks the level hides, written in the same batch. Home and Tasks query the marks only when it is above zero, so a home that never lowered its level makes no extra read. |
| `homes/{id}/taskTemplates/{id}` | `hiddenByLevel: boolean` | The level is hiding this task from Home and Tasks. Set and cleared only by a level change. |
| `homes/{id}/taskTemplates/{id}` | `levelKept: true` | The task was showing below the level when the level changed, so a person kept it by hand; the level never hides it again. |

Rules live in `shared/tasks/taskLevel.ts` (pure, tested); the writes in
`src/modules/care/services/taskLevelService.ts`.

**What was built**
1. **Review after a scan** (`reviewRows.rowsFrom`, `TaskReviewSheet`): usual interval for a when-needed filter with "Typical for <kind>"; rows headed for Tasks below the level start skipped; Cleaning and Usage tucked away; the level named with Change.
2. **Care library**: washer drain-pump filter (monthly — owner, 2026-11-20: "go with what the manual says") and inlet filters (twice a year), both `backstopOnly`. Makers' stated intervals, checked 2026-11-20: LG and Samsung US say monthly for the pump filter, Whirlpool "every few months", Electrolux every two months, GE none; LG and Samsung (regional pages) say about twice a year for the inlet screens, the others none.
3. **Settings › Task level** (`TaskLevelSection`), above House rules, one choice per row.
4. **Home and Tasks** leave out tasks marked `hiddenByLevel` (`homeReads`, `dashboard.onDatedListToday`, `weekAgenda`), and Tasks says how many: "N tasks are hidden by your task level. Change" (the HH-82 / HH-94 rule that a list never withholds work silently).

**Where the build differs from the mock, and why**
- The drain filter is offered monthly, where the mock drew every 3 months (owner, 2026-11-20). The chips use the app's own labels ("Monthly", "Twice a year").
- "Every Optional task starts skipped" is built as every Optional task **headed for Tasks**. A row that lives on the item page (cleaning, when-needed, setup) is not skipped: it would be dropped without ever being seen.
- The level line shows on a fresh read whenever the home has chosen a level, not only when a row was skipped.
- A level change hides by writing a mark on the task, where the mock text said only that Home and Tasks change. The mark is what lets a task kept by hand stay.

**What the level never hides:** Essential tasks; a task typed in (`source: "user"`) or added from a suggestion (`externalKey: "library:…"`); a task whose reminder was switched on; a task kept by hand; a task of unknown tier.

**Edge cases decided**
- Two members change the level at once: last write wins for the level and the marks together (one batch).
- Offline with an empty cache: the change is refused with an error rather than saved over a task list that was never read.
- A failed read of the marks on Home or Tasks hides nothing.
- A rescan that recreates a task loses its mark, so the task shows. That direction (showing, never hiding) is the safe failure.
- Notifications are unchanged. Only Essential notifies by default, and Essential is never hidden; a reminder switched on by hand exempts the task.

**Not built here:** the dryer lint screen's Essential tier in the parser and library (it changes a tier the goldens pin, so it goes through the parse eval), and usual intervals for stored tasks (the item page's existing backstop offer covers those).

---

## D5. Ask answers that can be acted on in one read

**Decided by the owner, 2026-11-18:** short for everyone, with a More detail chip. No Short/Detailed setting.

**Said:** the answer about a dryer problem was thorough but verbose. Apply the i-have-adhd skill's rules.

**Today**
- The system prompt (`shared/chat/chatMessages.ts:131`) asks for exact manual details, numbered steps and markdown. It has no length rule. `max_tokens` is 1024, model `claude-sonnet-5`, streamed over SSE (`chatQuery.ts:474`), rendered with ReactMarkdown.
- `scripts/chat-eval/` scores five conversations on required facts. `evals/ask-safety/` has 18 safety cases. Neither scores length or shape.

**Proposed answer shape** (from the skill's rules 1, 2, 3, 4, 6 and 9)
1. First line: the most likely cause and the fix, one sentence.
2. Up to 5 numbered steps, one action each.
3. A time estimate in concrete units.
4. One safety line, only when it applies. The safety rules are unchanged.
5. Stop at about 120 words. Three fixed follow-up chips on the client: Still not fixed, More detail, Show the manual page.

**Must be true**
1. On a 12-question golden set (`evals/ask-shape/`), the median answer is 120 words or fewer and none exceeds 180 unless detail was requested.
2. The first sentence names an action.
3. A procedure taken from the manual keeps all of its steps; the 5-step cap applies to diagnosis and background.
4. All 18 `ask-safety` cases still pass.
5. `scripts/chat-eval` still passes; the PR reports the score change.
6. The "General knowledge" label for content not from the manual is kept.

**Why a prompt change and not a schema:** the reply is prose streamed to a person. A forced tool call would end streaming. The structured-output rule covers calls that return data; this one is covered by the scored eval instead.

**Edge cases:** the person asks for the full explanation (long is allowed); a question with no safe DIY answer (the pro hand-off stays the whole answer); a follow-up tap on "Still not fixed" (the next most likely cause, same shape).

**Done means:** the new eval and both existing ones pass with scores in the PR body, and the owner approves the `chatQuery` functions deploy.

---

## D6. A standing check for what AI can now take over

**Said:** as AI improves, regularly evaluate which functions in Homehub and SkinIQ could be more automated, accurate and magical: OCR, voice, personal-assistant integrations, voice mode.

**Proposed:** a scan on the first of each month for both apps, and one extra run on each new Claude model release. Each run:
1. Lists every step where a person types, chooses or waits (Homehub: the five journeys in `docs/user-journeys.md`; SkinIQ: onboarding, the daily log, the photo check-in).
2. Checks each step against current capability: reading photos and documents, voice in and out, Siri and Shortcuts, assistant connectors, live web lookup.
3. Scores each idea on effort removed, reliability and cost per use.
4. Writes the top 3 per app into that app's BACKLOG with a size.
5. Sends the owner one page: 3 ideas per app, one recommended.

**Rules:** the scan proposes and builds nothing. No model is switched before its eval suites have run on the new model (global rule). An idea that needs the microphone, camera or Siri states whether it needs a new TestFlight build.

**First candidates, Homehub:** D1, D2 and D3 above; a Siri phrase that marks a task done (native shell work); speaking to Ask and hearing the answer; a photo of an error code or part in Ask; letting an assistant query a home's records.

**First candidates, SkinIQ (from its CLAUDE.md only, not yet checked in its code):** its seven Claude functions are pinned to `claude-sonnet-4-5-20250929`, so the first job is running its evals on a current model; product label or barcode capture; voice logging.

**Decided by the owner, 2026-11-18: monthly.** A scheduled task, `monthly-ai-opportunity-scan`, runs at 9:00 on the 1st of each month from 2026-12-01 on the owner's machine. It opens one unmerged docs PR per app titled "docs(backlog): AI opportunity scan YYYY-MM" and reports one page. It never merges, deploys, or changes a model.

---

## D7. House tasks that fit the region, from a zip code

**Said (owner, during the review on 2026-11-18):** for houses, it would be ideal to get the most recommended tasks for the region the person is in. Would asking for location or zip code help?

**Answer: yes, a zip code. Decided by the owner the same day: it replaces the climate question.**

**Today**
- Climate is one of four choices in the five-step profile (`HomeProfileSection.tsx`, `design/profile-nudge.md`); `freezeRisk` is derived from it. No city, zip or coordinates are stored on a home.
- A home with no climate answer cannot be recognised as freeze-free, so `isAsNeededColdStorage` (`shared/tasks/houseRules.ts`) never fires for it. That is the likely cause of HH-168.
- Home-level suggestions exist in the care library: alarm test, alarm batteries, extinguisher, water-heater flush, HVAC service, termite, birds, rodents, gutters. Each is gated on a yes/no `CareFacts` answer (`shared/care/library.ts:152`) collected under Settings, Your home. None is regional.

**Proposed**
- One skippable zip-code field, with the reason shown. **Amended 2026-11-18 by D8** (`design/first-minute-onboarding.md`): asked on the first screen after sign-in, not after the first item is saved.
- The zip code derives climate and freeze risk, the months seasonal jobs belong in, and the regional facts the library gates on (termite pressure, wildfire, hurricane, earthquake). Each conclusion is shown and can be changed in one tap.
- Regional entries join the library (for example water-heater earthquake straps, shutting off hose taps before a freeze, storm preparation) and go through the same choose-before-adding review as D4.
- Home type and "the building handles it" stay as questions; a zip code cannot answer them.
- A home with no zip code keeps the climate answer it already has.

**Must be true**
1. Homehub asks for a zip code only: never a street address, never device location permission.
2. The field is skippable. ~~It appears after the first item is saved.~~ Superseded 2026-11-18 by D8: it is the first screen after sign-in.
3. Every conclusion drawn from the zip code is visible and reversible in one step.
4. Regional tasks are never added without a tap on Add.
5. A home in a freeze-free zip code is never shown a winterizing task.
6. The lookup is a bundled table read on the server or in a lazy chunk. No third-party service receives the zip code.
7. An unknown or non-US zip code says so and falls back to the climate choice.

**Edge cases:** a zip code that spans climates (use the county's, show it, let it be corrected); a second home in another region (the zip code is per home); a home whose members disagree (the home's value, with who set it); existing homes with a climate already chosen (nothing changes until a zip code is entered).

**Not verified yet:** the public county-level sources (DOE/IECC climate zones, FEMA National Risk Index, EPA radon zones) and their terms, the zip-to-county crosswalk, and any reliable hard-water source. Confirming these is the first half day. US only, as in D2.

**Done means:** a mock approved by the owner; the zip table has a recorded source and date; SF Condo, given its zip code, shows no winterizing task; the profile no longer asks the climate question.
