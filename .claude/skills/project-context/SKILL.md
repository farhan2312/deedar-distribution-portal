---
name: project-context
description: Summary, tech stack, architecture, and task history for the Deedar Drive project. Use this to orient a new session before making changes.
---

# Deedar Drive — project context

Deedar Drive is a field-sales / distribution CRM for a company selling packaged
goods (Deedar brand products, e.g. DG10/DG20/DB20/DB40 segments) through a
multi-level distribution network. It replaces a static HTML prototype with a
real, database-backed Next.js app.

**IMPORTANT:** Before writing any code, read `AGENTS.md` at the repo root — it
says this project runs a non-standard/breaking version of Next.js
(16.3.0) and instructs you to check `node_modules/next/dist/docs/` before
using any Next.js API you're not 100% sure about. Follow that instruction.

## Tech stack

- **Framework:** Next.js 16.3.0, App Router, React 19.2.8, React Compiler
  (`babel-plugin-react-compiler`) — Server Components by default, Client
  Components (`"use client"`) only where interaction is needed.
- **Language:** TypeScript (strict), `npx tsc --noEmit` is the verification
  command used throughout this project (no test suite exists — typecheck +
  `npx eslint` is the correctness bar for code-only changes).
- **Styling:** Tailwind CSS v4 (`@import "tailwindcss"` in `src/app/globals.css`,
  `@layer components` + `@apply` for shared classes like `.card`, `.btn`,
  `.table`, `.inp`, `.chip`, `.field`). Per-role theming via CSS custom
  properties (`--accent`, `--accent-hover`, `--accent-tint`, `--bg-soft`,
  `--hairline-soft`) set per portal section in `src/lib/portal/nav.ts`
  (`themeVars()` / `ROLE_THEME`). Current canvas is a lavender/neutral
  palette (`--bg:#f5f3fb`); brand green `#7ca081` is reserved for the
  sidebar logo/default accent only.
- **Database:** Azure Postgres, accessed via Drizzle ORM
  (`drizzle-orm/pg-core`), schema in `src/db/schema.ts`. **Migrations are
  NOT applied with `drizzle-kit push/migrate`** (unreliable in this
  environment) — instead, schema changes are applied with raw SQL run
  through the `postgres` npm package in ad-hoc one-off Node/tsx scripts.
- **Auth:** JWT sessions via `jose`, `bcryptjs` password hashing, httpOnly +
  `SameSite=Lax` cookies. `getCurrentUser()` in `src/lib/auth/dal.ts` is the
  cached DAL entry point used by every server component/action to get the
  logged-in user plus their scope (depot, cnf, reportsTo, areas,
  supervisedDepots).
- **Dates:** All "today" logic for field flows must go through
  `src/lib/date.ts` (`istDateString`, `istDayBounds`, `formatISTTime`,
  `formatISTDate`, `formatISTDateLong`, `istGreeting`, `durationLabel`) —
  fixed Asia/Kolkata UTC+5:30 offset, no DST, importable client-side (no
  `server-only` guard). Never use raw local `Date` for field date math.

## Architecture

### Org hierarchy (scoping model)

`states → cnfs (1 per state) → depots → areas`. Every user has
`accessRoles: AccessRole[]` (`field | supervisor | dealer | hq | khq | admin`)
plus scope columns: single-scope roles use `users.cnfId` / `users.depotId`
directly; multi-scope roles (supervisor over several depots, field rep over
several areas) use join tables `userDepots` / `userAreas`. A field rep also
has `users.reportsToUserId` (self-FK) pointing at their Supervisor (SO).

### Route structure

- `src/app/(portal)/` — the authenticated app, one subfolder per role
  section: `field/`, `supervisor/`, `hq/`, `khq/`, `admin/`, plus a shared
  `dashboard/`. Each route is `page.tsx` (Server Component: auth check,
  role check, data fetch) + a sibling `*-client.tsx` (Client Component:
  interaction, `useTransition` for pending states on server-action calls).
  `_components/portal-shell.tsx` is the root shell (sidebar nav + header);
  fixed `h-screen` on its root div so the sidebar's `overflow-y-auto` nav
  actually scrolls instead of the whole page growing.
- `src/app/api/auth/{login,logout}/` — auth route handlers.
- `src/app/login/` — public login page.
- `src/_shelved/admin/` — an earlier hand-built admin UI, kept but not
  wired up; the real admin implementation lives in `src/lib/admin/*` and
  `src/app/(portal)/admin/*`. Don't resurrect `_shelved` without asking.
- `src/lib/{field,supervisor,hq,admin,auth,portal}/` — server actions
  (`"use server"`) and DAL helpers, grouped by role/domain.
- `src/db/schema.ts` — single source of truth for all tables/enums/types.
- `src/db/index.ts` (not detailed here) — Drizzle client instance.
- `scripts/` — one-off Node/tsx scripts: `create-admin.ts`,
  `seed-counters.ts`, and any migration scripts written ad hoc during this
  project (not committed as a durable `migrations/` folder — check git log
  / recent scratch files if you need to see how a given schema change was
  applied).

### Core domain model (field sales flow)

- **`counters`** — a shop/outlet a field rep visits. Belongs to a depot +
  area, has a `type` enum, GPS (`lat`/`lng`), `status`
  (active/dormant/declining), and `createdByUserId` (the rep who added it —
  they can always see/visit it in their Beat). **No `stock` column** —
  stock is observed per-visit, not a counter attribute.
