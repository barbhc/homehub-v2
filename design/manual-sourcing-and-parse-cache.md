# Manual sourcing and the shared parse cache

Two proposals from the owner (2026-08-23), for scale and API cost:

1. Keep a registry of major brands and where their manuals live, so a manual
   search is scoped instead of broad.
2. Check whether a manual has already been parsed by another user, and skip the
   re-parse if so.

Both are viable. This doc records what the research found — including the part
that makes proposal 1 worth less than it first appears and proposal 2 worth
more — the four decisions the owner made, the data model, the failure modes,
and what "done" means.

---

## What already exists (and changes the maths)

**There are already two global, cross-user caches in production.** They set the
pattern for anything added here: top-level collection, server-written only,
invalidated by a version stamp baked into the key.

| Collection | Key | TTL / invalidation | Written by |
|---|---|---|---|
| `manualSearchCache` | `brand\|model` (slugged) | 30-day `expiresAt` | `findManual` |
| `productLookupCache` | `sha256(brand, model, category, subType, PROMPT_VERSION)` | prompt version | `productLookup` |

**Search today** (`firebase/functions/src/products/findManual.ts`): Brave Web
Search, at most two queries per *miss* (`"brand model" owner's manual
filetype:pdf`, then a looser fallback), results ranked official-first and
cached for 30 days. Per-user quota 60/day.

**The consequence for proposal 1:** a repeat search for the same brand+model —
by *any* user — already costs nothing. A brand registry therefore saves API
calls only on first-ever lookups and on misses. Its real value is **precision**,
not spend. HH-105 is the evidence: a tester's search returned a page whose title
was the manufacturer's own untranslated placeholder and whose PDF would not
parse. Scoping the query to the official domain is what prevents that.

**Parse today** (`firebase/functions/src/parse/runParse.ts`): fetch PDF → Claude
extraction → write `previewDraft` → user reviews → `commitDraft`. Measured cost
**~$0.55 and ~4 minutes per manual** (42 pages, Sonnet 4.6). Cost scales with
*pages*, not bytes.

**The consequence for proposal 2:** this is where the money is, and the
architecture already splits the cacheable part from the personal part —
`previewDraft` is the raw extraction; house rules, climate and per-user
corrections are applied afterwards in `commitDraft`.

---

## Decisions (owner, 2026-08-23)

1. **Registry is data only.** Brand → official domain(s), used to scope the
   search query and to make "official" a fact rather than a heuristic. No
   per-brand scrapers.
2. **Only official-domain URLs may WRITE to the parse cache.** Uploads may read
   it by content hash but never populate it.
3. **US only**, structured so more locales are data rather than a refactor.
4. **The registry lives in the repo**, reviewed like code.

---

## Proposal 1 — brand registry

### Data model

`shared/products/brandRegistry.ts` — a plain exported array, no runtime source.

```ts
export interface BrandEntry {
  /** Match target: lowercased, non-alphanumerics stripped. */
  brand: string
  /** Official hosts. First is canonical and used for `site:` scoping. */
  domains: string[]
  /** Locale → path hint for the manual index. US only for now; a hint for
   *  humans and future adapters, NOT fetched by anything today. */
  paths?: { us?: string }
  /** Brands that sell under other names ("GE Appliances" → ge.com). */
  aliases?: string[]
}
```

### How it is used

Two call sites, both in `findManual.ts`:

1. **Query scoping.** When the brand resolves to an entry, the first Brave query
   becomes `site:<canonical> "<model>" manual filetype:pdf`. If that returns
   nothing offerable, fall back to today's two unscoped queries — the registry
   narrows, it never blocks.
2. **`looksOfficial()` becomes authoritative.** Today it guesses by comparing
   domain labels to the brand string, which is why it carries a comment about
   two-letter brands. With a registry hit, officialness is a lookup; the
   heuristic stays as the fallback for unregistered brands.

### Why not per-brand scrapers

Considered and declined for now. Each brand's manual index is a bespoke page,
often a JS-rendered search over an internal endpoint; it breaks on redesigns,
needs robots/ToS review per host, and adds a new server-side fetch surface
beyond the one `isAllowedUrl` already guards. The `site:` approach gets most of
the precision for a list anyone can extend in a PR.

### The locale trap

The owner's two example URLs are **regional**: `lg.com/levant_en/support/manuals`
and `samsung.com/latin_en/support/user-manuals-and-guide/`. A US user needs
different paths on the same domains. `domains` is locale-independent and is what
the `site:` scoping uses, so scoping is safe immediately; `paths` is US-only and
explicitly a hint.

