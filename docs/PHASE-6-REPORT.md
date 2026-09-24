# FuelUp — Phase 6 Report (Recipes + Home-Cooked Meal Engine)

## 1. Recipe Architecture Before

Phase 5 end state: quantity-first single foods with frozen FoodLog snapshots,
~90-item Indian-prioritized dataset, favorites, and outbox sync over
`foodItem`/`foodLog`/`favorite`. No recipe concept existed — home-cooked
meals could only be logged as opaque manual entries or estimated seed
dishes; there was no way to save ingredient structure, cooked yield, or
per-100 nutrition for a repeated dish.

## 2. Recipe Architecture After

Ingredients → Recipe → cooked yield → totals → per-100g → portion → frozen
FoodLog → daily totals. A saved recipe materializes as a `FoodItem` (same
id, `source='recipe'`, per-100 basis, `serving_size: 100`) so search, recent,
favorites, logging, snapshots, and sync all reuse existing food flows
unchanged. `Recipe` + `RecipeIngredient` tables hold the editable structure;
`FoodLog` rows hold frozen consumed snapshots. New surfaces: Recipes tab +
builder modal in the food sheet, `recipe-store`, `recipe-repository`,
`calculations/recipes.ts`, sync entities `recipe`/`recipeIngredient`.

## 3. Recipe Data Model

`Recipe`: id, user_id, food_item_id (= recipe id), name, description,
category, preparation, explicit cooked `yield_quantity` + `yield_unit`
(g|ml), optional `serving_quantity` (in yield units) + `serving_description`
display hint ("1 bowl ≈ 190 g" — never a stored quantity), `source`
(user|imported), `is_estimated`, created_at/updated_at. Prisma indexes
[userId], [userId, updatedAt]. No `deletedAt` column — the shared tombstone
journal covers deletes (consistent with every other entity). No formal
version numbers: history is protected by frozen log snapshots, not
versioning. Names are never keys; ids are stable (`generateId`).

## 4. Ingredient Model

`RecipeIngredient`: id, recipe_id, user_id, food_id, food_name snapshot,
quantity, quantity_unit (g|kg|ml|L|count|serving), sort_order, notes,
created_at (+ server updatedAt). Dexie v4: `id, [ownerId+recipe_id],
ownerId` (snake_case keyPaths — camelCase compound indexes return 0 rows;
fixed and verified). References any `FoodItem` (seed/custom/recipe); foods
missing at calculation time are reported in `unresolved`, never zero-filled.
Ingredient rows may only attach to the pushing user's own recipe
(ownership enforced server-side).

## 5. Quantity & Yield Calculation

Phase 5 quantity engine reused verbatim (`normalizeFoodQuantity`,
`scaleFactorFor`): grams default; servings always valid (per-100 basis ⇒ 1
serving = 100 g); count only with a gram mapping; g⇄ml never converts.
Cooked yield is an explicit user-entered final weight in g|ml — raw ≠ cooked
by design (760 g yield ≠ 985 g raw inputs; no auto water-loss invention).
`validateYield` + Zod reject zero, negative, and non-finite yields;
both cooking-loss (yield < raw) and water-absorption (yield > raw) paths
are tested. Household text is display-only via `serving_description`.

## 6. Nutrition Calculation

`calculateRecipeNutrition` sums `calculateNutritionForQuantity` per resolved
ingredient at full float precision. `calculateRecipePer100g(totals,
yieldQuantity)` derives per-100 (factor = 100 / yield; null on non-positive
or non-finite yield). `servingNutrition` scales the per-100 basis to the
household serving. `materializeRecipeFoodItem` freezes per-100 values into
the Materialized `FoodItem`. Estimated flag propagates from any estimated
ingredient; sugar/sodium stay null unless carried (null = unknown, not
zero); explicit zeros (water, salt, spices) are real zeros by domain rule.
Rounding only at the display boundary (`roundNutrientsForDisplay`). Acceptance
math asserted: chicken-curry 1159.6 kcal total → 152.6 kcal/100 g → 351 kcal
at 230 g.

## 7. Snapshot Strategy

Two frozen layers: (1) recipe save freezes per-100 values into the
materialized FoodItem — later base-food edits never move it (explicit
re-save recalculates); (2) logging freezes a FoodLog snapshot — later recipe
or ingredient edits, and recipe deletion, never move it, and recipe deletion
never deletes logs. Mandatory integrity test passes: correcting chicken
165→180 kcal/100 g leaves an existing 330 kcal log frozen while new 230 g
logs compute 360 kcal. Duplicate/same-date pushes dedupe by mutationId;
cross-user writes conflict without overwriting.

