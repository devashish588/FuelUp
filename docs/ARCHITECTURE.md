# FuelUp — Architecture

> Phase 4 (production PWA shell + offline experience). Same app and data
> architecture as Phase 3, now installable with an offline-capable shell.

## 1. Current architecture

```
UI (src/app, src/components)
  → Zustand stores (src/stores — in-memory UI mirror, sync action API)
  → IndexedDB repositories (src/lib/repositories — Dexie, owner-scoped;
      every write also enqueues an outbox event)
  → FuelUpLocalDB v2 (IndexedDB: domain tables + sync outbox + meta)
  → Sync engine (src/lib/sync — controller, pull-apply, triggers, status)
  → Sync API (POST /api/sync/push, GET /api/sync/pull — Clerk + Zod)
  → Prisma (prisma/schema.prisma) → PostgreSQL
```

- **Local-first, cloud-reconciled.** Mutations complete locally first (never
  waiting on network); the outbox replays them to the server, and pull
  brings other devices' changes back. Device-local (`local:*`) namespaces
  never sync by design.
- **Prisma is the database source of truth.** `docs/schema.sql` is a legacy
  Supabase/RLS reference doc; where it conflicts with
  `prisma/schema.prisma`, Prisma wins (see §8).

## 2. Target architecture

```
UI
 ↓
Feature Components (src/features/*)
 ↓
Zustand stores — UI mirror + sync action API (src/stores)
 ↓
Domain Services (src/lib/services, src/lib/calculations)
 ↓
Repositories (src/lib/repositories — Dexie/IndexedDB implementations)
 ↓
IndexedDB (`FuelUpLocalDB v1`, src/lib/db/local-db.ts)
 ↓ (Phase 3+: outbox → sync)
API (src/app/api — auth, validation, authorization)
 ↓
Prisma (prisma/schema.prisma)
 ↓
PostgreSQL
```

Zustand is the UI mirror, not the database: actions update memory
synchronously (pages keep sync selectors) and write through to IndexedDB in
the background. Repositories additionally enqueue outbox events; the sync
controller pushes them in batches and pulls deltas, reloading only stores
whose entities changed.

## 3. Folder responsibilities

| Path | Owns | Must not |
|---|---|---|
| `src/app` | Routes, layouts, page composition, loading/error states | Business calculations, direct Prisma access |
| `src/components/ui` | Design-system primitives (`card.tsx`) | Domain logic |
| `src/components/layout` | Sidebar, bottom nav, page header | Data fetching |
| `src/components/shared` | Cross-page states (`feedback.tsx`: loading/error) | Domain logic |
| `src/components/charts` | Reusable visualizations (`weight-trend.tsx`) | Store mutations |
| `src/features/{nutrition,workouts,metrics,habits,analytics}` | Domain boundary barrels re-exporting calculations + types | UI rendering |
| `src/stores` | In-memory UI mirror + sync action API; write-through to repositories (Zustand) | Direct IndexedDB/Dexie access; treating memory as the DB |
| `src/lib/db` | `local-db.ts` (Dexie `FuelUpLocalDB v1`), `local-schema.ts` (version source), `local-entities.ts` (rows = domain + `ownerId`); Prisma singleton (server) | Imports from UI; server imports of the Dexie module |
| `src/lib/calculations` | **All** business math (`energy`, `nutrition`, `metrics`, `habits`, `workout`, `analytics`) | Imports from stores/components |
| `src/lib/services` | Server-side data access (Prisma) + pure recommendation logic (compat re-export) | Client imports of Prisma (`db`) |
| `src/lib/validation` | Zod schemas for API inputs + future forms | Business rules |
| `src/lib/auth` | Clerk → FuelUp user resolution (`requireDbUser`) | Hardcoded users |
| `src/lib/errors` | User-safe `AppError`s, never raw DB errors | Logging internals to client |
| `src/lib/logger` | Structured server logs, secrets redacted | Client-side logging of PII |
| `src/lib/repositories` | Owner-scoped IndexedDB implementations + sync enqueue on every mutation (base + per-domain modules) | Direct storage access from UI/stores bypassing these modules |
| `src/lib/sync` | Outbox, controller (push/pull), pull-apply, triggers, status store; `server/` holds push/pull application (Prisma) | UI imports of Dexie; server imports of client sync code |
| `src/components/sync` | Unobtrusive sync health UI (`SyncStatusCard`, mounted in Settings) | Sync UI anywhere else; redesigns |
| `src/lib/session` | Owner resolution + one-shot boot (`session-init`, `session-store`, `owner`) | Server-only auth code; email as identity |
| `src/lib/persistence` | localStorage inventory (`storage-keys.ts`) | New persistence without documenting |
| `src/lib/mappers` | Explicit domain ↔ DTO conversions (snake_case ↔ camelCase) | Business logic |
| `src/lib/constants`, `src/lib/utils`, `src/lib/db` | Seed data/labels; date/format helpers (`utils` re-exports canonical math); Prisma singleton | Duplicated formulas |
| `src/types` | Public type surface (re-exports `@/lib/types`) | Competing model definitions |
| `src/config` | `env.ts` (public vs server env), `app.ts` (storage keys, versions, `LOCAL_OWNER_ID`) | Secrets in client code |

