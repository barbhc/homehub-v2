# Homehub — A Junior Engineer's Complete Guide

> **Who this is for:** You're learning to code by building a real app. This document explains every technical decision, every tool, and every concept used in Homehub — from why we picked certain technologies to how a button click becomes a row in a database.
>
> When you read this on GitHub, it renders as a nicely formatted page. Every heading is a clickable link in the table of contents.

---

## Table of Contents

1. [What This App Actually Is](#1-what-this-app-actually-is)
2. [The Tech Stack at a Glance](#2-the-tech-stack-at-a-glance)
3. [How All the Pieces Connect](#3-how-all-the-pieces-connect)
4. [Git and GitHub — Version Control](#4-git-and-github--version-control)
5. [Vercel — Deployment](#5-vercel--deployment)
6. [The Frontend: React and TypeScript](#6-the-frontend-react-and-typescript)
7. [Vite — The Build Tool](#7-vite--the-build-tool)
8. [Tailwind CSS — Styling](#8-tailwind-css--styling)
9. [Project Structure — How Files Are Organised](#9-project-structure--how-files-are-organised)
10. [PostgreSQL — The Database](#10-postgresql--the-database)
11. [Supabase — The Backend Platform](#11-supabase--the-backend-platform)
12. [Authentication — Who Are You?](#12-authentication--who-are-you)
13. [The Data Model — How Everything Is Stored](#13-the-data-model--how-everything-is-stored)
14. [Row Level Security — The Database's Own Security Guard](#14-row-level-security--the-databases-own-security-guard)
15. [Migrations — Changing the Database Safely](#15-migrations--changing-the-database-safely)
16. [Edge Functions — Server Code Without a Server](#16-edge-functions--server-code-without-a-server)
17. [The Task Pipeline — End to End](#17-the-task-pipeline--end-to-end)
18. [Bugs We Found and What We Learned](#18-bugs-we-found-and-what-we-learned)
19. [Future Features: AI and RAG](#19-future-features-ai-and-rag)
20. [Vocabulary Reference](#20-vocabulary-reference)
21. [The Manual Search Feature — Finding Model-Specific Manuals](#21-the-manual-search-feature--finding-model-specific-manuals)
22. [Debugging Without a Debugger — Static Code Analysis](#22-debugging-without-a-debugger--static-code-analysis)
23. [Lessons From March 4, 2026](#23-lessons-from-this-session)
24. [The CHO Design System — Tailwind v4 Tokens](#24-the-cho-design-system--tailwind-v4-tokens)
25. [The Ask / Chat Feature — SSE Streaming and RAG](#25-the-ask--chat-feature--sse-streaming-and-rag)
26. [The Inventory Page — Lucide Icons and Room Tabs](#26-the-inventory-page--lucide-icons-and-room-tabs)
27. [Lessons From March 17, 2026](#27-lessons-from-march-17-2026)
28. [Lessons From March 27, 2026](#28-lessons-from-march-27-2026)

---

## 1. What This App Actually Is

Homehub is a **home management app**. It lets you:
- Track every item in your home (appliances, furniture, systems)
- Store the manual for each item
- Get AI-generated maintenance and cleaning tasks for each item
- Run a guided cleaning session with a room-by-room checklist
- See what needs attention on a dashboard

From an engineering standpoint, it's a **single-page application (SPA)** with a **serverless backend**. That means:

- There's one HTML page (`index.html`). JavaScript takes over and handles all the navigation.
- There's no server that we run. Instead we use services (Supabase, Vercel) that handle the infrastructure for us.

---

## 2. The Tech Stack at a Glance

A "stack" is the collection of technologies you use to build an app. Here's ours, and why each piece was chosen:

| Layer | Technology | What it does | Why we chose it |
|-------|-----------|--------------|-----------------|
| Language | **TypeScript** | The language we write code in | Catches bugs before they happen |
| UI Framework | **React 19** | Builds the user interface | Most popular, great ecosystem |
| Build Tool | **Vite 7** | Bundles code for the browser | Fast, modern, works great with React |
| Styling | **Tailwind CSS 4** | Makes things look good | Write styles inline, no separate CSS files |
| UI Components | **Radix UI / shadcn** | Pre-built accessible components | Buttons, dropdowns etc. done right |
| Routing | **React Router 7** | Handles page navigation | Standard for React apps |
| Database | **PostgreSQL** | Stores all our data | The world's most reliable open-source database |
| Backend Platform | **Supabase** | Auth + DB + Storage + Functions | Replaces an entire backend team |
| Hosting | **Vercel** | Puts the app on the internet | Zero-config deployment for React apps |
| Version Control | **Git + GitHub** | Tracks every code change | Industry standard |
| AI | **Anthropic Claude API** | Generates task suggestions | Best-in-class reasoning for structured output |

---

## 3. How All the Pieces Connect

Here's the big picture of how a user interacting with the app flows through all our tools:

```
Your Laptop
│
└── You write code in VS Code / Cursor
       │
       └── git push → GitHub (stores your code history)
                          │
                          └── Vercel sees the push → builds and deploys
                                     │
                                     └── homehub.vercel.app (live on the internet)
                                                │
                                                └── User opens the app in their browser
                                                           │
                                                     ┌─────▼──────────────────┐
                                                     │    React App (JS)       │
                                                     │  runs in the browser    │
                                                     └─────────────────────────┘
                                                                │
                                          ┌─────────────────────▼──────────────────────┐
                                          │                 Supabase                    │
                                          │                                             │
                                          │   ┌──────────┐   ┌────────────────────┐    │
                                          │   │   Auth   │   │  PostgREST API     │    │
                                          │   │  (login) │   │  (talks to DB)     │    │
                                          │   └──────────┘   └────────────────────┘    │
                                          │   ┌──────────┐   ┌────────────────────┐    │
                                          │   │ Storage  │   │  Edge Functions    │    │
                                          │   │  (files) │   │  (AI calls, etc.)  │    │
                                          │   └──────────┘   └────────────────────┘    │
                                          │                  ┌────────────────────┐    │
                                          │                  │     PostgreSQL      │    │
                                          │                  │     (database)      │    │
                                          │                  └────────────────────┘    │
                                          └─────────────────────────────────────────────┘
                                                                │
                                                    ┌───────────▼────────────┐
                                                    │   Anthropic Claude API  │
                                                    │   (AI task generation)  │
                                                    └────────────────────────┘
```

---

## 4. Git and GitHub — Version Control

### What is version control?

Imagine you're writing a document and you want to save a snapshot every time you make a significant change — so you can go back if you make a mistake. That's version control, but for code.

**Git** is the tool that does this on your computer. **GitHub** is the website that stores those snapshots in the cloud, so they're safe and shareable.

### The core concepts

**Repository (repo):** A folder that Git is tracking. Our repo is `/Users/barbchang/Projects/Homehub`. Everything inside it — every file, every change — is tracked.

**Commit:** A saved snapshot of your code at a moment in time. Think of it like hitting "Save" in a video game. Every commit has:
- A unique ID (a long string like `2995237c06df`)
- A message describing what changed
- The author (name + email)
- A timestamp

```bash
# See recent commits
git log --oneline

# Output looks like:
# 339dac6 Fix git author email for Vercel deployment
# 2995237 Trigger redeploy after disabling deployment protection
# 055c8bb Add password recovery flow
```

**Branch:** A parallel version of your code. You branch off to work on a feature without breaking the main code. When you're done, you merge it back. We mostly work directly on `main` for this project.

**Push:** Sending your local commits to GitHub so they're backed up and visible online.

```bash
git push                    # sends commits to GitHub
git pull                    # gets commits from GitHub
```

### The workflow we use

```
1. Write code on your laptop
2. git add <filename>          ← stage the changed file
3. git commit -m "description" ← save a snapshot
4. git push                    ← send to GitHub
```

### Why your commits need a real email

This caused a real bug in this project. Git attaches your name and email to every commit. By default, macOS set the email to `barbchang@Barbs-MacBook-Air.local` — a fake local hostname, not a real email.

Vercel checks whether the person who pushed a commit has a Vercel account by matching the commit's email to a GitHub account. If the email doesn't match any real GitHub user, Vercel blocks the deployment with "no git user associated with the commit."

The fix:
```bash
git config --global user.email "barb.chang@gmail.com"
git config --global user.name "Barb Chang"
```

`--global` means this applies to every repo on your machine, not just this one.

---

## 5. Vercel — Deployment

### What deployment means

Your code lives on your laptop. For other people to use the app, it needs to live on a server connected to the internet. **Deployment** is the process of putting your code on that server.

**Vercel** automates this completely. You don't touch a server. You just push code to GitHub, and Vercel handles the rest.

### How it works step by step

```
1. You run:  git push

2. GitHub receives the code and notifies Vercel (via a "webhook" — a notification URL)

3. Vercel starts a "build":
   - Installs dependencies (npm install)
   - Runs the build command (npm run build / vite build)
   - This produces a dist/ folder full of optimised HTML, CSS, and JS

4. Vercel deploys the dist/ folder to its global CDN
   (a CDN = Content Delivery Network = servers spread around the world
    so users get served from the server closest to them)

5. Your site is live at homehub.vercel.app
```

### Production vs. Preview deployments

Every push to `main` creates a **production deployment** — the live site everyone sees.

If you push to any other branch, Vercel creates a **preview deployment** with a unique URL (like `homehub-git-feature-xyz-barbhcs-projects.vercel.app`). You can share this link to show someone a work-in-progress without affecting the live site.

### Environment variables in Vercel

Your code needs secrets (like the Supabase URL and API key) that shouldn't be in your code. You store these in Vercel's dashboard under **Settings → Environment Variables**:

```
VITE_SUPABASE_URL     = https://yourproject.supabase.co
VITE_SUPABASE_ANON_KEY = your-anon-key
```

Vercel injects these into the build process. The code accesses them via `import.meta.env.VITE_SUPABASE_URL`.

### The SPA routing problem and how we solved it

Single-page apps have a quirk: the server only has one real file (`index.html`). If a user goes directly to `homehub.vercel.app/inventory`, the server looks for a file at `/inventory/index.html`, doesn't find it, and returns a 404 error.

We fixed this with `vercel.json` at the project root:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This tells Vercel: "no matter what URL someone requests, serve `index.html`." React Router then reads the URL and shows the right page.

---

## 6. The Frontend: React and TypeScript

### What is a framework?

A framework is a set of rules and tools that give you a structured way to build something. Without a framework, you'd be writing raw HTML and JavaScript, manually updating the page every time data changes.

**React** solves the "updating the page" problem. You describe what the UI should look like for a given state, and React figures out the minimum changes needed to update the actual page.

### Components — the building blocks

Everything in React is a **component**: a reusable piece of UI. A component is just a JavaScript function that returns some HTML-like code.

```tsx
// A simple component
function WelcomeMessage({ name }: { name: string }) {
  return <p>Hello, {name}!</p>
}

// Using it
<WelcomeMessage name="Barb" />
// Renders: <p>Hello, Barb!</p>
```

The HTML-like syntax is called **JSX**. It looks like HTML but it's JavaScript. The curly braces `{}` let you put real JavaScript expressions inside it.

### State — what makes things interactive

**State** is data that can change and that the component cares about. When state changes, React automatically re-renders the component.

```tsx
function Counter() {
  const [count, setCount] = useState(0)  // count starts at 0

  return (
    <div>
      <p>You clicked {count} times</p>
      <button onClick={() => setCount(count + 1)}>
        Click me
      </button>
    </div>
  )
}
```

`useState(0)` returns two things: the current value (`count`) and a function to update it (`setCount`). When you call `setCount`, React re-renders the component with the new count.

### Props — passing data between components

**Props** (short for properties) are how you pass data from a parent component to a child component. They're like function arguments.

```tsx
// Parent passes data as props
<TaskCard
  title="Clean refrigerator coils"
  dueDate="2026-04-01"
  priority="recommended"
/>

// Child receives them
function TaskCard({ title, dueDate, priority }) {
  return (
    <div>
      <h3>{title}</h3>
      <p>Due: {dueDate}</p>
      <span>{priority}</span>
    </div>
  )
}
```

### Context — sharing data without passing props everywhere

The problem: what if 10 different components all need to know who the current user is? You'd have to pass the user as a prop through every component in between. This is called **prop drilling** and it's messy.

**Context** is React's solution. You wrap your app in a **Provider** that holds the data, and any component can read it directly.

```tsx
// In HomeProvider.tsx:
const HomeContext = createContext(null)

export function HomeProvider({ children }) {
  const [home, setHome] = useState(null)
  // ... fetch home from database ...
  return (
    <HomeContext.Provider value={{ home }}>
      {children}
    </HomeContext.Provider>
  )
}

// Anywhere in the app:
function CleanPage() {
  const { home } = useCurrentHome()  // reads from context
  // now has access to home without it being passed as a prop
}
```

Our app has two providers, nested inside each other:
```
<AuthProvider>        ← provides: who is logged in
  <HomeProvider>      ← provides: which home we're viewing
    <RouterProvider>  ← all the pages
    </RouterProvider>
  </HomeProvider>
</AuthProvider>
```

### useEffect — doing things when something changes

`useEffect` runs code in response to something changing. The most common use: fetch data when a page loads.

```tsx
function InventoryPage() {
  const [items, setItems] = useState([])
  const { home } = useCurrentHome()

  useEffect(() => {
    if (!home) return

    // This runs when home changes (including the first time)
    getItems(home.home_id).then(setItems)

  }, [home])  // ← the "dependency array": only re-run if home changes
}
```

The dependency array `[home]` is critical. If you leave it empty `[]`, the effect runs once on mount. If you leave it out entirely, it runs on every render (usually a bug).

### TypeScript — catching bugs before they happen

TypeScript adds **types** to JavaScript. A type is a description of what shape a value has.

```ts
// Without TypeScript — JS has no idea what task is
function showTask(task) {
  console.log(task.titel)  // typo! but JS won't warn you until runtime
}

// With TypeScript — the shape is defined
interface Task {
  title: string
  dueDate: string | null
  priority: "essential" | "recommended" | "optional" | "low"
}

function showTask(task: Task) {
  console.log(task.titel)  // ← TypeScript: ERROR — "titel" doesn't exist on Task
  console.log(task.title)  // ← correct
}
```

The `| null` pattern is TypeScript being honest: this value might be null. TypeScript forces you to handle that case before using the value.

Union types restrict a variable to specific values:
```ts
type Priority = "essential" | "recommended" | "optional" | "low"
// You can't accidentally assign priority = "urgent" — TypeScript rejects it
```

---

## 7. Vite — The Build Tool

### The problem Vite solves

Browsers can't run TypeScript directly. They can't use modern module imports efficiently. A **build tool** transforms your code into something browsers can understand.

Vite does two jobs:

1. **Development mode** (`npm run dev`): Runs a local server at `localhost:5173`. Every time you save a file, only that module is swapped in the browser — no full page reload. This is called **Hot Module Replacement (HMR)** and it makes development feel instant.

2. **Production build** (`npm run build`): Transforms all your TypeScript into JavaScript, combines it into bundles, minifies it (removes whitespace and shortens variable names to reduce file size), and outputs everything to `dist/`.

### Environment variables

Your `.env` file stores configuration that changes between environments:

```bash
# .env (never commit this file!)
VITE_SUPABASE_URL=https://yourproject.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

The `VITE_` prefix is a security boundary. Vite only puts variables with this prefix into the browser bundle. Any secret that doesn't need to be in the browser (like a server-side API key) should NOT have this prefix — Vite will keep it out of the bundle.

---

## 8. Tailwind CSS — Styling

### The traditional approach vs. Tailwind

**Traditional CSS:**
```css
/* styles.css */
.task-card {
  padding: 16px;
  border-radius: 8px;
  background-color: #f5f5f5;
  border: 1px solid #e0e0e0;
}
```
```html
<div class="task-card">...</div>
```

**Tailwind:**
```html
<div class="p-4 rounded-lg bg-muted/40 border border-border">...</div>
```

Tailwind's approach: instead of writing CSS classes, you use tiny **utility classes** that do one thing each:
- `p-4` = padding of 16px (1rem)
- `rounded-lg` = border-radius
- `bg-muted/40` = background color with 40% opacity
- `border border-border` = a border with the theme's border color

### Why this works for this project

No separate CSS files to maintain. No naming CSS classes. Everything is co-located with the HTML. When you delete a component, all its styles go with it — no orphaned CSS.

The downside: class names can get long. This is the trade-off.

### The `cn()` utility

You'll see `cn()` used everywhere in this codebase:

```tsx
import { cn } from "@/lib/utils"

<div className={cn(
  "p-4 rounded-lg border",            // always applied
  isSelected && "border-primary bg-primary/10",  // only when selected
  isDisabled && "opacity-50 cursor-not-allowed"   // only when disabled
)}>
```

`cn()` is a helper that intelligently merges class names. It handles the case where you conditionally want to apply classes, and it resolves conflicts (if two classes affect the same property, the last one wins).

---

## 9. Project Structure — How Files Are Organised

```
src/
├── integrations/
│   └── supabase/
│       ├── client.ts          ← The Supabase connection (used everywhere)
│       └── types.ts           ← Auto-generated types from your DB schema
│
├── modules/                   ← Feature domains (see below)
│   ├── auth/                  ← Sign in, sign up, session
│   ├── home/                  ← Which home are we viewing
│   ├── care/                  ← Task templates, instances, schedules
│   └── inventory/             ← Items, manuals, OCR, AI task generation
│
├── components/
│   ├── ui/                    ← Generic primitives (Button, Card, Input...)
│   ├── layout/                ← PageContainer, PageHeader, SectionCard...
│   ├── dashboard/             ← Dashboard-specific components
│   ├── tasks/                 ← TierBadge, EffortLabel
│   └── smart-add/             ← Add-item wizard components
│
├── pages/                     ← One file per route
│   ├── Home.tsx               ← Dashboard
│   ├── Inventory.tsx          ← Item list
│   ├── ItemDetailPage.tsx     ← Single item + tasks
│   ├── Maintenance.tsx        ← All tasks view
│   ├── DeepClean.tsx          ← Guided cleaning session
│   ├── Settings.tsx           ← Room management
│   └── AddItem.tsx            ← Add new item
│
├── lib/
│   ├── dashboard.ts           ← Data fetching for dashboard + maintenance
│   ├── cleanSession.ts        ← Data fetching for cleaning sessions
│   └── utils.ts               ← cn() and other helpers
│
└── supabase/
    ├── migrations/            ← SQL files that define/change the database
    └── functions/             ← Edge Functions (server-side code)
        ├── generate-tasks/    ← AI task generation via Claude
        ├── parse-manual/      ← Extract tasks from a PDF manual
        ├── save-parsed-manual/← Save those tasks to the database
        ├── ocr/               ← Extract text from images
        ├── manual-search/     ← Find product manuals online
        └── preview-manual/    ← Preview a manual PDF
```

### The module pattern

The `modules/` folder organises code by **what it does** (domain) rather than **what kind of file it is** (type). Each module owns everything related to its domain:

```
modules/care/
├── components/       ← React components specific to this module
├── services/         ← Functions that talk to the database
│   ├── taskService.ts
│   └── scheduleService.ts
└── index.ts          ← Public API: only exports what other modules need
```

The `index.ts` is like a shop front. Other modules can only use what's explicitly exported there. Internal details stay hidden. This prevents tangled dependencies across the app.

---

## 10. PostgreSQL — The Database

### What is a database?

A database stores data persistently. Without a database, all your app's data would disappear when the server restarts (or when you close the browser tab).

**PostgreSQL** (usually called "Postgres") stores data in **tables**, like spreadsheets. Each table has columns (fields) and rows (records).

```
item_unit table:
┌──────────────┬──────────────────┬──────────┬──────────────┐
│ item_unit_id │  display_name    │ home_id  │  room_id     │
├──────────────┼──────────────────┼──────────┼──────────────┤
│ abc-123      │ Samsung Fridge   │ home-456 │ room-789     │
│ def-456      │ KitchenAid Mixer │ home-456 │ room-789     │
│ ghi-789      │ Dyson V15        │ home-456 │ room-222     │
└──────────────┴──────────────────┴──────────┴──────────────┘
```

### Relational databases and foreign keys

Tables are **related** to each other through **foreign keys** — one table's column contains the ID of a row in another table.

```
home table               item_unit table
┌──────────┬───────┐     ┌──────────────┬──────────┐
│ home_id  │ name  │     │ item_unit_id │ home_id  │← this is a foreign key
├──────────┼───────┤     ├──────────────┼──────────┤
│ home-456 │ Casa  │◄────│ abc-123      │ home-456 │
└──────────┴───────┘     │ def-456      │ home-456 │
                         └──────────────┴──────────┘
```

The relationship says: "this item belongs to this home." If you query an item, you can follow the foreign key to get the home's data too — this is called a **JOIN**.

### Key SQL concepts

**UUID primary keys:** Every row gets a universally unique ID:
```sql
item_unit_id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```
UUIDs look like `f47ac10b-58cc-4372-a567-0e02b2c3d479`. They're generated automatically and are impossible to guess — better than sequential IDs (1, 2, 3...) which are predictable.

**NOT NULL constraints:** Force a column to always have a value:
```sql
display_name TEXT NOT NULL  -- can't insert a row without a name
```

**Cascade deletes:** Automatically delete child rows when the parent is deleted:
```sql
item_unit_id UUID REFERENCES item_unit(item_unit_id) ON DELETE CASCADE
-- If you delete the item, all its tasks are deleted too
```

**Enums:** Restrict a column to specific allowed values:
```sql
CREATE TYPE care_type AS ENUM ('cleaning', 'maintenance', 'mixed');
-- The database will reject any value not in that list
```

**Indexes:** Speed up lookups:
```sql
CREATE INDEX idx_task_instance_home ON task_instance(home_id);
```
Without an index, finding all tasks for a home means scanning every row. With an index, Postgres jumps directly to the matching rows. The trade-off: indexes take up space and slow down writes slightly.

**JSONB:** Flexible JSON storage inside a column:
```sql
specs JSONB  -- can store any JSON: {"capacity_kg": 8, "energy_rating": "A++"}
```
Useful when different items have different fields. The downside: no type safety.

### SQL vs. the Supabase client

You rarely write raw SQL in this project. The Supabase JavaScript client translates method calls into SQL for you:

```ts
// This TypeScript:
await supabase
  .from("item_unit")
  .select("display_name, room_id")
  .eq("home_id", homeId)
  .eq("status", "active")

// Becomes this SQL (roughly):
// SELECT display_name, room_id
// FROM item_unit
// WHERE home_id = 'home-456'
// AND status = 'active'
```

---

## 11. Supabase — The Backend Platform

### The problem Supabase solves

Building a backend server normally means: setting up a Node.js server, writing an API, handling authentication, managing database connections, setting up file storage, deploying and maintaining a server...

Supabase does all of that for you. You focus on your app; Supabase handles the infrastructure.

### What Supabase gives us

**1. PostgreSQL database** — A full real Postgres database. All your data lives here.

**2. Auto-generated REST API (PostgREST)** — Supabase reads your database schema and automatically creates an API. You don't write any API code. The Supabase JavaScript client talks to this API.

**3. Authentication** — User sign-up, sign-in, password reset, sessions. Handled completely.

**4. Storage** — Like Amazon S3, but integrated. We use it to store PDF manuals and item photos.

**5. Edge Functions** — Server-side code (like calling the Anthropic AI API) that runs securely without exposing secrets to the browser.

**6. Row Level Security** — Database-level access control (more on this in Section 14).

### The Supabase client

One file sets up the connection and exports it for the whole app:

```ts
// src/integrations/supabase/client.ts
import { createClient } from "@supabase/supabase-js"

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

The **anon key** is intentionally public — it's the key for anonymous/unauthenticated access. Real security comes from Row Level Security policies in the database, not from keeping this key secret.

Every service file in the app imports `supabase` from this one place and calls it to read/write data.

### Querying with joins

The Supabase client can follow foreign keys to fetch related data in one query:

```ts
// Get task instances AND their template AND the item AND the room
const { data } = await supabase
  .from("task_instance")
  .select(`
    task_instance_id,
    due_date,
    task_template:task_template_id(title, priority_tier),
    item_unit:item_unit_id(display_name, room:room_id(name))
  `)
  .eq("home_id", homeId)
```

The `task_template:task_template_id(title, priority_tier)` syntax means: "follow the `task_template_id` foreign key to the `task_template` table, and bring back `title` and `priority_tier`, aliased as `task_template`."

The result is nested data:
```json
{
  "task_instance_id": "...",
  "due_date": "2026-04-01",
  "task_template": { "title": "Clean coils", "priority_tier": "recommended" },
  "item_unit": {
    "display_name": "Samsung Fridge",
    "room": { "name": "Kitchen" }
  }
}
```

One query, all the data you need. No separate API call for each piece.

### Always handle errors

Every Supabase call returns `{ data, error }`. One of them is null.

```ts
const { data, error } = await supabase.from("item_unit").select("*")

if (error) {
  // Something went wrong — tell the user, don't proceed
  throw new Error(error.message)
}

// Now it's safe to use data
console.log(data)
```

If you ignore the error and try to use `data` directly, you'll get mysterious crashes when the database is unavailable or a query fails.

### Storage — files and photos

We have one bucket called `Manuals` (capital M) that stores both PDF manuals and item photos:

```ts
// Upload a photo
await supabase.storage
  .from("Manuals")
  .upload(`photos/${itemUnitId}/${filename}`, file)

// Get a public URL for a photo
const { data } = supabase.storage
  .from("Manuals")
  .getPublicUrl(`photos/${itemUnitId}/${filename}`)
```

Buckets can be public (anyone with the URL can access files) or private (requires authentication). Our `Manuals` bucket is public for simplicity — the paths include item IDs which aren't guessable.

---

## 12. Authentication — Who Are You?

### How Supabase Auth works

When a user signs in, Supabase creates a **JWT (JSON Web Token)** — a cryptographically signed string that proves who the user is. It looks like a long random string but contains encoded information.

```
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.abc123...
```

The Supabase client stores this JWT in `localStorage` automatically. Every subsequent request to Supabase includes this JWT in the request header. Supabase reads the JWT to know who `auth.uid()` is — this is used in Row Level Security policies to control access.

### The auth flow in our app

```
User opens the app
       │
       ▼
supabase.auth.getSession()
       │
       ├── No session found → show SignIn page
       │
       └── Session found (JWT in localStorage)
              │
              ▼
         AuthProvider sets the user in context
              │
              ▼
         HomeProvider fetches the user's home
              │
              ├── No home → show Home Setup (onboarding)
              │
              └── Home found → show the app
```

### Where auth lives in the code

The `AuthProvider` wraps the entire app:

```tsx
// Simplified version of src/modules/auth/
function AuthProvider({ children }) {
  const [user, setUser] = useState(null)

  useEffect(() => {
    // Check if already signed in on page load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    // Listen for future sign-in/sign-out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    )

    return () => subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>
}
```

`onAuthStateChange` fires whenever the auth state changes: sign in, sign out, token refresh (JWTs expire and need refreshing — the client handles this automatically).

### Password recovery

The password recovery flow works like this:
1. User enters email on the forgot-password page
2. App calls `supabase.auth.resetPasswordForEmail(email)`
3. Supabase sends an email with a recovery link
4. User clicks the link → lands on the app with a special token in the URL
5. App detects the `PASSWORD_RECOVERY` event in `onAuthStateChange`
6. App shows a "set new password" form
7. App calls `supabase.auth.updateUser({ password: newPassword })`

---

## 13. The Data Model — How Everything Is Stored

This is the current database schema. Understanding this is understanding the app.

### The entity hierarchy

```
home                    ← The property (your house)
 │
 ├── room               ← Rooms within the home (Kitchen, Living Room...)
 │
 └── item_unit          ← Items in the home (Samsung Fridge, Dyson V15...)
      │
      └── task_template  ← A task definition ("Clean refrigerator coils")
           │
           ├── schedule_rule  ← When/how often to do it ("every 6 months")
           │
           └── task_instance  ← A specific scheduled occurrence
                               ("Due 2026-04-01, status: scheduled")
```

### home

The top-level entity. A user can have multiple homes; a home can have multiple members (for future multi-user support).

```sql
home (
  home_id UUID PRIMARY KEY,
  name TEXT NOT NULL,           -- "Casa Barb"
  address TEXT,
  home_type home_type           -- 'house', 'condo', 'apartment'...
)
```

### room

Rooms within a home. Items and tasks can be associated with a room.

```sql
room (
  room_id UUID PRIMARY KEY,
  home_id UUID REFERENCES home,
  name TEXT NOT NULL            -- "Kitchen", "Master Bathroom"...
)
```

Default rooms are seeded when a home is created: Kitchen, Living Room, Master Bedroom, Bathroom, Garage, Basement.

### item_unit

A physical item in the home. The core entity everything else hangs off of.

```sql
item_unit (
  item_unit_id UUID PRIMARY KEY,
  home_id UUID REFERENCES home,
  room_id UUID REFERENCES room,   -- nullable: item might not be in a room yet
  display_name TEXT NOT NULL,      -- "Samsung French Door Fridge"
  category TEXT,                   -- "Appliance", "HVAC", "Plumbing"...
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  purchase_date DATE,
  status item_status               -- 'active', 'sold', 'disposed'...
)
```

### task_template

A **definition** of a task — what to do, for which item. Think of this as the recipe.

```sql
task_template (
  task_template_id UUID PRIMARY KEY,
  home_id UUID REFERENCES home,
  item_unit_id UUID REFERENCES item_unit,  -- null for home-wide tasks
  title TEXT NOT NULL,              -- "Clean refrigerator coils"
  care_type care_type,              -- 'cleaning', 'maintenance', 'mixed'
  scope_type scope_type,            -- 'item' or 'home'
  priority_tier priority_tier,      -- 'essential', 'recommended', 'optional', 'low'
  estimated_minutes INTEGER,        -- how long it takes
  source task_source,               -- 'ai', 'user', 'system'
  is_active BOOLEAN DEFAULT true
)
```

### schedule_rule

How often the task should happen. Separate from the template because one template could theoretically have multiple schedule rules.

```sql
schedule_rule (
  schedule_rule_id UUID PRIMARY KEY,
  task_template_id UUID REFERENCES task_template,
  schedule_type schedule_type,      -- 'weekly', 'monthly', 'quarterly', 'annual'...
  interval_days INTEGER,            -- for 'every_n_days' type
  anchor_date DATE,                 -- for annual tasks (e.g., "every April 1st")
  window_days_before INTEGER,       -- how early to show the task before it's due
  window_days_after INTEGER         -- how late before marking as overdue
)
```

### task_instance

A **specific occurrence** of a task. This is what shows up in the UI. Think of this as the scheduled appointment.

```sql
task_instance (
  task_instance_id UUID PRIMARY KEY,
  home_id UUID REFERENCES home,
  task_template_id UUID REFERENCES task_template,
  item_unit_id UUID REFERENCES item_unit,
  due_date DATE NOT NULL,
  status instance_status,           -- 'scheduled', 'done', 'snoozed', 'skipped'
  completed_at TIMESTAMPTZ,         -- when it was marked done
  priority_score NUMERIC            -- computed score for sorting
)
```

### Why template + instance instead of just one table?

This is a key design decision. Consider an annual task "Replace HVAC filter":

- **One table approach:** You'd have one row. When it's done, you update `next_due_date` and lose history.
- **Template + instance approach:**
  - `task_template`: stores the definition forever ("Replace HVAC filter, annually")
  - `task_instance` 2024: "Replace HVAC filter — done March 2024"
  - `task_instance` 2025: "Replace HVAC filter — done April 2025"
  - `task_instance` 2026: "Replace HVAC filter — due March 2026, scheduled"

The template+instance pattern gives you complete history, better querying, and the ability to see trends (is this task getting done on time?).

---

## 14. Row Level Security — The Database's Own Security Guard

### Why this matters

This app has **no backend server of its own**. The React app in the browser talks directly to Supabase. This means: if we didn't have Row Level Security, a malicious user could craft a request like "give me all items for home-abc" and get someone else's data.

**Row Level Security (RLS)** is Postgres's built-in solution. Policies are rules that the database itself enforces, on every single query, no matter where it comes from.

### How it works

```sql
-- Enable RLS on a table
ALTER TABLE item_unit ENABLE ROW LEVEL SECURITY;

-- Create a policy
CREATE POLICY "Users can only see their own items"
  ON item_unit FOR SELECT
  USING (
    home_id IN (
      SELECT home_id FROM home_member WHERE user_id = auth.uid()
    )
  );
```

`auth.uid()` is a Supabase function that reads the current user's ID from their JWT. This policy says: "when selecting from `item_unit`, only return rows where the `home_id` is in the list of homes this user belongs to."

This check happens inside Postgres before any data is returned. There's no way around it.

### The security chain

All policies follow the same pattern:

```
"Can this user access this row?"
    │
    └── Is this row's home_id in the homes the user is a member of?
              │
              └── Query: SELECT home_id FROM home_member WHERE user_id = auth.uid()
```

`home_member` is the single source of truth for all access control. If a user is a member of a home, they can see everything in that home.

### FOR ALL vs. per-operation policies

We learned this the hard way. PostgreSQL has a subtlety:

```sql
-- WRONG: FOR ALL doesn't cover INSERT
CREATE POLICY "access" ON item_unit FOR ALL USING (home_id IN (...));

-- RIGHT: INSERT uses WITH CHECK, not USING
CREATE POLICY "view items" ON item_unit FOR SELECT USING (home_id IN (...));
CREATE POLICY "modify items" ON item_unit FOR UPDATE USING (home_id IN (...));
CREATE POLICY "insert items" ON item_unit FOR INSERT WITH CHECK (home_id IN (...));
```

`USING` filters which existing rows you can access. `WITH CHECK` validates that new rows you're inserting meet the policy. `FOR ALL` applies `USING` to all operations — but INSERT is checked with `WITH CHECK`, not `USING`, so `FOR ALL` with only `USING` silently allows all inserts.

---

## 15. Migrations — Changing the Database Safely

### What is a migration?

A migration is a SQL file that makes a specific, versioned change to the database. Every change to the database schema — adding a table, adding a column, creating an index — is done through a migration file.

```
supabase/migrations/
├── 20260228000000_cho_data_model_v1_1.sql    ← The base schema
├── 20260210000001_rooms.sql                   ← Added rooms
├── 20260210000009_task_effort.sql             ← Added effort column
└── 20260210000010_seed_default_rooms.sql      ← Seeded default rooms
```

The number prefix is a timestamp — it ensures migrations are applied in the right order.

### Why migrations instead of just changing the database manually?

1. **Reproducibility:** Any developer (or deployment environment) can run all migrations to get the exact same database structure.
2. **History:** You can see exactly what changed and when.
3. **Safety:** Migrations are reviewed before being applied. You can't accidentally drop a production table by clicking the wrong thing in a GUI.

### An example migration

```sql
-- 20260210000009_task_effort.sql

-- Add an enum type for effort levels
CREATE TYPE effort_level AS ENUM ('short', 'medium', 'long');

-- Add the column to the task template table
ALTER TABLE task_template
  ADD COLUMN effort effort_level;

-- Update existing rows with a sensible default
UPDATE task_template
SET effort = CASE
  WHEN estimated_minutes <= 20 THEN 'short'
  WHEN estimated_minutes <= 45 THEN 'medium'
  ELSE 'long'
END
WHERE estimated_minutes IS NOT NULL;
```

### The trigger pattern

One migration creates a Postgres trigger that automatically creates a user profile whenever someone signs up:

```sql
-- When a new row is inserted into auth.users (Supabase's internal table)...
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ...run this function
CREATE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.home_member (user_id, ...)  -- auto-create profile
  VALUES (NEW.id, ...);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

`NEW` refers to the row being inserted (the new user). `SECURITY DEFINER` means the function runs with the database owner's permissions, allowing it to write to `home_member` even before the user has a session.

---

## 16. Edge Functions — Server Code Without a Server

### Why we need server-side code

The browser can't safely store secret API keys. If you put your Anthropic API key in your React code, anyone could view the page source and steal it.

**Edge Functions** are server-side TypeScript files that run on Supabase's infrastructure. The browser calls the function, the function uses the secret key, and only the result comes back to the browser. The key never touches the browser.

### Our edge functions

```
supabase/functions/
├── generate-tasks/      ← Sends item info to Claude, gets maintenance task suggestions
├── parse-manual/        ← Sends a PDF manual to Claude, extracts structured task data
├── save-parsed-manual/  ← Saves parsed tasks to the database as task_templates
├── preview-manual/      ← Returns a quick preview of what's in a manual
├── ocr/                 ← Sends an image to an OCR service, returns text
└── manual-search/       ← Searches the web for a product manual PDF
```

### The generate-tasks function

This is the most important edge function. It takes an item's details and asks Claude to generate maintenance/cleaning tasks for it:

```
Browser → POST /functions/v1/generate-tasks
         { itemName: "Samsung French Door Fridge", brand: "Samsung", manualUrl: "..." }

Edge function:
1. Receives the request
2. Optionally downloads the manual PDF from the URL
3. Sends the item info (+ manual if available) to Claude API:
   "Given this refrigerator, generate a maintenance task list with:
    - title, care_type, priority_tier, estimated_minutes, schedule_type"
4. Claude responds with structured JSON
5. Edge function returns the JSON to the browser

Browser receives:
[
  { title: "Clean condenser coils", care_type: "maintenance", priority_tier: "recommended", ... },
  { title: "Replace water filter", care_type: "maintenance", priority_tier: "essential", ... },
  { title: "Wipe door seals", care_type: "cleaning", priority_tier: "optional", ... }
]
```

### How a function is called from the browser

```ts
// From planGenerationService.ts
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-tasks`,
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ itemName, brand, manualUrl }),
  }
)
const tasks = await response.json()
```

The `Authorization` header includes the user's anon key. Supabase validates this before running the function.

### Edge Functions run on Deno, not Node.js

Edge Functions use **Deno** — a newer JavaScript/TypeScript runtime. The main differences you'll notice:
- Imports use full URLs or npm specifiers, not relative paths
- No `require()` — just `import`
- Built-in TypeScript support without configuration

---

## 17. The Task Pipeline — End to End

Understanding this pipeline is key to understanding why things work (and why they break).

### The full lifecycle of a task

```
1. TEMPLATE CREATION
   User adds an item → item_unit row created
   User parses its manual → generate-tasks edge function runs
   User accepts the suggested tasks → save-parsed-manual edge function runs
   → task_template rows created in the database
   → schedule_rule rows created (one per task, defining frequency)

2. INSTANCE GENERATION
   generateTaskInstances() is called for each template
   → Reads the schedule_rule to determine the next due date
   → Creates a task_instance row: { due_date, status: 'scheduled', ... }

3. DISPLAY
   User views Tasks or Dashboard or starts a Clean session
   → Query task_instance WHERE status IN ('scheduled', 'snoozed')
   → Join to task_template for title, priority, care_type
   → Join to item_unit for item name
   → Join to room for room name
   → Sort by priority_score and due_date

4. COMPLETION
   User marks a task done
   → task_instance.status = 'done', completed_at = now()
   → The next instance will be generated the next time generateTaskInstances() runs
```

### Where we found (and fixed) the missing instance bug

The original `generateTaskInstances` call in `cleanSession.ts` only ran for home-level routine templates. All item-scoped templates (created when a user adds an item and accepts AI-suggested tasks) were never given instances.

**How we diagnosed it:** The app logs `[cleanSession] status distribution: {}` — an empty object — confirming zero task_instance rows existed. The dashboard showed nothing for the same reason.

**The fix in `cleanSession.ts`:**

```ts
// Step 1: fetch ALL active templates for this home
// Step 2: fetch which templates already have a scheduled instance
// Step 3: generate instances ONLY for templates that are missing one

const [{ data: allTpls }, { data: existingInst }] = await Promise.all([
  supabase.from("task_template").select("task_template_id, item_unit_id")
    .eq("home_id", homeId).eq("is_active", true).is("deleted_at", null),
  supabase.from("task_instance").select("task_template_id")
    .eq("home_id", homeId).eq("status", "scheduled").is("deleted_at", null),
])
const templatesWithInstances = new Set(
  (existingInst ?? []).map((r) => r.task_template_id)
)
const needInstances = (allTpls ?? []).filter(
  (t) => !templatesWithInstances.has(t.task_template_id)
)
await Promise.all(
  needInstances.map((t) => generateTaskInstances({ ... }))
)
```

**What this teaches:** When data appears to be "missing", trace the pipeline backward. The problem wasn't in the query — the rows genuinely didn't exist because the generation step had never run for those templates.

### The care_type filter bug

Another bug we found and fixed: `getCleaningTasks()` was filtering task instances to only `care_type = 'cleaning' OR 'mixed'`. But AI-generated tasks are stored with `care_type = 'maintenance'` by default. So the Clean tab showed 0 tasks even when tasks existed.

The fix: remove the care_type filter. The Clean session should show all task types filtered by the rooms selected — the care type distinction isn't meaningful to the user in this context.

### The schedule_type bug

A third bug: the Supabase query in `getCleaningTasks()` was requesting `schedule_type` as a column on `task_template`. But `schedule_type` doesn't exist on `task_template` — it's on `schedule_rule` (a related table). Supabase returned an error, `getCleaningTasks()` threw that error, and because there was no `catch` block in the calling function, the Clean session silently failed to advance to the checklist.

The fix: query `schedule_rule(schedule_type)` as a nested join instead of a direct column.

**What this teaches:** Always add error handling. If a function can throw and there's no `catch`, the user sees "nothing happens" and you see no feedback at all.

---

## 18. Bugs We Found and What We Learned

### Bug 1: "Let's Clean" button does nothing

**Symptom:** Selecting a room + time and clicking "Let's Clean" had no visible effect.

**Root cause:** `getCleaningTasks()` was querying `schedule_type` from `task_template`, but that column doesn't exist there. Supabase returned an error. There was no `catch` block, so the error became an unhandled promise rejection — the function silently failed, `setStep("checklist")` never ran.

**What we learned:**
- Always add a `catch` block to async functions that update UI state
- TypeScript types (in `types.ts`) tell you exactly what columns exist — match your queries to them

### Bug 2: No tasks appear anywhere

**Symptom:** "All Tasks" and the Dashboard showed 0 tasks despite items existing.

**Root cause 1:** Task instances were never generated for item-scoped templates. `generateTaskInstances()` was only called for home-level routine templates from the Clean session — never for items added via the Add Item flow.

**Root cause 2 (dashboard):** `getDashboardTasks()` had an `essentialOnly` filter that only surfaced tasks with `priority === "critical"`. Since most AI-generated tasks default to "recommended" or "optional", the dashboard was empty even when instances existed.

**The fix:** Remove the `essentialOnly` filter. Sort tasks by tier priority (`critical → high → medium → low`) instead of filtering them out. Dashboard now shows all tasks, most urgent first.

**What we learned:**
- When data "disappears" at a query, trace back to see where it's created
- Priority filtering should be a *sort order*, not a *filter*, unless you explicitly want to hide lower-priority items
- Always test with real data — a filter that seems sensible ("show only critical tasks") becomes "show nothing" when your data has no critical tasks yet

### Bug 3: Deployment blocked on Vercel

**Symptom:** Every push to GitHub resulted in "Deployment Blocked — no git user associated with the commit."

**Root cause:** Git was configured with a fake local email (`barbchang@Barbs-MacBook-Air.local`). Vercel tries to match commit authors to GitHub accounts. The fake email matched no account, so Vercel blocked the deployment.

**What we learned:**
- Git user email must match your GitHub account email
- Tools in your deployment pipeline check things you might not expect

**Fix:**
```bash
git config --global user.email "barb.chang@gmail.com"
git config --global user.name "Barb Chang"
git commit --allow-empty -m "Fix author email"
git push
```

---

## 19. Future Features: AI and RAG

### What we're building toward

The goal is for Homehub to be genuinely smart about your home — able to answer questions like "when did I last service my HVAC?" or "what filter does my water heater take?" using your own home's data.

### The current AI capability

Right now, Claude (Anthropic's AI) is used for one thing: generating task lists from manuals. You upload a PDF, Claude reads it, and suggests specific maintenance tasks with frequencies, priorities, and effort levels.

This is a **one-time extraction** — Claude reads the document and we save the structured output to the database.

### What RAG is

**RAG** stands for **Retrieval-Augmented Generation**. It's a technique for making an AI answer questions about *your specific data* rather than just its training data.

Here's the problem RAG solves:

```
User asks: "What filter does my refrigerator use?"

Without RAG:
  Claude answers from general knowledge: "Most Samsung fridges use DA29-00020B filters..."
  This might be wrong for your specific model.

With RAG:
  1. Find relevant chunks from your refrigerator's manual in the database
  2. Send those chunks + the question to Claude
  3. Claude answers: "According to your manual (page 12), your Samsung RF28R7351SR
     uses the HAF-CIN filter, available at Home Depot for ~$50."
```

The key insight: Claude doesn't magically know your manual. You find the relevant parts of the manual, then give them to Claude as context.

### How we'll implement it — step by step

**Step 1: Chunking**

When a manual is parsed, we split it into small pieces called **chunks** (usually 500-1000 words each). Each chunk is stored in the database:

```sql
instruction_chunk (
  chunk_id UUID PRIMARY KEY,
  item_unit_id UUID REFERENCES item_unit,
  chunk_text TEXT,           -- the actual manual text
  chunk_embedding VECTOR,    -- a mathematical representation (see below)
  page_number INTEGER,
  section_title TEXT
)
```

**Step 2: Embeddings**

An **embedding** is a list of ~1500 numbers that represents the meaning of a piece of text. Texts with similar meanings have embeddings that are close together mathematically.

To create an embedding, you send text to an embedding model (like `text-embedding-3-small` from OpenAI):

```ts
const embedding = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: "Replace the water filter every 6 months"
})
// Returns: [0.023, -0.152, 0.891, ...]  (1536 numbers)
```

You store this embedding alongside the text chunk.

**Step 3: Semantic search**

When a user asks a question, you embed their question the same way, then find the chunks whose embeddings are closest to the question's embedding:

```sql
-- Find the 5 most relevant chunks for a user's question
SELECT chunk_text, section_title
FROM instruction_chunk
WHERE item_unit_id = 'fridge-123'
ORDER BY chunk_embedding <=> $user_question_embedding  -- vector distance operator
LIMIT 5;
```

The `<=>` operator calculates the distance between two vectors. Smaller distance = more similar meaning. This is called **vector search** or **similarity search**.

**Step 4: Generation**

You take the retrieved chunks and send them to Claude with the user's question:

```ts
const response = await claude.messages.create({
  model: "claude-sonnet-4-6",
  messages: [{
    role: "user",
    content: `
      You are a helpful home maintenance assistant.

      Here are relevant sections from the user's refrigerator manual:
      ---
      ${relevantChunks.join("\n\n")}
      ---

      User's question: ${userQuestion}

      Answer based on the manual sections above.
    `
  }]
})
```

Claude answers using only the information from the manual — accurate, specific, and grounded in the user's actual documents.

**Step 5: The infrastructure needed**

To make this work we need:
- **pgvector** extension in Postgres — enables vector storage and similarity search
- An **embeddings edge function** — called when a chunk is saved, generates and stores the embedding
- A **chat edge function** — handles user questions: embeds the question, retrieves chunks, calls Claude, returns the answer
- A **chat UI** — a text input + response display in the app

### Why this is powerful

Every Homehub user has different items with different manuals. RAG means each user gets answers specific to their exact appliances — not generic advice. A user with a specific brand of boiler gets answers from that boiler's manual, not generic boiler advice.

---

## 20. Vocabulary Reference

A quick glossary of terms used in this project:

| Term | Meaning |
|------|---------|
| **API** | Application Programming Interface — a way for two pieces of software to talk to each other |
| **Async/Await** | JavaScript keywords for handling operations that take time (like database calls) without freezing the browser |
| **Bundle** | All your JavaScript files combined into one (or a few) optimised files for the browser |
| **CDN** | Content Delivery Network — servers around the world that serve your app from the closest location to the user |
| **Component** | A reusable piece of React UI (a function that returns JSX) |
| **Context** | React's way of sharing data across many components without prop drilling |
| **CRUD** | Create, Read, Update, Delete — the four basic database operations |
| **Deno** | A JavaScript/TypeScript runtime used in Supabase Edge Functions (alternative to Node.js) |
| **Edge Function** | Server-side code that runs close to the user on Supabase's infrastructure |
| **Embedding** | A list of numbers that represents the meaning of text (used in AI/RAG) |
| **Enum** | A type that can only hold one of a fixed set of values |
| **Foreign key** | A column in one table that references the primary key of another table |
| **Hook** | A React function starting with `use` that lets you use React features (useState, useEffect...) |
| **JWT** | JSON Web Token — a signed string that proves a user's identity |
| **JSX** | JavaScript XML — the HTML-like syntax you write in React components |
| **Migration** | A SQL file that makes a versioned change to the database schema |
| **Null** | The absence of a value — different from zero or empty string |
| **PostgREST** | Software that reads your Postgres schema and auto-generates a REST API |
| **Primary key** | A column (usually `id`) that uniquely identifies each row in a table |
| **Props** | Data passed from a parent component to a child component |
| **Provider** | A React component that makes data available to all components inside it via Context |
| **RAG** | Retrieval-Augmented Generation — using your own data as context for AI responses |
| **RLS** | Row Level Security — database-level rules about which rows each user can access |
| **Service function** | A plain async function that talks to the database, with no React code in it |
| **State** | Data that can change and that React tracks to re-render components |
| **SPA** | Single-Page Application — one HTML page, JavaScript handles all navigation |
| **TypeScript** | JavaScript + types — catches bugs at compile time |
| **UUID** | Universally Unique Identifier — a random 128-bit ID used as a primary key |
| **Vector** | A list of numbers representing meaning (used in embeddings) |
| **Webhook** | A URL that gets called automatically when something happens (e.g., GitHub notifying Vercel of a push) |

---

## 21. The Manual Search Feature — Finding Model-Specific Manuals

### Why it matters

When a user adds an item like a "Bosch HBL8651UC wall oven", the `generate-tasks` edge function can produce **generic** tasks ("clean the oven door seals") or **model-specific** tasks ("replace the door gasket part #00700725 every 2 years per Bosch service guidelines"). The difference is whether we have the actual owner's manual PDF.

The manual search feature lets users find and link the correct manual during the Add Item flow.

### The `search-manual` edge function

Located at `supabase/functions/search-manual/index.ts`.

**What it does:** Takes `{ brand, model }` and returns candidate manual URLs for the user to choose from.

**First attempt (broken):** We asked Claude to recall specific manual PDF URLs from memory:

```
"Find the URL where the owner's manual for ${brand} ${model} can be found."
```

**Why it failed:** Claude won't make up URLs. It refused to return specific URLs it wasn't certain about, returned `[]`, the JSON parse found nothing, and the UI showed only a "Search again" button with no explanation.

**Fixed approach — deterministic + AI-assisted:**

```ts
// Step 1: Always construct guaranteed search page URLs
const encoded = encodeURIComponent(`${brand} ${model}`)
const guaranteed = [
  { title: `${brand} ${model} — ManualsLib Search`,
    url: `https://www.manualslib.com/search/?q=${encoded}`,
    source: "ManualsLib" },
  { title: `${brand} ${model} — ManualsOnline Search`,
    url: `https://www.manualsonline.com/search?query=${encoded}`,
    source: "ManualsOnline" },
]

// Step 2: Ask Claude ONLY for manufacturer support URLs it knows with high confidence
// "Return [] if not certain — do NOT guess"
const claudeItems = ... // parse Claude response

// Step 3: Prepend guaranteed results, deduplicate by URL, return up to 4
```

**What this teaches:** Use AI for what it's good at (knowledge of well-known manufacturer domains) and use deterministic code for what it's bad at (generating reliable URLs on demand). When an AI call might return nothing, always have a fallback.

### The manual approval flow in `AddItem.tsx`

State machine with 4 states:

```
idle
  → user clicks "Find Manual"
searching
  → edge function returns candidates
results
  → user opens a URL externally (captured in lastOpenedUrl)
  → OR user clicks "✓ Use this URL directly"
approved
  → selectedManual is set
  → on submit: saved to manual_document table
```

**The "open externally and capture" pattern:**

Most manual sites don't serve direct PDF links — the user needs to browse to find their specific model. When the user opens a link in a new tab, we record it:

```ts
const handleOpenExternal = (url: string) => {
  setLastOpenedUrl(url)          // remember what they opened
  window.open(url, "_blank", "noopener,noreferrer")
}
```

Then we show a banner: "You opened: manualslib.com/... → [✓ Use this as the manual]"

This lets users browse the site in a tab, find the right manual, and return to capture it.

### Why iframes usually fail for manual sites

An iframe is an "inline frame" — it embeds another website inside your app. Many sites (ManualsLib, most manufacturer sites) block this using an HTTP header called `X-Frame-Options: DENY` or `Content-Security-Policy: frame-ancestors 'none'`. When blocked, the iframe shows a blank white box.

Our fix: show the iframe anyway (it works for some sites), but put a prominent "Open in new tab ↗" link at the *top* of the panel, before the iframe, so users aren't left staring at a blank box.

### Saving the manual to the database

When the user submits the form with a selected manual, we insert a row into `manual_document`:

```ts
await supabase.from("manual_document").insert({
  item_unit_id: newItemUnitId,
  home_id: homeId,
  source_url: selectedManual.url,
  title: selectedManual.title,
  source_ref: new URL(selectedManual.url).hostname,
  // parsed_at: null — parsing happens lazily when the item detail page loads
})
```

`parsed_at: null` means the PDF hasn't been parsed yet. When the user opens the item detail page, the app triggers parsing and generates model-specific tasks.

### The gap: search pages vs PDF links

ManualsLib search pages (`manualslib.com/search/?q=Bosch+HBL8651UC`) are not PDFs. The `generate-tasks` edge function can only do model-specific task generation if it receives a direct PDF URL. If the user links a search page, tasks will still be generated, but from Claude's general knowledge of that appliance type — not the specific manual.

**For truly model-specific tasks:** The user needs to navigate from the search page to the specific product page, find the PDF download link, and paste that URL back into the app. Future improvement: guide users through this step more clearly.

---

## 22. Debugging Without a Debugger — Static Code Analysis

Sometimes you can't run the code interactively (browser not connected, no terminal access). In those cases, **static code analysis** — reading the code and reasoning about what it does — is the only tool available.

### The process we used

**Step 1: Identify the symptom.** Console logs showed `[cleanSession] status distribution: {}` (empty) and `[DeepClean] all tasks: [] length: 0`.

**Step 2: Trace the data backward.** The symptom is "no tasks displayed." Tasks come from `task_instance` rows. Work backward:
- Is the query returning nothing? → Were rows created?
- Were rows created? → Was `generateTaskInstances()` called?
- Was it called? → For which templates? Under what conditions?

**Step 3: Read the code that creates the data.** Found that `getCleaningTasks()` in `cleanSession.ts` only triggered instance generation for templates where `scope_type = 'home'` — not item-scoped templates.

**Step 4: Form a hypothesis.** "Instances were never created for item-scoped templates."

**Step 5: Confirm via console output.** The user provided a screenshot showing `status distribution: {}` — zero rows with any status. Hypothesis confirmed.

**Step 6: Write the fix.** Generate instances for all templates missing a scheduled instance.

### What static analysis taught us

- You don't need a running browser to diagnose many bugs
- Console logs are your best friend — they're the "print statements" of the web
- Empty objects/arrays (`{}`, `[]`) in logs almost always mean the upstream data wasn't created, not that the query is wrong
- Following the data through the pipeline (create → query → display) is more reliable than guessing

---

## 23. Lessons From March 4, 2026

This section captures the key engineering lessons from the early March 2026 debugging and feature-building session.

### Lesson 1: "Nothing shows" is almost always a data creation problem

The dashboard showed nothing. The Clean tab showed nothing. Both times, the cause was not a broken query — it was that the underlying data rows had never been created.

**Pattern to remember:** When something is missing from the UI, ask "does the data exist in the database?" before assuming the query is wrong. Use the Supabase table editor to check directly.

### Lesson 2: Filters that look sensible can silence everything

The dashboard filter `priority === "critical"` seemed reasonable — "show only the most urgent tasks." But when no tasks are marked critical yet, the filter returns zero results and the page looks broken.

**Pattern to remember:** Sort by priority, don't filter by it. Users want to see *everything* sorted by importance, not a page that says "nothing here" because they haven't labelled things critical yet.

### Lesson 3: Don't ask AI to recall specific URLs

AI models (including Claude) are trained to be accurate. When asked to provide a URL they're not certain about, they'll return nothing rather than guess. This is the right behaviour — but your UI must account for it.

**Pattern to remember:** Use AI for knowledge (what is the manufacturer's support page domain?), not for URL recall (what is the exact PDF link for model X?). Always have deterministic fallbacks.

### Lesson 4: Password recovery requires URL whitelist configuration

Supabase's password recovery email includes a link to your app. That link's domain must be whitelisted in **Supabase Auth → URL Configuration → Redirect URLs**. If it's not there, the recovery email either doesn't send or sends with a broken link.

If you're testing locally: add `http://localhost:5173` to the redirect URL whitelist.
For production: add your Vercel domain (e.g., `https://homehub.vercel.app`).

**Emergency recovery:** If you've lost your credentials completely, go to **Supabase Dashboard → Authentication → Users**, find your account, and use "Send magic link" or reset the password directly.

### Lesson 5: iframes are blocked by most external sites

An `<iframe>` embeds another site inline. Most sites block this via `X-Frame-Options` headers for security (preventing "clickjacking" attacks). Don't assume iframes will work for third-party content. Always provide a "open in new tab" fallback as the primary path.

### Lesson 6: Commit and push regularly

At the end of this session, several fixes (dashboard, Clean tab, manual search, search-manual edge function) were still uncommitted. If something goes wrong with the local machine, that work is lost. Aim to commit and push at the end of every working session — even a `wip: end of day` commit is better than losing changes.

```bash
# End of session commit
git add src/ supabase/
git commit -m "Fix dashboard + clean tab task visibility, add manual search"
git push
```

---

---

## 24. The CHO Design System — Tailwind v4 Tokens

On March 17, 2026 the app received a full brand identity: **Chief Home Officer (CHO)**, centred on a deep teal palette.

### Why Tailwind v4 works differently from v3

In Tailwind v3 you configured colours in a `tailwind.config.ts` file. In Tailwind v4 (which this project uses), configuration lives **inside your CSS file** using `@theme inline {}`:

```css
/* src/index.css */
@theme inline {
  --color-primary: #1B6B5A;      /* CHO deep teal */
  --color-background: #EAF6F4;   /* pale mint surface */
  --font-sans: 'Inter', sans-serif;
}
```

These CSS variables are then available as Tailwind utilities: `bg-primary`, `text-primary`, `font-sans`, etc. There is no `tailwind.config.ts` — the CSS file *is* the config.

### The CHO token set

| Token | Value | Used for |
|---|---|---|
| `--color-primary` | `#1B6B5A` | Buttons, active states, icons |
| `--color-primary-foreground` | `#FFFFFF` | Text on primary backgrounds |
| `--color-background` | `#EAF6F4` | Page background |
| `--color-card` | `#FFFFFF` | Card surfaces |
| `--color-muted` | `#F3F4F6` | Subtle backgrounds |
| `--font-sans` | `Inter` | All body text |

### Dark mode in Tailwind v4

Dark mode overrides go in a `.dark { }` block in the same CSS file, not in a separate config. The `.dark` class is applied to `<html>` by JavaScript:

```css
.dark {
  --color-background: #0a1f1c;
  --color-primary:    #2D9B82;   /* lighter teal for dark backgrounds */
}
```

### Files changed for the brand refresh

- `src/index.css` — all design tokens replaced with CHO values
- `index.html` — Google Fonts import changed to Inter
- `src/components/ui/button.tsx` — all 6 variants remapped to teal
- `src/components/tasks/TierBadge.tsx` — tier badge colours updated
- `src/components/AppLayout.tsx` — active nav link gets teal underline
- `src/pages/Home.tsx` — optional-tier progress bar colour
- `src/pages/ItemDetailPage.tsx` — optional-tier card border colour

---

## 25. The Ask / Chat Feature — SSE Streaming and RAG

The Ask page lets users ask natural-language questions about their appliances and get answers sourced from the actual manuals. This introduced several new concepts.

### What RAG means

**RAG = Retrieval-Augmented Generation.** Instead of asking an AI model to answer from memory (which can hallucinate), you:

1. **Retrieve** relevant text chunks from your own database
2. **Augment** the AI's prompt with those chunks
3. **Generate** a response grounded in your actual documents

In this app: retrieve `knowledge_chunk` rows from Supabase → inject into Claude's context → stream the response back.

### Server-Sent Events (SSE) — streaming text word by word

A normal HTTP request: you send a request, you wait, you get a response all at once.

SSE allows the server to send a **stream of events** while the client reads them as they arrive. This is how chat responses appear word-by-word instead of all at once after a delay.

The server sends lines like:
```
data: {"delta": "The "}
data: {"delta": "filter "}
data: {"delta": "reset "}
data: {"done": true, "sources": [...]}
```

The client reads each line and appends the `delta` to the displayed message. The final `done` event signals the stream is finished.

In the edge function, this is implemented using a `ReadableStream`:
```typescript
const stream = new ReadableStream({
  async start(controller) {
    // ... fetch from Claude API, also a stream ...
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`))
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, sources })}\n\n`))
    controller.close()
  }
})
return new Response(stream, { headers: { "Content-Type": "text/event-stream" } })
```

### The 401 debugging saga — a cautionary tale

The chat feature returned `401 Unauthorized` for several hours despite multiple fixes. The root cause was **a layer confusion problem**:

**Layer 1 — Supabase Gateway:** Before your edge function code even runs, Supabase's own gateway checks for a valid JWT. Default setting: `verify_jwt = true`. If the gateway rejects the request, your function code never executes.

**Layer 2 — Your function code:** Inside the function, you can also verify the JWT yourself using `adminClient.auth.getUser(jwt)`.

The mistake: we were fixing Layer 2 (our code) while Layer 1 (the gateway) was silently rejecting the request. To confirm which layer is causing a 401, check the *body* of the error response:

- `{"error": "Missing or invalid Authorization header"}` → **your code** is running (Layer 1 passed)
- No body / generic Supabase error → **gateway** is rejecting (Layer 1 blocked)

**The fix:** Add `verify_jwt = false` to `supabase/config.toml` for functions that do their own auth, then redeploy:

```toml
[functions.chat-query]
verify_jwt = false
```

The function still verifies the JWT internally — security is maintained, but the gateway no longer double-checks (and incorrectly rejects) valid tokens.

**Diagnostic technique:** Use `curl` directly against the deployed function URL with known-bad input to see what error body comes back, without involving the browser or app:

```bash
curl -s -X POST \
  "https://yourproject.supabase.co/functions/v1/chat-query" \
  -H "apikey: $ANON_KEY" \
  -d '{"question":"test","home_id":"test"}'
# If your code is running → {"error":"Missing or invalid Authorization header"}
# If gateway is blocking → Supabase generic error
```

### Correct server-side JWT verification pattern

Edge functions need to verify that the caller is a real logged-in user. The correct pattern uses the **service role client** (which has admin access) to validate the user's JWT token:

```typescript
// CORRECT
const adminClient = createClient(supabaseUrl, serviceRoleKey)
const jwt = req.headers.get("Authorization")?.replace("Bearer ", "")
const { data: { user } } = await adminClient.auth.getUser(jwt)

// WRONG (common mistake) — a fresh client has no session stored
const wrongClient = createClient(supabaseUrl, anonKey, {
  global: { headers: { Authorization: authHeader } }
})
await wrongClient.auth.getUser() // always returns null
```

### PDF-backed answers — passing documents to Claude

Knowledge chunks (pre-parsed excerpts) can miss specific details like exact button names or sequences. When only 1–2 manuals are in scope, the `chat-query` function now fetches the **actual PDF** and sends it to Claude as a document block.

```typescript
// Fetch PDF as base64
const res = await fetch(pdfUrl)
const buf = await res.arrayBuffer()
const bytes = new Uint8Array(buf)
let binary = ""
for (let i = 0; i < bytes.length; i += 65536) {
  binary += String.fromCharCode(...bytes.subarray(i, i + 65536))
}
const base64 = btoa(binary)

// Include in Claude message as a document block
const userMessage = {
  role: "user",
  content: [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
    { type: "text", text: question }
  ]
}
```

Claude reads the full PDF and can answer with exact specifics — button names, temperatures, model-specific sequences — rather than hedging with vague placeholders.

**Limit:** This only runs when ≤2 manuals are in scope (item filter selected, or a room with few items). Fetching 10+ PDFs per query would be too slow.

### Markdown rendering in chat

AI models respond in Markdown (`**bold**`, `## headings`, `1. numbered lists`). To render this instead of showing raw symbols, install `react-markdown` and the Tailwind typography plugin:

```bash
npm install react-markdown @tailwindcss/typography
```

In `src/index.css`:
```css
@plugin "@tailwindcss/typography";
```

In the component — **only apply `prose` classes to assistant messages**, not user messages. The `prose` class sets its own text colour which overrides the white text on the user's dark teal bubble:

```tsx
<div className={cn(
  "text-sm break-words",
  !isUser && "prose prose-sm max-w-none dark:prose-invert"
)}>
  {isUser ? message.content : <ReactMarkdown>{message.content}</ReactMarkdown>}
</div>
```

### New files for the chat feature

| File | Purpose |
|---|---|
| `src/pages/ChatPage.tsx` | Page with filter state, message state, send handler |
| `src/components/chat/FilterBar.tsx` | Room chips + item autocomplete |
| `src/components/chat/ChatThread.tsx` | Scrolling message list |
| `src/components/chat/ChatMessageBubble.tsx` | Individual message (user teal / assistant muted) |
| `src/components/chat/ChatInput.tsx` | Text input + send button |
| `src/modules/knowledge/services/chatService.ts` | `streamChatQuery()` — SSE fetch wrapper |
| `src/modules/knowledge/hooks/useChatFilters.ts` | Load rooms + items for filter bar |
| `supabase/functions/chat-query/index.ts` | Edge function — retrieval + Claude call + SSE |

---

## 26. The Inventory Page — Lucide Icons and Room Tabs

The inventory page was redesigned from a single-column list to a **3-column icon grid** with a **room tab bar** at the top.

### Icon resolution — keyword lookup, not category lookup

The first instinct was to map the item's *category* (`"Major Appliances"`) to an icon. The problem: a category is too broad. Both a refrigerator and a washing machine are "Major Appliances" but they deserve different icons.

The better approach: match the item's `display_name` against a list of keywords, then fall back to category:

```typescript
const KEYWORD_ICONS = [
  { keywords: ["refrigerator", "fridge", "freezer"], icon: Refrigerator },
  { keywords: ["washing machine", "washer"],          icon: WashingMachine },
  { keywords: ["dryer"],                              icon: Wind },
  { keywords: ["dishwasher"],                         icon: Waves },
  { keywords: ["thermostat"],                         icon: Thermometer },
  // ... 20+ more entries ...
]

function getItemIcon(item: ItemUnit): LucideIcon {
  const name = item.display_name.toLowerCase()
  for (const entry of KEYWORD_ICONS) {
    if (entry.keywords.some(kw => name.includes(kw))) return entry.icon
  }
  if (item.category && CATEGORY_ICONS[item.category]) return CATEGORY_ICONS[item.category]
  return Package  // final fallback
}
```

**How to check which Lucide icons are available** in the installed version (rather than assuming):

```bash
grep -o "declare const [A-Za-z]*:" node_modules/lucide-react/dist/lucide-react.d.ts \
  | grep -i "refrigerator\|washing\|microwave"
```

This searches the TypeScript declaration file — no compilation needed.

### Room tab bar pattern

The tab bar uses the same chip style as the Ask page's room filters. Clicking a room sets `activeRoomId` state; "All" resets it to `null`. The content area then filters `visibleRoomOrder` to show only the selected room's items:

```typescript
const [activeRoomId, setActiveRoomId] = useState<string | null>(null) // null = All
const visibleRoomOrder = activeRoomId === null ? roomOrder : [activeRoomId]
```

The tab bar scrolls horizontally with `overflow-x-auto` and hides the scrollbar:
```css
scrollbar-width: none;  /* Firefox */
&::-webkit-scrollbar { display: none; }  /* Chrome/Safari */
```

---

## 27. Lessons From March 17, 2026

### Lesson 1: Always identify which layer is failing before fixing code

The 401 on `chat-query` was caused by Supabase's **gateway** (Layer 1), not our function code (Layer 2). We spent time fixing Layer 2 while Layer 1 was the real problem. **Before writing any fix, identify which layer owns the error.** Use `curl` directly against the function to get the raw error body — this tells you immediately whether your code is running at all.

### Lesson 2: `verify_jwt` is a gateway setting, not a code setting

Supabase edge functions have a gateway-level JWT check (`verify_jwt = true` by default) that runs *before* your Deno code. If your function does its own JWT verification (the correct pattern for server-side auth), set `verify_jwt = false` in `supabase/config.toml` to avoid the gateway rejecting valid requests before they reach your code.

### Lesson 3: HMR (Hot Module Replacement) state can be stale after type changes

When you change a hook's return type (e.g., from `{ filterOptions }` to `{ rooms, items }`), Vite's hot reload patches the module but the old state shape may persist in memory. Symptoms: TypeScript compiles cleanly but the browser throws `"rooms is not defined"`. Fix: hard refresh (`Cmd+Shift+R`). If weird runtime errors appear immediately after a refactor, suspect HMR state before debugging the logic.

### Lesson 4: Apply `prose` only to assistant messages, not all messages

The `@tailwindcss/typography` `prose` class sets its own text colour (`--tw-prose-body`). If applied to a user message bubble that uses `text-primary-foreground` (white on teal), the prose colour overrides it and the text becomes unreadable. Always scope `prose` to only the component that needs markdown rendering.

### Lesson 5: Icon mapping should be by item name, not by category

A category like "Major Appliances" covers refrigerators, washing machines, dishwashers, and dryers — all different icons. Map icons against **keywords in the item name** first, with category as a fallback. The keyword table takes a few minutes to write and produces dramatically better results.

### Lesson 6: Design options as HTML mockups save implementation rework

Before implementing a UI redesign, building a quick HTML/CSS mockup (no framework, no data, just visual layout) lets you evaluate options in minutes. If an option is wrong, you throw away 30 lines of HTML — not hours of React code. The friction of creating the mockup is worth it.

### Lesson 7: SSE streaming requires the `apikey` header, not just `Authorization`

Supabase's edge function gateway requires **two** headers for authenticated requests:
- `Authorization: Bearer <user_jwt>` — proves who you are
- `apikey: <anon_key>` — proves you're a valid Supabase client

Sending only `Authorization` will cause 401 errors at the gateway. This is different from most APIs where a single bearer token is sufficient.

### Lesson 8: PDF fetching adds latency — throttle it by scope

Sending a full PDF to Claude gives much more accurate answers (specific button names, exact temperatures) than pre-parsed text chunks. But fetching and base64-encoding a 5MB PDF takes 2–3 seconds. The right threshold: only fetch PDFs when **≤2 manuals** are in scope (item filter selected, or a small room). For "All home" queries covering 15+ items, fall back to the pre-parsed chunks — the latency would be unacceptable.

---

*Last updated: March 24, 2026. This document is a living guide — it should be updated whenever significant architectural decisions are made or hard lessons are learned.*

---

## 28. Dashboard Redesign — Health Score and Focus Tasks

On March 18, 2026 the Home dashboard was redesigned from a plain task list into a structured summary page.

### The three-panel layout

The new dashboard has three sections:

1. **Health score ring** — a circular progress indicator (0–100) calculated from overdue and upcoming tasks. Higher score = fewer overdue items relative to total.
2. **This Week's Focus** — tasks due within 7 days, sorted by tier priority (Essential → Recommended → Optional → Low). Shown in `TaskRow` cards with urgency styling.
3. **Insights strip** — `StatRow` with counts: tasks due this week, overdue count, items needing attention.

### The `isEssential` bug

`FocusTaskRow` applied a red "overdue" state to any task where `isEssential` was true. The original definition:

```typescript
const isEssential = task.priority === "critical" || task.priority === "high"
```

This caused Recommended tasks (`priority === "high"`) to show the same red styling as Essential tasks — misleading the user into thinking every overdue Recommended task was urgent.

**Fix:** Change to `priority === "critical"` only. Recommended tasks get amber styling instead.

### The home name in the title

The page title was `"{homeName} Dashboard"`. Since most users have one home, the home name is redundant clutter. **Pattern:** when a user has exactly one of something, don't repeat its name in every heading — use a time-based greeting or a generic title ("Good morning" / "Your Home") instead.

### Priority as sort order, not filter

Tasks shown on the dashboard should be sorted by priority (`critical → high → medium → low`) rather than filtered to only show critical. Filtering hides information the user may want to see. Sort, don't hide.

---

## 29. Maintenance Page Redesign — Calendar + Agenda Two-Panel

On March 20, 2026 the Maintenance page was redesigned into a calendar + agenda split layout.

### The layout

```
┌─────────────────────────────────────────────────────┐
│  [Month calendar — full width on mobile, 50% on SM+] │
│  [EssentialTaskAgenda — hidden on mobile, 50% on SM+]│
└─────────────────────────────────────────────────────┘
[Task list below — all tiers, filtered by selected date]
```

### The mobile invisible agenda bug

`EssentialTaskAgenda` was wrapped with `hidden sm:block`. On a phone, a user taps a calendar date — `selectedDay` state updates — but nothing visual changes because the agenda is hidden on mobile. The task list below filters to that date but shows all tiers, not just what a user tapped to see.

**Fix:** Make the agenda conditionally visible on mobile when a date is selected:

```tsx
className={cn(
  "sm:block sm:w-1/2 sm:border-l sm:border-border sm:pl-4",
  selectedDay ? "block mt-4 pt-4 border-t border-border" : "hidden"
)}
```

On mobile: agenda is hidden until a date is tapped, then appears below the calendar with a top border separator. On desktop: always visible side-by-side with the calendar.

**Lesson:** Test the "date tap" interaction on mobile. A state update that triggers a side-panel update on desktop may do absolutely nothing on mobile if the panel is `hidden`.

### Tier + room + status filters

The redesigned page added a filter bar above the task list: tier chips (Essential / Recommended / Optional / Low), room dropdown, and status toggle (upcoming / overdue / completed). Each filter is an independent piece of state; they combine with AND logic.

### Group-by toggle

A toggle button switches the task list between:
- No grouping — flat sorted list
- Group by room — each room gets a header
- Group by tier — each tier gets a colored header

Implementation: `groupBy: "none" | "room" | "tier"` state. The render function maps through `groupKeys` (room IDs or tier names) and renders a header + filtered sub-list for each.

---

## 30. Diagram Images — Extracting and Displaying PDF Pages

On March 20, 2026, the manual knowledge system was extended to extract and display images of the relevant manual pages alongside each knowledge chunk.

### The pipeline

1. **`parse-manual`** edge function — when parsing a PDF, Claude identifies which PDF page numbers each knowledge chunk came from. The chunk metadata stores `diagram_pages: [{page: 3, label: "Figure 2"}]`.
2. **`identify-diagrams`** edge function — scans knowledge chunks for `diagram_pages` entries and queues page extractions.
3. **`extract-diagram`** edge function — uses pdf.js to render a specific page of the PDF as a PNG image, stores the image in Supabase Storage under `manuals/{itemId}/page_{n}.png`, and writes the URL back to the chunk's `diagram_image_urls` metadata field.
4. **`DiagramGallery` component** — renders the images in `inline` (thumbnail strip) or `lightbox` (full modal) variants.

### Loading state

Because image extraction is async, a chunk may have `diagram_pages` but no `diagram_image_urls` yet. The component detects this state:

```typescript
const isLoading = (meta?.diagram_pages?.length ?? 0) > 0 && images.length === 0
```

And shows a skeleton/spinner in place of the images while extraction runs.

### Deduplication

Two different knowledge chunks can reference the same PDF page (e.g., both a "How To Reset" chunk and a "Troubleshooting" chunk cite page 3). Both end up with the same URL in their `diagram_image_urls`. When rendered together, this produces duplicate thumbnails.

**Fix:** Deduplicate by URL at render time using `useMemo`:

```typescript
const dedupedImages = useMemo(
  () => images.filter((img, i, arr) => arr.findIndex((x) => x.url === img.url) === i),
  [images]
)
```

**Lesson:** When the same resource can appear multiple times via different paths, deduplicate at the last possible moment (render time) rather than trying to prevent duplicates at creation time — creation is async and hard to coordinate.

### Mobile image sizing

The inline variant originally used `max-h-72` (288px). On a phone this dominated the screen before the user could read any text. Changed to `max-h-48 sm:max-h-72` — smaller on mobile, full size on larger screens.

---

## 31. Parse Manual Improvements — PDF Validation and Prompt Strengthening

On March 24, 2026, two problems were fixed in the manual parsing pipeline.

### Problem 1: "The PDF specified was not valid" — Claude API 400 error

**Symptom:** Re-parsing a manual that had previously parsed successfully returned a Claude API 400 error.

**Root cause:** The `fetchPdfAsBase64` helper in both `parse-manual` and `preview-manual` fetched the URL and blindly sent the bytes to Claude as `application/pdf`. If the URL returns HTML (a session-gated login page, a redirect, a 404 page), Claude receives invalid PDF bytes and returns `400`.

**Fix — magic bytes check:**

Every valid PDF starts with the ASCII string `%PDF` (bytes `0x25 0x50 0x44 0x46`). Check these bytes before sending to Claude:

```typescript
const magic = new Uint8Array(buffer.slice(0, 4))
if (magic[0] !== 0x25 || magic[1] !== 0x50 || magic[2] !== 0x44 || magic[3] !== 0x46) {
  return { error: `URL did not return a PDF (content-type: ${contentType})` }
}
```

The function now returns `{ base64, mediaType }` on success or `{ error: string }` on failure. The caller checks `"error" in pdfData` before proceeding.

**What this teaches:** When sending data to an external API that has strict type requirements, validate the data yourself first. Don't trust that a URL returns what its filename or content-type header claims. A `content-type: application/pdf` header can lie; the magic bytes can't.

### Problem 2: Session-gated manufacturer websites

**Symptom:** A Vitamix PDF URL that opens fine in the browser returned `content-type: text/html` when fetched by the edge function.

**Root cause:** The Vitamix support site requires an active browser session (cookie). The browser has this session from a previous login; the edge function has no session. The server returns an HTML redirect/login page instead of the PDF.

**Solution:** The user must download the PDF manually and upload it directly, bypassing the session requirement. Added an `InfoTooltip` warning icon next to the URL input in both `ManualStep.tsx` and `ItemDetailPage.tsx`:

> "Some manufacturer websites require a login session to serve PDFs and will return an error when parsed. If parsing fails, download the PDF and upload it directly instead."

**`InfoTooltip` component:** Built in `src/components/ui/info-tooltip.tsx` using the Radix UI Tooltip primitive. An amber `AlertCircle` icon button triggers the tooltip on hover/focus. Self-contained `TooltipProvider` so it can be dropped in anywhere.

### Problem 3: Missing how_to and troubleshooting chunks

**Symptom:** Re-parsing worked but returned zero How To or Troubleshooting knowledge chunks.

**Root cause:** The Claude prompt said to "prioritize" these chunk types but didn't require a minimum count. Claude sometimes skipped them entirely when the document was dense with maintenance tasks.

**Fix:** Added explicit minimum counts to the prompt: "You MUST include at least 2 how_to chunks and at least 2 troubleshooting chunks."

**Lesson:** AI prompts are instructions, not constraints. "Prioritize X" means "try to do X." "You MUST include at least N of X" is a constraint the model will follow. When a specific output structure is required, make the requirement explicit.

---

## 32. Mobile UI Fixes — March 24, 2026

Five mobile-specific UI issues were discovered and fixed during hands-on testing on a real phone.

### Issue 1: Maintenance calendar tap shows nothing on mobile

**Root cause:** `EssentialTaskAgenda` was `hidden sm:block` — permanently invisible on mobile. Tapping a date updated state but nothing visual changed.

**Fix:** Conditionally show the agenda below the calendar on mobile when a date is selected (see Section 29).

### Issue 2: Task rows squeezed on item detail page

**Root cause:** Task rows used a single-row `flex justify-between` layout with a `shrink-0` right side containing: schedule label + "View Diagram" button + edit button + delete button. With all four items on one line, the title was pushed into a tiny left column and word-wrapped character by character.

**Fix:** Split into two rows:

```
Row 1: [title — flex-1 min-w-0]  [edit btn]  [delete btn — shrink-0]
Row 2: [schedule label · View Diagram — text-xs text-muted-foreground flex-wrap]
```

**Key CSS:** `flex-1 min-w-0` on the title allows it to shrink and truncate naturally. Without `min-w-0`, a flex child with `flex: 1` still refuses to shrink below its content's natural width in some browsers.

### Issue 3: Duplicate diagram images in knowledge chunks

**Root cause:** Multiple knowledge chunks can reference the same PDF page. Each chunk's `diagram_image_urls` ends up containing the same URL. The `DiagramGallery` rendered them all, showing the same image twice.

**Fix:** Deduplicate by URL in `useMemo` (see Section 30).

### Issue 4: Knowledge chunk content hard to read on mobile

**Root cause:** The inline diagram image at `max-h-72` dominated the phone screen; content text had no explicit size class (inherited `text-base` = 16px, large for secondary content); no `leading-relaxed` made paragraphs dense.

**Fixes:**
- `DiagramGallery` inline height: `max-h-72` → `max-h-48 sm:max-h-72`
- `HowToAccordion` and `TroubleshootingAccordion` content: added `text-sm leading-relaxed`

### Issue 5: No way to track task progress during a cleaning session

**User need:** While cleaning an item (e.g., a stovetop), the user wants to work through tasks one at a time — reorder them by convenience, check them off as they go.

**Solution:** Ephemeral session mode on the item detail page.

**UX flow:**
1. "▶ Session" button appears in the task section header
2. Tapping it enters session mode: the tier-grouped task list is replaced by a flat ordered checklist
3. Each row: checkbox · title · [↑][↓] arrow buttons
4. Checking a task applies strikethrough and moves it toward the bottom
5. "End Session" exits; if tasks were checked, prompts "Mark X tasks complete?" and calls `handleMarkComplete` for each if confirmed
6. All session state is cleared on exit — no DB writes during session

**Implementation:** Three pieces of React state added to `ItemDetailPage`:
- `sessionMode: boolean`
- `sessionTasks: TaskTemplateWithSchedule[]` — initialized from the full flat task list (all tiers concatenated), reordered via up/down swap
- `checkedTaskIds: Set<string>` — IDs of checked tasks

**Why ephemeral:** Writing partial task progress to the database mid-session adds significant complexity (partial state, cancel/rollback logic). For a quick cleaning session, in-memory state is sufficient. The only DB write is at the end when the user confirms completion — using the existing `handleMarkComplete` path.

---

## 33. Lessons From March 24, 2026

### Lesson 1: Validate data before sending it to external APIs

Magic bytes are the canonical way to verify a file type. A URL claiming `application/pdf` can return anything. A `%PDF` header byte sequence cannot be faked. Add a magic bytes check for any file that must be a specific binary format before passing it to a strict API.

### Lesson 2: Session-gated URLs are a user education problem, not a code problem

Some manufacturer websites require a browser session to serve files. An edge function has no session. Code cannot fix this. The right solution is:
1. Detect the failure clearly (not a generic API error)
2. Tell the user exactly why it failed and what to do instead
3. Warn users proactively (tooltip on URL input) before they attempt it

### Lesson 3: AI constraints need exact minimums, not soft priorities

When your prompt says "include troubleshooting chunks", the AI might include zero. When it says "You MUST include at least 2 troubleshooting chunks", it will. Use exact minimums for required output fields in structured generation prompts.

### Lesson 4: Test every interaction on a real phone

Mobile bugs that would never appear on desktop:
- A panel hidden with `hidden sm:block` that shows on desktop but is invisible on mobile after state updates
- A flex layout that fits on a 1280px screen but wraps character-by-character on 390px
- An image `max-h-72` that seems reasonable on a desktop but occupies 40% of a phone viewport

After each UI feature, test the full interaction flow on a real device — not just the browser's responsive mode, which doesn't replicate real-world touch targets and viewport behaviour.

### Lesson 5: `flex-1 min-w-0` is required for text truncation in flex layouts

A flex item with `flex: 1` will expand to fill available space but will not shrink below its content's natural minimum width. This means a long title will overflow its container or compress sibling elements. Adding `min-w-0` removes the implicit minimum width constraint, allowing the element to shrink (and its text to truncate) as expected.

### Lesson 6: Ephemeral state is the right default for interactive modes

Session/checklist modes, edit modes, drag-reorder modes — these are best implemented as ephemeral React state with no DB writes. Only persist to the database at natural save points (end session, submit, confirm). This avoids partial-state bugs, simplifies undo/cancel, and reduces DB load.

### Lesson 7: Split complex flex rows into multiple stacked rows on mobile

When a flex row contains more than 2–3 elements, it will compress on mobile. The solution is not to use `flex-wrap` (which causes unpredictable layout) but to deliberately separate the content into rows:
- **Row 1:** Primary content + primary actions (identically important)
- **Row 2:** Metadata + secondary actions (smaller, muted)

This mirrors native mobile list patterns and is immediately readable on any screen size.

---

## 28. Lessons From March 27, 2026

These lessons came from a session covering the smart-add flow redesign, production debugging of the Nespresso manual upload, and the chat web search fallback feature.

### Lesson 1: HTTP 546 from a Supabase edge function means Deno hit a CPU or memory limit

A 546 response is not a network error or a bad request — it means the Deno runtime killed the function before it finished. Two root causes hit us in the same function (`generate-tasks`):

1. **Character-by-character base64 encoding** — iterating a large PDF one byte at a time in JavaScript is extremely slow. The fix is to encode in 64KB chunks:
   ```ts
   const chunks: string[] = []
   for (let i = 0; i < bytes.length; i += 65536) {
     chunks.push(String.fromCharCode(...bytes.subarray(i, i + 65536)))
   }
   return btoa(chunks.join(""))
   ```

2. **Invalid Claude model ID** — `claude-sonnet-4-5-20250929` no longer exists. An invalid model causes Anthropic to return an error immediately, but the way the function handled it triggered a timeout. Always use the current model: `claude-sonnet-4-6`.

When you see a 546, first check: (a) is there a slow loop in the function? (b) is the model ID current?

### Lesson 2: Always use `supabase.functions.invoke()` from the client, never raw `fetch()`

Raw fetch requires you to manually extract the JWT from the Supabase session and pass it as an Authorization header. This works initially, but silently breaks when the token expires and the user hasn't refreshed:

```ts
// ❌ Breaks on expired sessions
const { data: { session } } = await supabase.auth.getSession()
const token = session?.access_token
await fetch(`${supabaseUrl}/functions/v1/my-function`, {
  headers: { Authorization: `Bearer ${token}` }
})

// ✅ Handles refresh automatically
const { data, error } = await supabase.functions.invoke("my-function", {
  body: { ... }
})
```

`supabase.functions.invoke()` calls `getSession()` internally and handles token refresh. The user never sees "Session expired."

### Lesson 3: Silent database no-ops are dangerous

`supabase.from("table").update(...).eq("id", wrongValue)` returns no error and updates 0 rows. This bit us in `ParseReviewStep` where we called `archiveTaskTemplate(taskId)` but the function signature was `archiveTaskTemplate(homeId, taskId)`. The call ran, returned `{ error: null }`, and silently did nothing.

Defensive practices:
- Always double-check the argument order of service functions before calling them
- For critical mutations (soft deletes, reclassifications), consider checking `count` in the Supabase response and throwing if it's 0
- Write a quick integration test for any service function where argument order is non-obvious

### Lesson 4: Optimistic UI mutations must handle failure with rollback

When you apply an optimistic update (hiding an item, changing its label) before the database call completes, and the call fails, the UI is now wrong — and if you don't catch the error, the user has no idea. The correct pattern:

```ts
// 1. Snapshot current state
const snapshot = items
// 2. Apply optimistic change
setItems(items.filter(i => i.id !== targetId))
// 3. Call the service
try {
  await archiveItem(homeId, targetId)
} catch (err) {
  // 4. Rollback on failure
  setItems(snapshot)
  setError("Could not remove item. Please try again.")
}
```

Always include a user-visible error message — a silent rollback is almost as bad as no rollback.

### Lesson 5: Chat history must not duplicate the user's question

In the chat web search handler, we re-ask Claude the same question with web context added. The question is sent as the `question` parameter — but we also accidentally included it in the `history` array. Claude then saw the question twice, which caused repetitive or confused responses.

The history for a web search re-query should be:
```ts
const history = [
  ...messages.slice(0, questionIdx),   // everything before the user question
  messages[assistantIdx],              // the first (limited) assistant answer
].map(m => ({ role: m.role, content: m.content }))

// question is sent separately:
streamChatQuery({ question: userQuestion, history, allowWebSearch: true, ... })
```

This gives Claude: "here's the full conversation, here's what I already said, now answer again with web context." The user question is not in history — it's the `question` param.

### Lesson 6: User-triggered web search builds more trust than automatic expansion

The instinct was to automatically search the web whenever Claude didn't find a good answer in the manual. But:

- It adds latency on every dead-end response (even if the user doesn't care)
- Users don't know why the answer suddenly changed in style or sourcing
- It can return irrelevant results that appear authoritative

The better pattern: detect dead-end language in the assistant's reply, show a **"Search the web for more"** button, and let the user decide. This makes the source provenance explicit, gives the user control, and avoids latency surprises.

### Lesson 7: Wizard sessions must be updated on failure paths, not just success paths

In the smart-add flow, when PDF parsing failed, we set the error state but forgot to update the wizard session step back to `"manual"`. On page refresh, the session still said `"parsing"`, which got normalized to `"manual"` — but then the wizard re-submitted the same PDF, creating a duplicate `manual_document` record.

Rule: whenever a multi-step flow can fail, update the session step to the correct retry point in the error handler, not just on success:

```ts
if (!parseResult.ok) {
  await updateWizardSession({ step: "manual" })  // ← always do this
  setError("Parsing failed. Try again.")
  return
}
```

### Lesson 8: Browser cache can make UI redesigns appear not to have deployed

After a full ManualStep component rewrite, the user still saw the old UI. The app had deployed successfully. Cause: the browser had cached the old JS bundle. Hard refresh (Cmd+Shift+R / Ctrl+Shift+R) clears the cache. Vite's content-hashed filenames prevent this in production deploys, but during local dev with a running dev server, the old bundle can stick.