## 8. Recipe Logging Flow

Recipes tab in the food sheet → tap a recipe → standard quantity + unit +
meal + live preview → Add (same modal as foods — no separate experience).
Recent logs resolve recipe items by id, so re-log is tap → quantity → Add.
Daily totals, dashboard, analytics, and heatmap consume recipes through the
single canonical `calculateDailyNutrition` rollup (no recipe-only path).
Editing a recipe does not touch prior logs; deleting a recipe removes the
materialized food from search but keeps history readable (name/macros frozen
on the log row).

## 9. Offline Behavior

Create / edit / duplicate / delete / log / search all run against IndexedDB
with no network: UI → Zustand (in-memory mirror) → owner-scoped repository
→ Dexie → outbox. Repo tests assert outbox rows are enqueued while offline.
Reload persistence via Dexie v4 (baselines V1–V3 preserved for in-place
upgrade); session bootstrap loads the recipe store alongside the rest;
settings reset clears recipes + ingredients. `writeThrough` keeps the
calorie mirror and recipe store consistent without double-enqueueing.

## 10. Sync Integration

Entities `recipe` (priority 1) and `recipeIngredient` (priority 3) added
across contracts, Zod payloads, push apply, pull collect, tombstones,
guards, and reload maps. Push order: recipes before ingredients (referenced
rows first). Upserts by stable id — same-name recipes on two devices coexist.
Removed ingredient ids are tombstoned on edit. Recipe delete journals
tombstones for `recipe` + materialized `foodItem` and cascades ingredient
deletes server-side; clients cascade locally from the recipe tombstone.
Ingredient→own-recipe ownership enforced (conflict, no orphan attaches).
Pull-apply is idempotent; ingredients resolve foods at calc time (tolerant),
so arrival order cannot corrupt state. Cross-device test: device A creates
recipe → push → device B pulls structure + food → B logs 230 g → A pulls
exactly one log, no duplicates.

## 11. Database Changes

Prisma: added `Recipe` + `RecipeIngredient` models (+ User relations,
indexes per §3); schema validated and client regenerated
(`npx prisma generate` → Prisma Client v7.8.0). Dexie `LOCAL_DB_VERSION` 3→4:
`recipes` (`id, ownerId`) and `recipeIngredients`
(`id, [ownerId+recipe_id], ownerId`); `LOCAL_STORES_V3` baseline retained;
version(3) upgrade block present. Reset + carryover cover both new tables.
Fixed two latent compound-index/keyPath mismatches found during testing
(`favoriteFoods` `[ownerId+foodId]`→`[ownerId+food_id]`,
`recipeIngredients` `[ownerId+recipeId]`→`[ownerId+recipe_id]`); no
production code had depended on the broken favorites index. No unrelated
entities rewritten.

## 12. Files Created / Modified / Deleted

**Created:**
- `src/lib/calculations/recipes.ts` + `recipes.test.ts`
- `src/lib/validation/recipe.ts` + `recipe.test.ts`
- `src/lib/repositories/recipe-repository.ts` + `recipe-repository.test.ts`
- `src/stores/recipe-store.ts` + `recipe-store.test.ts`
- `src/components/nutrition/recipe-builder.tsx`
- `src/features/nutrition/index.ts` (barrel exports recipes calcs + types)
- `docs/ARCHITECTURE.md` §12, `docs/PHASE-6-REPORT.md`

**Modified:**
- `src/lib/types/index.ts` (`Recipe`, `RecipeIngredient`, `RecipeYieldUnit`)
- `prisma/schema.prisma` (`Recipe`, `RecipeIngredient`)
- `src/lib/db/local-schema.ts`, `src/lib/db/local-db.ts` (v4 + index fix)
- `src/lib/migration/reset.ts`, `src/lib/migration/carryover.ts`
- `src/lib/validation/index.ts` (barrel `export * from './recipe'`)
- `src/lib/sync/sync-contracts.ts`, `src/lib/validation/sync.ts`
- `src/lib/sync/server/apply-push.ts`, `src/lib/sync/server/collect-pull.ts`
- `src/lib/sync/pull-apply.ts`, `src/lib/sync/sync-controller.ts`
- `src/lib/session/session-init.ts`, `src/app/(main)/settings/page.tsx`
- `src/app/(main)/calories/page.tsx` (Recipes tab, `ChefHat`, builder mount)
- `src/lib/sync/server/apply-push.test.ts`, `collect-pull.test.ts`,
  `src/lib/sync/sync-engine.test.ts` (recipe cases)