## 4. Data flow

- **Writes:** page → store action (sync, optimistic memory update) →
  repository → IndexedDB transaction + outbox event (coalesced). Clearing the
  network never blocks a save; failures surface as user-safe `lastError` +
  structured logs.
- **Push (background):** outbox (due, oldest-first, ≤50/batch) →
  `POST /api/sync/push` → auth → Zod → ownership check → per-event
  transaction (apply + `ProcessedMutation`) → per-event ack
  (`ok`/`duplicate`/`conflict`/`invalid`/`retryable`). Acked events are
  deleted; failures back off exponentially (≤10 retries, then dead-letter
  until manual sync).
- **Pull (background):** `GET /api/sync/pull?cursor=` → rows with server
  `updatedAt` > cursor (bounded pages) + tombstones → applied in ONE Dexie
  transaction together with the cursor write → only changed stores reload.
- **Reads:** unchanged — Zustand selectors → `useMemo` → render.
- **Boot:** `<LocalSessionBootstrap/>` → Clerk → owner → migration →
  carryover → store loads → triggers + initial `syncNow()` (user mode only).

## 5. Authentication flow

1. `ClerkProvider` (`src/app/layout.tsx`) establishes the session.
2. `src/middleware.ts` runs Clerk middleware on all app/API routes; the
   Clerk webhook route is passed through to its own Svix verification.
3. API routes call `requireDbUser()` (`src/lib/auth/current-user.ts`):
   Clerk `userId` → `users.clerk_id` row → scoped queries. Missing session
   → user-safe 401 (`AppError`, no internals leaked).
4. `POST /api/webhooks/clerk` verifies the Svix signature with
   `CLERK_WEBHOOK_SECRET`, then upserts/deletes the `users` row.
5. Local owner namespace (`src/lib/session/owner.ts`): signed-in sessions use
   the FuelUp user id from `GET /api/me` (stable, never email); signed-out or
   offline sessions use `local:<device-uuid>`. Every IndexedDB row carries its
   `ownerId` and every repository call asserts it — cross-user reads/writes
   are no-ops by construction. `LOCAL_OWNER_ID` (`''`) survives only as a
   legacy-data marker, never as an active namespace.
6. Date convention (binding): `date` fields are **local calendar days**
   `YYYY-MM-DD` (never UTC-shifted); `created_at` ISO timestamps are audit
   fields only. Heatmap/month grouping depends on this.

## 6. Persistence + sync strategy

- IndexedDB `FuelUpLocalDB v2` (Dexie; v1 upgrades in place, domain data
  preserved): all Phase 2 tables plus `outbox`
  (`[owner+status]`, `[owner+status+nextAttemptAt]`) and `meta` markers
  (legacy migration, carryover, `sync:cursor:<owner>`).
- Server: `updatedAt` on all synced models (+ `[user, updatedAt]` indexes),
  `ProcessedMutation` (exactly-once push), `SyncDeletion` (tombstone journal).