---

## Proposal 2 — shared parse cache

### What is cached

**The raw extraction, not the committed tasks.** `previewDraft` (`chunks`,
`tasks`, `confidence`) is a function of the PDF and the prompt alone. Everything
that makes a task personal — house rules, `freezeRisk`/climate suppression, the
user's own past corrections — is applied later, in `commitDraft`, and must keep
running per home.

**Never cache the PDF bytes.** Only derived structure. That keeps this a
question about our own extraction output rather than about redistributing a
manufacturer's document.

### Data model

```
parsedManualCache/{sha256(pdfBytes)}
  promptVersion: number      // bumped when buildPrompt() changes
  model: string              // the Claude model that produced it
  draft: { chunks: [...], tasks: [...], confidence: {...} }
  pdfPages: number | null
  sourceHost: string         // the official domain it came from
  hits: number               // how many parses this has saved
  createdAt, lastUsedAt
```

**Key = sha256 of the PDF bytes**, deliberately:

- *not the URL* — CDN query strings and regional mirrors differ for identical files
- *not brand+model* — revisions differ, and two revisions must not collide
- content hashing also lets an **upload** hit the cache when it is byte-identical
  to a manufacturer PDF someone already fetched, which is the common case for
  "I downloaded the manual myself"

**A read is only a hit when `promptVersion` AND `model` both match.** Otherwise
re-parse. `promptHash` already exists in the eval harness
(`scripts/parse-eval/run.ts`) but **not in production** — production needs the
same stamp, which is a small addition and the piece that makes invalidation
correct rather than hopeful.

### The write rule (the safety boundary)

```
write  ✅  sourceType === "url" AND host is in the brand registry
write  ❌  sourceType === "upload"     — parse locally, store nothing shared
read   ✅  any source, by content hash
```

An uploaded PDF can be anything — a receipt, a lease, a letter. Caching one and
serving its extraction to a stranger who uploads the same bytes would be a leak
with no upside. Restricting writes to files *we* fetched from a registered
manufacturer domain means every shared entry is a document already published to
the public web.

### Rules

`parsedManualCache` is server-only, like `productLookupCache`: no client match
block, so the default deny applies. Clients never read it directly — the parse
worker does the lookup and writes `previewDraft` into the user's own manual doc
exactly as it does today. **Nothing downstream of `previewDraft` changes**,
which is what keeps this change small.

---

## Failure modes

| Failure | Behaviour |
|---|---|
| Registry misses a brand | Falls back to today's unscoped queries. No regression. |
| `site:` scoping returns nothing | Falls back to today's two queries before giving up. |
| Registry names a wrong domain | It only *narrows* a search and marks officialness — it never authorises a fetch on its own; `isAllowedUrl` + `isOfferableManual` still gate every URL. |
| Cache hit on a corrupt/partial draft | Same as today's bad parse: the review sheet's thin-manual warning and the user's own review. Add `hits`/`lastUsedAt` so a bad entry is findable. |
| Prompt changes | `promptVersion` mismatch → miss → re-parse. Old entries age out; no manual purge needed. |
| Two users parse the same manual simultaneously | Both parse, last write wins. Costs one extra parse, harms nothing — no locking. |
| Hash collision | sha256; not a practical concern. |
| Manufacturer replaces the PDF at the same URL | Different bytes → different key → new entry. Correct by construction. |

## What "done" means

- A brand-registry entry changes the query actually sent to Brave — proven by a
  unit test on the query builder, not by inspection.
- `looksOfficial` returns true for a registered domain and still falls back to
  the heuristic for an unregistered brand.
- A second parse of the same manufacturer PDF (same prompt version, same model)
  makes **no Claude call** and produces a `previewDraft` identical to the first.
- An **upload** never writes to the shared cache — pinned by a test, because
  this is the safety boundary and a silent regression here is a leak.
- A prompt-version bump forces a miss.
- Emulator run end to end; no rules widened.

## Expected saving

- **Search:** small. Repeats are already free; the gain is precision, and
  precision is what stops a bad PDF becoming confidently wrong tasks.
- **Parse:** ~$0.55 and ~4 minutes for every manual a second user adds. The
  hit rate depends entirely on how often two users own the same appliance —
  unknowable today, which is why `hits` is in the schema from day one. Ship it,
  then read the number before investing further.