- `src/test/fake-prisma.ts` (`recipe`/`recipeIngredient` tables)

**Deleted:** `src/dbg.test.ts` (temporary compound-index diagnostic; removed
after the index fix).

## 13. Tests Added

38 new tests (132 → **170**, all green, zero regressions) across 22 files:
- `calculations/recipes.test.ts` (15): totals, macros, fiber/sugar/sodium,
  per-100, serving, yield edges (0/−10/NaN/absorption/loss), estimated
  propagation, zero-calorie ingredients, unresolved reporting, single/many/
  empty ingredient sets, full chicken-curry acceptance math.
- `repositories/recipe-repository.test.ts` (7): atomic bundle save, edit
  ingredient tombstones, duplicate under new ids, delete-keeps-logs,
  cross-owner isolation, offline outbox enqueue, snapshot integrity
  (food-edit does not move prior logs).
- `validation/recipe.test.ts` (6): name/yield/ingredient/quantity bounds.
- `stores/recipe-store.test.ts` (5): materialize per-100 into calorie
  mirror + searchable, rejections, edit-without-id-change, duplicate,
  remove cascade, pure preview.
- `sync/server/apply-push.test.ts` (+2 recipe cases): field mapping,
  ownership conflicts, cascading delete + tombstones, invalid payload reject.
- `sync/server/collect-pull.test.ts` (+1): recipe + ingredients on full pull.
- `sync/sync-engine.test.ts` (+1): A→B recipe create + B→A recipe-log
  propagation without duplicates.

Focused runs: recipe core files 34/34; sync files 39/39; full suite 170/170.

## 14. Validation Results

All commands run on final tree:
- `npx prisma generate` — **pass** (Prisma Client v7.8.0 generated).
- `npx tsc --noEmit` — **pass** (0 errors).
- `npm run lint` — **pass** (exit 0; 0 errors, 0 warnings).
- `npm run build` — **pass** (exit 0; "Compiled successfully in 11.2s").
- `npm test` — **pass**: 22 files, **170/170 tests**, ~4–5s.

## 15. Manual Acceptance Test

No physical device lab in this environment — acceptance is by construction
plus automated coverage; a handheld run remains outstanding (recommended
pre-release). Covered exactly by tests: chicken-curry totals → per-100 →
230 g portion (1159.6 → 152.6/100 g → 351 kcal); oil-edit leaves old 330
kcal log frozen while new logs recompute; recipe delete keeps history;
offline Dal create/edit/duplicate/delete/reload maps 1:1 to tested repo
paths; cross-device recipe + log propagation. The only unverified-by-hand
layer is visual/tap interaction with the builder modal and Recipes tab —
logic, state, persistence, and sync behind those taps are all tested.

## 16. Preserved Features

Confirmed unchanged and green (prior 132 tests still pass unmodified):
Dashboard (daily score, remaining calories, heatmap, streaks — recipe logs
flow through the existing FoodLog rollups), Food page (search/recent/saved/
manual/edit/duplicate), Workouts, Metrics, Habits, Monthly heatmap, Daily
score, Streaks, Analytics, PWA shell (service worker, offline page, install),
IndexedDB local-first persistence, outbox sync + conflict resolution,
Clerk auth, free-tier constraints. No recipe-only nutrition path was
introduced; everything composes on the Phase 5 canonical rollup.

## 17. Remaining Issues

- Device acceptance run outstanding (see §15) — UI taps not hand-verified.
- Recipe rows appear in generic food search mixed with single foods
  (acceptable; category filter is a small future tweak, not a defect).
- Serving-based logging uses the per-100 basis (1 serving = 100 g); the
  household serving (e.g. 190 g) is a display hint + prefilled-quantity UX
  opportunity, not yet a one-tap path.
- No recipe sharing/import/export; `source: 'imported'` reserved.
- No formal recipe versioning (deliberate: frozen snapshots cover history).

## 18. Phase 7 Readiness

Recipe structure is AI-ready by shape: a future system only needs to emit
candidate ingredients/recipes (name + food refs + quantities + unit + cooked
yield); the deterministic engine, Zod validation, and sync pipeline already
consume exactly that contract. Nutrition math stays server/client
deterministic — AI proposes, the engine calculates. No model changes
required for Phase 7; `source: 'recipe'` and `is_estimated` already carry
provenance. Free-tier limits, offline-first, and cross-user isolation
patterns are established and reusable.