- Conflict policy: state rows (profile/habits/metrics/items/plan) converge by
  latest-valid-update; event rows (food/habit logs, sets, graphs) merge by
  stable id — independent events from two devices always both survive.
  Unpushed local edits are never clobbered by pull; pending edits beat remote
  deletes (delete wins over clean state only).
- Date convention (binding): `date` = local `YYYY-MM-DD`; server `updatedAt`
  is authoritative for pull ordering (client clocks are never trusted).
- No tables for water/sleep/activity/summaries by design; the weekly routine
  plan is local-only (no server model) and never enqueues.

## 7. Domain boundaries

- **Nutrition** (`features/nutrition`): food definitions, quantity-first
  logging, meal/day rollups, favorites (`calculations/nutrition`,
  `calculations/quantity`, `lib/nutrition/display`). Store: `calorie-store`.
  See §11.
- **Workouts** (`features/workouts`): exercises, workouts, sets, PRs, weekly
  plan (`calculations/workout`). Stores: `exercise-store`,
  `workout-planner-store`. Note: local `PR` (planner) vs canonical
  `PersonalRecord` (DB) intentionally kept separate; mapping deferred.
- **Metrics** (`features/metrics`): weight + body measurements, BMI
  (`calculations/metrics`). Store: `metrics-store`.
- **Habits** (`features/habits`): habits, logs, streaks, heatmap series
  (`calculations/habits`). The monthly heatmap + daily graph + completion
  stats are owned here and were preserved as-is. Store: `habit-store`.
- **Analytics** (`features/analytics`): pure transforms (`average`,
  `adherenceRate`, …). Consumes domain data; mutates nothing.

## 8. Known divergences (Prisma wins)

`docs/schema.sql` is historical Supabase documentation. Deliberate
differences kept for Phase 1:

- `users` (Clerk `clerk_id`, cuid ids) vs legacy `profiles` (Supabase
  `auth.users` UUIDs, RLS). No RLS: authorization lives in API code.
- `exercises` table exists in Prisma (added Phase 1 — `WorkoutExercise`
  referenced a non-existent model); diet plans, templates, personal records
  exist only in the SQL doc and are **not** created (deferred features).
- `exercise_sets.distance_meters` (float) vs SQL `distance_km`; Prisma wins.
- `body_metrics` has `UNIQUE(user_id, date)` in Prisma (matches the store's
  same-day upsert); SQL doc allowed duplicates.
- `habits.target_value` is `Int` in Prisma vs decimal in SQL (matches the
  local `Habit` type and heatmap math).

## 9. Intentionally deferred (Phase 5+)

Push-notification business logic, AI/voice/barcode/camera, TDEE adapts,
wearables, Stripe/subscriptions, social, meal planning, groceries. No camera
or notification permissions are requested anywhere (verified: zero
getUserMedia/mediaDevices references).

## 10. PWA shell (Phase 4)

Roles stay separate: the service worker caches shell/assets only; IndexedDB
owns domain data; the Phase 3 sync engine owns reconciliation; Zustand owns
UI state.

- **Manifest**: single source `src/app/manifest.ts` (serves
  `/manifest.webmanifest`): FuelUp/standalone/`/`/`#0b0b0c`/portrait,
  192+512 (+maskable) PNG icons, categories. Apple touch icon + theme color
  via root metadata; `viewportFit: cover`, no `maximumScale` (zoom intact).
- **Icons**: `public/icons/*` generated by `scripts/generate-pwa-icons.mjs`
  (Node built-ins only; committed script, committed PNGs): 192/512,
  maskable-512 (padded safe zone), 180 apple-touch. Amber bolt on dark mark.
- **Service worker** (`public/sw.js`, vanilla, zero dependencies — Serwist
  deliberately not used: Next 16 defaults to Turbopack, which the
  webpack-plugin path doesn't cover, and a 16MB dependency for static
  caching is unjustified):
  - precache (install): `/offline`, icons, manifest.
  - runtime CacheFirst: `/_next/static/*` (immutable), icons/images/fonts.
  - navigations: NetworkFirst (5s timeout) → cached same-URL shell (LRU 25)
    → precached `/offline` (branded retry/continue page, `force-static`).
  - network-only (never intercepted): `/api/*`, RSC flight (`?_rsc=`),
    `/sign-in|/sign-up`, Clerk hosts, non-GET. Cache version
    (`CACHE_VERSION`) is the single source in sw.js, independent of the
    IndexedDB schema version; activation deletes only `fuelup-*` caches.
