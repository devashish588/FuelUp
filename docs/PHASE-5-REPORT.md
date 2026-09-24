# FuelUp — Phase 5 Report (Nutrition & Calorie Tracking Foundation)

## 1. Nutrition Architecture Before

Servings-only logging (`food.calories_per_serving × servings`), ~60 western
foods, no quantity units, no provenance/state, snapshot limited to 4 macros,
no edit/duplicate/favorites, search over name/brand only, no canonical daily
rollup (inline reduces), no nutrition tests.

## 2. Nutrition Architecture After

Food → quantity (g/kg/ml/L/count/serving, normalized to the food's basis) →
frozen-snapshot log → meal → canonical daily rollup. Dataset ~90 items with
Indian staples/proteins/legumes; explicit favorites synced as an entity;
edit/duplicate/move-meal in the existing modal; Zod-validated customs;
deterministic calculations with a documented rounding policy.

## 3. Food Model

`FoodItem` gains optional `category`, `source` (+`source_id`), `aliases`,
`count_weight_g`, `food_state`, `preparation`, `serving_description`,
`sugar_g`/`sodium_mg` (nullable), `is_estimated`. `FoodLog` gains optional
`quantity`, `quantity_unit`, `food_name`, `is_estimated`, `fiber_g`,
`sugar_g`, `sodium_mg`. All additive — existing rows, seeds, and the 85
prior tests compile and pass unchanged. New `FavoriteFood` join
(user × food id).

## 4. Quantity/Unit Model

`calculations/quantity.ts`: `basisUnitOf`, `defaultUnitFor`,
`availableUnitsFor`, `normalizeFoodQuantity` (rejects ≤0, non-finite,
absurd, and g⇄ml with human-readable reasons; count needs a gram mapping),
`scaleFactorFor`. Household reality holds via `count_weight_g`
(egg 50 g, roti 40 g, banana 118 g) and `serving_description`
("1 bowl (~150 g)"); "1 bowl" is display text, never a stored quantity.

## 5. Nutrition Calculation Rules

`nutritionPerBasis × normalizedQuantity = loggedNutrition`
(`calculateNutritionForQuantity`), `calculateMealNutrition`,
`calculateDailyNutrition` (single rollup with targets — dashboard, food page,
analytics consume it), `calculateMacroPercentages` (Atwater). Full float
precision internally; boundary rounding only (kcal whole, macros 1-decimal,
sodium whole mg; null stays null). No LLM anywhere.

## 6. Food Sources

Every item answers provenance: `builtin` (generic dataset), `verified`,
`branded`, `user` (customs default), `recipe`, `imported`, `estimated`.
Labels via `lib/nutrition/display.sourceLabel`. Composite dishes
(chicken curry, sabzi) are `is_estimated` and render with ≈. Future
USDA/IFCT/branded/recipe/AI sources plug into `source`/`source_id` — no
ingestion built, no model changes needed.

## 7. Food Logging Flow

Search/Recent/Saved → pick → quantity + compatible unit + meal (live preview,
inline errors) → Add. Snapshot stores computed macros + name + estimate flag
+ embedded item; later food edits can't rewrite history (tested). Edit reuses
the modal (quantity/unit/food/meal); duplicate re-logs under a new id; delete
unchanged. All through IndexedDB → Zustand → outbox (existing Phase 3 path).

## 8. Custom Food Flow

Manual tab: name, brand, nutrition-per basis (qty + unit), calories, macros,
fiber, sugar, sodium, category, state, count weight, serving hint, estimate
toggle → "Save to My Foods" creates the definition then jumps to the quantity
step. Zod rejects empty names, negatives, NaN/Infinity, and absurd values
with field-appropriate bounds.

## 9. Search/Recent/Favorites

Search matches name (prefix-ranked), brand, aliases, category; null-safe;
capped at 20, memoized in the modal. Recent stays log-order-derived.
Favorites are explicit ★ toggles on any row, persisted per-owner in
`favoriteFoods`, offline, synced as entity `favorite` (push/upsert/delete,
pull apply, tombstones, cross-device test). All user-scoped.

## 10. Offline Behavior

Everything local: search (bundled dataset + IDB customs), add/edit/delete/
duplicate, totals, analytics, reload persistence, outbox rows queued without
network (tested: repo writes create pending outbox events; reload test in
Phase 3 suite). No nutrition path fetches.

## 11. Sync Integration

No new sync system: `foodItem`/`foodLog` payloads carry the new columns
(validated, explicitly mapped in apply-push/pull-apply/collect-pull);
`favorite` added as a first-class entity (contracts, validation, push with
ownership checks, pull paging, tombstones, guarded apply). Weekly-plan-style
local-only was considered and rejected for favorites. Server `FoodLog`
keeps the snapshot columns so history survives cross-device.

## 12. Tests Added

47 new (132 total): quantity matrix (15: units, kg/L, count mapping,
invalid/NaN/absurd, g⇄ml refusal, factors); calculations (14: exact 180 g
rice, float precision, 3-egg scaling, error reasons, null micros, rounding,
meal multi/empty, daily multi-date + UTC-shift grouping, Atwater);
validation (8: customs, logs, favorites); store (7: search relevance/alias/
null-safety/empty, recency dedupe, favorites toggle, duplicate); repository
(4: edit+resync, snapshot freeze, favorites ownership, offline outbox); sync
(4: quantity/snapshot mapping, favorite lifecycle + cross-user + tombstone,
pull favorite inclusion, A→B favorite sync).

## 13. Validation

- `npx prisma generate` — pass (FavoriteFood + new columns).
- `npx tsc --noEmit` — pass, 0 errors.
- `npm run lint` — pass, 0 errors, 0 warnings.
- `npm run build` — pass, all routes compile.
- `npm test` — 18 files, 132/132 passed (85 prior + 47 new, zero regressions).

## 14. Manual Acceptance Test

No mobile lab in this environment — verified by construction + tests, with a
browser run still outstanding:
- Morning (2 eggs + 2 rotis + 250 ml milk): eggs/roti offer `count`
  (50 g/40 g mappings), milk offers ml; preview math covered by tests.
- Lunch (180 g rice + 150 g dal + 200 g curry): gram inputs on per-100 g
  bases; meal totals via `calculateMealNutrition` (tested).
- Edit 200→250 g, delete dal: `updateFoodLog`/`removeFoodLog` paths tested
  incl. resync and totals.
- Offline banana + 100 g curd: offline outbox creation tested; heatmap
  untouched (habit domain not referenced by any nutrition code path).
- Reconnect + reload: outbox/retry/reload covered by Phase 3 suite.
Each step maps 1:1 to an automated test except physical taps — recommended
pre-release run on device.

## 15. Preserved Features

Confirmed (no redesign; dashboard/metrics/habits/analytics/PWA/sync logic
untouched; prior suite green unmodified): Dashboard, Food UI, Workouts,
Metrics, Habits, Heatmap, Daily score, Streaks, Analytics, PWA, Offline
storage, Sync.

## 16. Remaining Issues

- Device acceptance run outstanding (see §14).
- Nutrition ranges (650–800 kcal display) deferred by design (§25).
- No per-day target overrides; targets remain profile-level (no adaptive TDEE).
- Seed stubs on the server carry snapshot names only (no full catalog sync).
- Fiber/sugar/sodium shown in calculations, not yet in macro cards (UI kept stable).

## 17. Phase 6 Readiness

Deterministic nutrition is now load-bearing: quantity-first logs with frozen
snapshots, canonical rollups, validated customs, synced favorites, and an
Indian-ready dataset. Phase 6 (recipes, meal planning, or AI estimates) can
build on `source`/`recipe` provenance, per-basis math, and the existing sync
entities without model rewrites.