- **`visits`** — a rep's check-in to a counter: `visitedAt`, `items`
  (JSONB array of `{ segment: DG10|DG20|DB20|DB40, stock, sold }`, see
  `VisitItem` type + labels in `src/lib/field/products.ts`), `stock`/`sold`
  totals across items, `rank` (Deedar shelf rank), `competitor`
  (none/local/national), `remarks`. No `depotId` on visits (derive via the
  counter). **Editable by the owner only, within 24h of `visitedAt`** —
  enforced via `isWithinEditWindow()` in `src/lib/field/products.ts`,
  checked in `src/lib/field/visit-actions.ts` (`updateVisit`,
  `getVisitForEdit`) and mirrored in the UI (Edit link hidden once
  expired).
- **`dayLogs`** — one row per rep per IST calendar day, tracks
  clock-in/out (`startAt`/`endAt`). Unique on `(userId, logDate)`.
- **`beatAssignments`** — a counter a Supervisor (SO) hands to a field rep
  for one specific IST day. A rep's **Today Beat** = counters they created
  themselves **UNION** counters assigned to them here for today — this is
  the *only* two sources of Beat visibility (see Task history — point 13).
  Unique on `(repUserId, counterId, beatDate)`.
- **Visit rules enforced everywhere:** a rep can only add a visit to a
  counter in their own depot (admin bypasses); they can *search/see* any
  counter by mobile number but the "check in" action is hidden
  (`canVisit: false`) if it's outside their depot.

### Server action / page pattern

Data-fetching pages are `async function Page()` Server Components (auth +
role guard via `getCurrentUser()`, then Drizzle queries), which pass typed
props to a co-located `*-client.tsx` Client Component that owns interactive
state and calls `"use server"` actions from `src/lib/<domain>/actions.ts`
via `useTransition`, then either relies on the action's own
`revalidatePath()` or calls `router.refresh()` to reflect fresh server
state. Server actions return a discriminated `{ ok: true, ... } | { ok:
false, error: string }` result rather than throwing, so the client can
render the error inline.

## Task history (what's been built, roughly in order)

Foundational work: JWT auth + bcrypt + httpOnly cookies + admin seed
script; reverse-engineered a standalone HTML prototype and ported it
screen-by-screen as native Next.js routes against the real DB (decision:
server-rendered pages, not a client SPA) — see the `port-strategy` project
memory for the reasoning; built the org hierarchy and multi-role user
model; ported every portal screen except Dealer; a full Tailwind
design-system overhaul (through a couple of palette iterations, landing on
lavender/purple) with reusable `.card`/`.btn`/`.table` classes and
per-role CSS-var theming; fixed a sidebar-scroll bug (root cause: `body`
was `min-h-full` instead of a hard-capped height, so the page grew instead
of the sidebar's own scroll region engaging).

Then a sequence of numbered feature requests, all delivered and verified
via `npx tsc --noEmit` + `npx eslint` (no browser testing per explicit user
preference — "do not do testing" — verification is typecheck/lint only for
code-only changes; browser verification is still expected for UI changes
the user asks to see):

1. Field reps can only add visits to counters in their own depot.
2. Field reps can see any counter via mobile search, but can't add a visit
   unless it's in their depot.
3. Every field salesman reports to a Supervisor (SO) —
   `users.reportsToUserId`, set by admin via a "Reports to (SO)" dropdown.
4. Removed mock data for field; implemented live `day_logs`, `counters`,
   `visits` tables.
5. All field dates in IST (`src/lib/date.ts`).
6. Check-in opens a counter detail page (details + "Add Visit to Counter"
   button + visit history), rather than instantly recording a visit.
7. Add-visit form: 2-step wizard (Visit Data → Review), repeatable
   product-segment lines, Deedar Rank, Competitor Presence, Remarks.
8. / 14. A visit is editable only within 24 hours of being recorded —
   verified enforced at three layers (server action, data-fetch, UI).
9. `stock` removed from `counters`; lives on `visits` instead (observed
   per-visit).
10. `visits.items` is a JSONB array (not a side table — an earlier
    `visit_items` table was built then dropped once the reference image
    showed the desired shape), plus `stock`/`sold` totals; no `depotId` on
    visits.
11. GPS capture is real device geolocation
    (`src/app/(portal)/field/_components/gps-capture.tsx`, browser
    Geolocation API), not a fake/random value.
12. Counter check-in / detail page layout revised to match a reference
    image (Mobile/Depot/Area,C&F/GPS rows, full-width "Add Visit for this
    Counter" button, visit history list).
13. **Today Beat is scoped to exactly two sources:** counters the rep
    created themselves, UNION counters a Supervisor assigned to them for
    today via the new `beatAssignments` table. The previous area-based
    visibility (`userAreas`) was removed from Beat scoping entirely (it's
    no longer sufficient on its own — "only" excludes it). This also
    surfaced and fixed a real functional gap: the "Assign Beat" supervisor
    screen was previously a pure client-side mock that never persisted
    anything to the database — it's now wired end-to-end through
    `src/lib/supervisor/actions.ts` (`assignBeat`) with real reads/writes,
    and its date picker was switched from raw browser-local `Date` to
    `istDateString()` so a supervisor's "today" lines up with the rep's
    Beat query.
14. Confirmed (verification-only, no code changes needed) — see point 8.

## Where to look for more detail

- Full schema: `src/db/schema.ts` (read this first for any data-model
  question — it's the source of truth, this doc is a summary).
- IST date handling: `src/lib/date.ts`.
- Field domain actions: `src/lib/field/{actions,day-log-actions,
  visit-actions,products}.ts`.
- Supervisor domain actions: `src/lib/supervisor/actions.ts`.
- Auth/session: `src/lib/auth/dal.ts`.
- Per-role theming and nav: `src/lib/portal/nav.ts`.
- Project memory (persists across sessions, outside the repo):
  `project_deedar_drive.md`, `port-strategy.md`, `field-live-data.md` in
  this user's Claude memory store — these track *why* decisions were made
  and finer implementation notes than this file; check them too.