- **Registration/update** (`components/pwa/sw-register.tsx`, mounted in root
  layout): browser-only, once, failure-safe. No auto-`skipWaiting`: a waiting
  worker raises `PwaUpdateBanner` (dismissible, above the bottom nav);
  user-tapped Reload sends `SKIP_WAITING` → `controllerchange` reloads.
  Active-workout draft (localStorage persist) and IndexedDB are never
  touched by updates.
- **Install** (`lib/pwa/install.ts`, `InstallCard` in Settings → App):
  Chromium uses the captured `beforeinstallprompt` (no auto-modal); iOS gets
  Share → Add-to-Home-Screen steps; installed devices see status only.
  `useIsInstalledPWA()` detects standalone via display-mode/`standalone`.
- **Mobile**: safe-area utilities (`pt/pb/px/mb-safe`, Tailwind v4
  `@utility`, variant-compatible) applied to the sticky header, bottom
  sheets (mobile only), and update banner; bottom nav already insets.
- **Sync integration**: page triggers remain primary; Background Sync is a
  relay only — SW `sync` event posts `FUELUP_SYNC_NOW` to clients, the page
  runs the existing `syncNow()` (registered best-effort in triggers; silent
  when unsupported). Online/offline UI reuses `useSyncStore` exclusively.
- **Security**: `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options: SAMEORIGIN` (Clerk renders in-page); `/sw.js` served
  `no-cache`; icons immutable. No CSP (Clerk + Next inline scripts make a
  static allowlist brittle — documented, not omitted by accident).

## 11. Nutrition domain (Phase 5)

Food → nutrition data → quantity → food log → meal → daily totals. A food
definition is never a meal log: logs carry a frozen nutrition snapshot
(quantity, unit, macros, name, estimate flag), so later food edits can't
rewrite history.

- **Food model** (`FoodItem`): basis (`serving_size` × `serving_unit`) plus
  `category`, `source` (builtin/verified/branded/user/recipe/imported/
  estimated), `source_id`, `aliases`, `count_weight_g` (grams per count),
  `food_state` (raw/cooked/prepared), `preparation`, `serving_description`
  (household hint), `sugar_g`/`sodium_mg` (null = unknown, not zero),
  `is_estimated` (≈ marker, never false precision). All additive/optional.
- **Quantity model** (`calculations/quantity`): input in g/kg/ml/L/count/
  serving, normalized to the food's basis before scaling. g⇄ml never converts
  (density unknown); count needs `count_weight_g` (or a count basis).
- **Calculations** (`calculations/nutrition`): `calculateNutritionForQuantity`
  (perBasis × normalized), `calculateMealNutrition`, `calculateDailyNutrition`
  (single canonical rollup with targets — dashboard, food page, analytics all
  consume it), `calculateMacroPercentages` (Atwater 4/4/9). Full float
  precision internally; rounding only at the boundary (kcal whole, macros 1
  decimal, sodium whole mg) via `roundNutrientsForDisplay`.
- **Dataset** (`constants/food-database.ts`, append-only so `food-{i}` ids are
  stable): ~90 items prioritizing Indian staples/proteins/legumes/dairy/
  produce, each with state, household serving hints, and aliases
  (roti↔chapati, curd↔dahi). Composite dishes carry `is_estimated`.
- **Favorites** (`FavoriteFood` join: user × food id): explicit, user-scoped,
  offline, synced as entity `favorite` through the standard outbox. Recent
  foods stay derived from log order. Weekly-plan-style local-only shortcuts
  were deliberately not used — favorites sync.
- **Custom foods**: name/brand/basis/quantity/macros/fiber/sugar/sodium/
  category/state/count-weight/description/estimate flag, Zod-validated
  (negatives, NaN, Infinity, empty names rejected; sane bounds, not
  aggressive).
- **Ranges** (e.g. 650–800 kcal for uncertain restaurant food) are a
  documented future enhancement — no poor-man's model was invented; estimated
  items show ≈ plus provenance instead.
- **Future sources** (USDA/IFCT/branded/recipes/AI estimates) plug in via
  `source`/`source_id` without model changes; no external ingestion exists.

## 12. Recipe domain (Phase 6)

Ingredients → recipe → cooked yield → totals → per-100g → portion → frozen
FoodLog snapshot → daily totals. A saved recipe materializes as a FoodItem
(source='recipe', same id, per-100 basis) so search / recent / favorites /
logging / snapshots / sync all work through existing food flows unchanged;
Recipe + RecipeIngredient tables hold the editable structure.

- **Recipe model** (`Recipe`): name/description/category/preparation,
  explicit cooked `yield_quantity` + `yield_unit` (g|ml), optional
  `serving_quantity` in yield units + `serving_description` display hint
  ("1 bowl ≈ 190 g" — never a stored quantity), `source`, `is_estimated`,
  `food_item_id` (= recipe id). No formal version numbers; history is
  protected by frozen log snapshots, not versioning.
- **Ingredient model** (`RecipeIngredient`): `food_id` reference +
  `food_name` snapshot, `quantity`/`quantity_unit` via the Phase 5 engine
  (no second quantity system), `sort_order`, notes.
- **Calculations** (`calculations/recipes`): `calculateRecipeNutrition`
  (sums `calculateNutritionForQuantity` per ingredient; unresolvable rows
  reported, never zero-filled), `calculateRecipePer100g` (totals ÷ yield ×
  100; null on non-positive yield), `servingNutrition`,
  `materializeRecipeFoodItem`, `validateYield`. Estimated propagates from any
  estimated ingredient; sugar/sodium stay null unless some ingredient carries
  them. Explicit zeros (water, salt, spices) are real zeros by domain rule.
- **Snapshot strategy** (two layers): (1) recipe saves freeze per-100 values
  into the materialized FoodItem — later food edits don't move it (re-save
  recalculates explicitly); (2) logging freezes a FoodLog snapshot — later
  recipe edits/deletes can't move it, and recipe deletion never deletes logs.
- **Sync**: entities `recipe` + `recipeIngredient` through the standard
  outbox (push order recipes before ingredients; upserts by stable id;
  removed ids tombstoned on edit; recipe delete cascades ingredients +
  materialized item server-side with a recipe tombstone; clients cascade
  locally). Ingredient→own-recipe ownership enforced (no orphan attaches).
  Same ids on two devices coexist (names are never keys).
- **Future AI** produces candidate ingredients/recipes; the deterministic
  engine stays the calculation source of truth. No AI in this phase.

## 13. Adaptive energy domain (Phase 7)

Profile → BMR → initial TDEE → initial target (unchanged, immediate after
onboarding) → real intake + weigh-ins → smoothed trend → observed energy
balance → adaptive maintenance → goal-based target → confidence/quality.
Deterministic throughout; no AI anywhere. Derived analytics are recomputed
locally from synced raw facts, never synced as truth.

- **Three concepts, never mixed**: *initial estimate* (profile + activity
  assumptions), *observed maintenance* (actual intake + weight trend),
  *target* (maintenance + explicit goal). Dashboard/Calories show a
  one-line provenance label ("Starting estimate" vs "Current adaptive
  target · based on N days"); detail lives on Metrics + Settings.
- **Weight trend** (`calculations/metrics`, the ONE method): 7-day rolling
  median — same-day weigh-ins collapse to median (repo keeps one row/day,
  latest write wins), smoothed(d) = median of observations in [d−3, d+3],
  gaps stay gaps, rate = (last − first smoothed)/days between. Chosen over
  EWMA/raw deltas because a single anomalous weigh-in cannot move a median;
  works with missing/irregular days. Same series feeds math + chart overlay.
- **Maintenance** (`calculations/energy`): `avg valid-day intake −
  rate(kg/day) × 7700`. The 7700 factor is a documented approximation
  (`KCAL_PER_KG_EQUIVALENT`, isolated in the calc layer) — UI says
  "estimated maintenance / based on logged data", never exact metabolism.
  Bounds ±max(100, 15% of rate component). Valid day = ≥200 kcal via the
  canonical `calculateDailyNutrition` (no second food-total system).
- **Gates (conservative)**: ≥10 valid nutrition days, ≥5 weigh-in days,
  ≥14-day trend span over a 28-day local-calendar window — else the
  starting estimate stands with a plain-language reason.
- **Quality vs confidence**: quality = 0–100 reproducible score
  (nutrition 50 + weight 30 + span 20; High ≥70/Medium ≥40/Low); confidence
  is separate (High needs quality-High + span ≥21 + ≥8 weigh-ins) with
  food/weight sub-ratings. Neither equals adherence.
- **Goals/rates**: `GoalType` + maintain/custom (auto-derive still only
  assigns cut/bulk/recomp; user picks the rest). Rate = stored explicit
  value ?? goal default (cut 0.5, bulk 0.25, else 0), clamped [0, 1.5];
  adjustment = ∓rate·7700/7 for cut/bulk, 0 for maintain/recomp/custom
  (recomp stays maintenance-oriented by design); capped ±750, target
  floored 1200, macros via the canonical `calculateMacroTargets`.
- **Weekly smoothing**: updates apply explicitly (Metrics "Update target")
  at most weekly (derived from history dates), stepped at most ±150 kcal.
  Manual target edits set `target_source='manual'` and pause adaptation.
  Every application appends a `TargetHistory` event (previous/new/reason/
  maintenance/valid-days/confidence/goal/avg-intake) — the deterministic
  "why did my target change?" source. History rows sync as entity
  `targetHistory`; profile carries `target_rate_kg_per_week` +
  `target_source` (whole-row upsert, existing pattern).
- **Storage/sync**: Dexie v5 adds `targetHistory`; Prisma adds
  `TargetHistory` + two User columns. Raw facts stay authoritative;
  food logs are never rewritten by target changes. Multi-device converges
  because derivation is pure over the same synced facts (tested A→B→A).

## 14. AI food-logging domain (Phase 8)

AI proposes; FuelUp's deterministic engines calculate; the user confirms.
First AI feature: natural-language food logging. No AI SDK dependencies —
one OpenAI-compatible HTTPS implementation via native fetch covers
OpenAI/Groq/OpenRouter-style endpoints through env config.

- **Boundary**: user text → `POST /api/ai/food-parse` → AI service →
  structured candidates → deterministic resolver (real FoodItems/recipes)
  → quantity engine → nutrition engine → review → confirm → FoodLog →
  IndexedDB → outbox → sync. The prohibited shortcut (AI → calories →
  FoodLog) is architecturally impossible: the model output schema strips
  calories/macros/confidence, and the route has no database access.
- **Provider layer** (`lib/ai`): `AiProvider` interface
  (`generateText`), `openai-compatible` implementation (JSON mode,
  temperature 0, AbortController timeout, exactly one retry on transient
  failures only), factory from centralized `AiConfig` (env, no hardcoding).
  Business logic never touches vendor SDKs. Image inputs are accepted by
  the interface but never sent (Phase 9+ camera prep, no storage).
- **Structured contract** (Zod, client-safe): request `{text}` (1–500
  chars, unknown keys stripped); response `{items[{name, quantity|null,
  unit|null, mealHint, preparationHint}], clarificationRequired}` (max 15
  items); strict `JSON.parse`, no prose salvage. AI returns identity +
  quantity + unit + hints only — never nutrition.
- **Resolver** (`lib/ai/resolve`, pure): shared `food-search` scoring
  with the store (exact 100 / prefix 30 / substring 20 / weak 10, +5 prep
  tie-break) → resolved (one strong match) / ambiguous (tie, user picks)
  / unresolved (weak only) / unsupported (no signal). Missing quantities
  stay empty (never invented); household units (bowl/glass/…) map to the
  food's own serving definition as an editable suggestion. Preview totals
  via canonical `calculateMealNutrition` over provisional rows;
  `confirmAiReview` is the ONLY path to `addFoodLog` (mirrors the manual
  submit shape exactly).
- **Server discipline**: Clerk `requireDbUser` (401), 8 KB body cap,
  per-user in-memory sliding-window rate limit (20/hr default; per-
  instance approximation documented), timeouts, normalized error codes
  (`AI_TIMEOUT/QUOTA/RATE_LIMITED/INVALID_OUTPUT/...`), user-safe
  messages, audit logs with metadata only (requestId/provider/model/
  latency/itemCount — never prompts or secrets), per-caller usage status
  endpoint. Minimal request (food text only — no weight, history, tokens).
- **Fallbacks**: no key → configuration error; any failure → specific
  message + manual logging; offline → AI disabled, Search/Recent/
  Favorites/Recipes/Manual unaffected. AI requests never enter the food
  outbox; only confirmed FoodLogs sync. Phase 7 `EnergyState` untouched
  and never sent (future Coach contract).

## 15. AI vision domain (Phase 9)

Same principle, new input: AI interprets photos; everything downstream is
the existing deterministic pipeline. Two capabilities — meal camera and
nutrition-label scanner — share one vision abstraction. No AI tables, no
photo storage, no sync changes.

- **Meal pipeline**: photo → `POST /api/ai/vision` (`task: 'meal'`) →
  `parseMealImage` → `AiMealItem[]` (name/quantity-or-null/unit-or-null/
  mealHint/preparationHint + `visualPortionHint` + `foodState`) →
  unchanged `resolveFoodCandidates` → quantity engine → nutrition engine →
  shared `AiReviewPanel` → confirm → FoodLog. `foodState` folds into
  `preparationHint` for resolver scoring; `visualPortionHint` ("medium
  bowl") is display-only. Grams are never invented from pixels: uncertain
  portions return `quantity: null` and the UI asks.
- **Label pipeline**: photo → `POST /api/ai/vision`
  (`task: 'nutrition_label'`) → `parseLabelImage` → `AiLabelCandidate`
  (name/brand/serving basis + 7 nutrients, all nullable) → Zod →
  `buildLabelFoodDraft` (unclear basis → per-100 g + warning; unreadable
  macros → 0 + warning; sugar/sodium stay null) → user-editable review →
  `addFoodItem` (source `branded` with brand else `user`) → My Foods.
  Extraction, not verification ("Review before saving"); NO FoodLog is
  created by scanning.
- **Provider vision** (`AiProvider.generateVision?` + `supportsVision?`,
  both optional): `openai-compatible` sends OpenAI content-parts
  (text + one image_url data URL), vision-model override supported, same
  single-transient-retry discipline. Capability is explicit
  (`providerSupportsVision` AND `AI_VISION_ENABLED` AND key present) —
  no model-name heuristics; unsupported setups fail fast with the new
  `AI_IMAGE_UNSUPPORTED` code instead of crashing or silently downgrading.
- **Image contract**: JPEG/PNG/WebP only (declared MIME + magic-byte
  sniffing server-side); exactly one image per request; client compresses
  to ≤1280px longest edge, JPEG q0.82 (~≤500 KB); server base64 cap ~750 KB
  decoded (413 beyond). Versioned prompts (`meal_vision v1`,
  `nutrition_label v1`) live in the AI layer with Indian-food examples,
  multi-component rules, and untrusted-image/label-text clauses (prompt-
  injection safety) — never in components.
- **Image lifecycle** (privacy): camera/file → memory + blob URL →
  compressed upload → analysis → discard (URLs revoked). Photos never
  reach IndexedDB, FoodLog, outbox, sync, or Prisma. Provider payloads
  carry image + optional clarification text only. Audit logs carry
  metadata only (never image bytes/base64). Camera permission is requested
  only on explicit "Open camera" tap, with upload fallback; capture works
  offline but analysis needs the server ("Save this image? Not available
  in this version" — nothing queued).
- **Server discipline**: Clerk auth, 1.5 MB body cap, separate image rate
  bucket (10/hr default, same sliding-window infra), timeouts, normalized
  codes, per-caller status extended with `visionSupported` +
  `imageRequestsRemaining`.
- **UI**: AI tab gains Describe/Scan-Meal/Scan-Label modes (few taps:
  Food → AI → Scan Meal → Capture → Analyze → Review → Confirm).
  `CameraCapture` (preview, plate guide, capture/retake/upload, permission
  states, aria-live) feeds `MealScanPanel` (preview → optional text →
  analyze → shared review) and `LabelScanPanel` (→ editable label review
  → save). Full keyboard/screen-reader labeling; desktop gets upload
  fallback. No food-page redesign, no analytics/heatmap changes.

## 16. Production readiness (Phase 10)

Hardening only — no product changes. Camera streams stop on tab-hide,
unmount, capture, retake, and close (never on load; permission only on
explicit tap); getUserMedia failures map to specific guidance with upload
fallback; captures flatten onto white (JPEG has no alpha); Blob URLs are
revoked after analysis; images never enter IndexedDB/outbox/sync. SW uses
no skipWaiting-on-install (user-controlled reload via banner, shown on
desktop too), caches shell/assets only (guard-tested: no /api, Clerk, RSC,
or storage APIs). Sync serializes via navigator.locks + memory fallback;
status card distinguishes saved-locally from synchronized. Viewport is
zoom-safe with safe-area utilities; animations honor
`prefers-reduced-motion`; numeric inputs declare keyboard modes. Export
covers all collections, never secrets. `APP_VERSION` (config/app.ts) is
pinned to package.json by test and shown in Settings + diagnostics.
Release gates: automated + build + security + PWA + data pass; real-device
mobile gate outstanding (`docs/MOBILE-QA-CHECKLIST.md`).

## 17. Daily-use completion (Phase 10.5)

Small safety/convenience close-out — no new product surface beyond it.

- **Owner scoping rule (binding)**: `table.where('ownerId')` silently
  matches NOTHING on tables whose schema declares only compound indexes
  (`foodLogs`, `habitLogs`, `outbox`). All owner-scoped reads/deletes go
  through `whereOwner`/`whereOwnerKeys` (repositories/base) or an explicit
  compound range. This fixed real bugs: Settings Reset and device→user
  carryover previously skipped food logs, habit logs, and outbox rows.
- **Backup/restore** (`lib/backup` + `validation/backup`): versioned
  `fuelup-backup` JSON (format/version/exportedAt/appVersion + 14
  collections + profile + weekly plan; derived analytics never stored).
  Export strips identity and self-validates; browser download only, never
  uploaded. Import: 10 MB cap → JSON → envelope → version → entity Zod →
  preview counts → explicit confirm → ONE Dexie transaction (clear owner
  namespace incl. stale outbox, keep sync cursor, bulk-put remapped rows
  chunked without macrotask yields). IDs preserved; foreign-id collisions
  skipped + reported (never clobbered). Restore is local-only; normal
  incremental sync resumes afterward.
- **Target-rate history**: `TargetHistory` carries nullable
  `previous/new_rate_kg_per_week` (Prisma + sync whitelists extended);
  settings rate edits append `target_rate_changed` events via
  `energy-store.recordRateChange` (identical resubmits ignored); the
  deriver compares the last rated entry against the effective rate so the
  `rateChanged` explanation fires. Manual target edits still pause
  adaptation with history intact (unchanged).
- **Quick actions**: dashboard FAB gains Repeat Last (prefill intent via
  calorie-store `repeatRequest`, consumed once by the food modal) and Log
  Water (existing Water habit +1 via `logHabit`); Recent/recipe rows gain
  Repeat buttons prefilling food + last quantity/unit/meal. Review-before-
  Add is mandatory everywhere — intents never log by themselves. All flow
  Zustand → repo → outbox (offline-safe, PWA-identical).
- **Settings/Data**: versioned Export/Import panel with preview, staged
  progress, and safety copy ("backup stays on your device; restore
  replaces local data"); reset guidance text. Diagnostics adds DB version,
  backup availability, last export/import, outbox count, and cursor state
  (counts/presence only — no contents, no secrets).
