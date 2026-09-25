# FuelUp — Phase 10.5 Report (Daily-Use Completion + Data Safety)

## 1. Missing Functionality Identified

Export existed as an unversioned debug dump (no import path); `rateChanged`
explanations never fired (no rate history); the dashboard FAB covered only
Log Food / Start Workout / Log Weight; Recent/recipe rows had no repeat
path (only silent one-tap `duplicateFoodLog`); and a real audit find:
`where('ownerId')` silently matches nothing on compound-only tables, so
Settings Reset and device→user carryover skipped food logs, habit logs,
and outbox rows.

## 2. Backup Architecture

`src/lib/backup/backup.ts` + `src/lib/validation/backup.ts`. Export reads
raw Dexie rows per owner, strips identity, self-validates, and downloads
locally. Import parses → previews → confirms → replaces inside one Dexie
transaction. No server, no AI, no new storage or sync systems. Shared
`whereOwner`/`whereOwnerKeys` helpers (repositories/base) fix the
compound-index blind spot in backup, reset, and carryover alike.

## 3. Backup Format

`{format: 'fuelup-backup', version: 1, exportedAt, appVersion, data: {
profile, foodItems, foodLogs, favoriteFoods, recipes, recipeIngredients,
exercises, workouts, workoutExercises, exerciseSets, bodyMetrics, habits,
habitLogs, targetHistory, weeklyPlan}}`. Raw facts only — no derived
charts, trends, or cached TDEE. `BACKUP_FORMAT_VERSION` centralized;
future versions reject cleanly with a migration path to add. No Clerk
secrets, tokens, keys, caches, or internal secrets (asserted by test).

## 4. Export Flow

Settings → Data & Privacy → Backup & Restore → Export → versioned
`fuelup-backup-YYYY-MM-DD.json` download. Local-only (Blob + anchor;
revoked after). Records last-export metadata locally. Exported seeds are
impossible by construction (only DB customs are read).

## 5. Import Flow

File picker (.json) → 10 MB cap → JSON parse → envelope check → version
check → per-entity Zod → preview (export date, version, per-collection
counts) → Cancel/Restore → staged progress (real per-table stages) →
store reload → done. Malformed/oversized/foreign files rejected with
plain messages; nothing writes until validation passes.

## 6. Ownership Handling

Backup rows carry no identity (stripped on export). Restore re-attaches
every row to the current Clerk-derived owner (`ownerId` always;
`user_id` where the domain type carries it). Stable ids preserved for
relationships (ingredient→recipe, set→exercise→workout, log→habit) and
dedupe. Same-id rows owned by someone else are skipped + reported —
never clobbered, never merged.

## 7. Restore Safety

Replace-local-data only (merge deferred as specified — deterministic and
documented). Dependency-safe table order; single transaction (validate
first, then clear + chunked bulk-put; chunking uses Dexie awaits only —
a `setTimeout` yield would auto-commit and break atomicity, documented
in code). Failed restores leave current data intact (tested). Duplicate
restores dedupe by stable id (tested). No silent overwrites.

## 8. Outbox/Sync Handling

Restore clears the owner's outbox in the same transaction (stale
pre-restore mutations can never overwrite restored data —tested) and
deliberately KEEPS the sync cursor: restore is local-only; normal
incremental sync resumes afterward (tested). Restored rows are not
re-pushed; future local edits sync normally. No cloud-overwrite semantics
invented.

## 9. Target History Fix

`TargetHistory` gains nullable `previous/new_rate_kg_per_week` across
type, Prisma, sync validation, server apply, and client pull-apply. The
deriver compares the latest rated entry against the effective rate so
`rateChanged` explanations fire; settings rate edits append
`target_rate_changed` events (old → new, e.g. 0.5 → 0.4 kg/week) via
`energy-store.recordRateChange`, with identical resubmits ignored.
Manual calorie edits still pause adaptation with history intact
(unchanged, tested).

## 10. Daily-Use Improvements

FAB: Repeat Last (latest log → prefill intent → food modal) and Log Water
(existing Water habit +1, habits page fallback). Recent rows + recipe rows
(stale-log aware): Repeat buttons prefill food + last quantity/unit/meal.
Review-before-Add mandatory everywhere — intents never log alone; snapshot
rules unchanged. No dashboard redesign, no new persistence (water reuses
habits; complete-habit deferred as it needs selection UI).

## 11. Mobile UX Changes

None structural: 44px+ Repeat targets, existing sheet/modal patterns,
real (non-faked) restore progress, full labels/alerts carried over.
Checklist extended with export/import/quick-action/rate rows (NOT TESTED).

## 12. Tests Added

Backup suite (15: collections/version/identity strip, secrets scan, empty
export, filename/preview, invalid-JSON/format/version/entity/oversize,
full round-trip with relationships, cross-owner remap, foreign-id
no-clobber, outbox-clear + cursor-keep, idempotent re-restore,
validation-failure intactness, snapshot + rate-history preservation,
heatmap reconstruction). Reset/carryover/whereOwner (4: compound-table
clear, namespace isolation, carryover copy, helper). Energy rates (4
derive + 3 store: change detection, quiet-match, legacy nulls, manual
pause intact, entry shape, resubmit dedupe, default formatting). Quick
actions (2 store repeat + 2 habit water). Sync (apply-push rate mapping;
engine convergence carries a rate entry A→B with assertions both ends).

## 13. Validation

- `npx prisma generate` — pass (Client regenerated with rate columns).
- `npx prisma validate` — pass.
- `npx tsc --noEmit` — pass (0 errors).
- `npm run lint` — pass (0 errors, 0 warnings).
- `npm test` — 53 files, 392/392 passed (362 prior + 30 new, zero regressions).
- `npm run build` — pass.
- `npm audit` — unchanged from Phase 10 (18 dev-only/breaking-gated).

## 14. Manual QA

No device lab: export/import exercised via automated round-trips (seed →
export → wipe → restore → verify dashboard inputs: logs, recipes,
workouts, metrics, habits, heatmap math, target history) plus UI
code-review. Manual acceptance script (§46) and device runs remain
outstanding — nothing marked PASS.

## 15. Heatmap/Analytics Verification

Restored habit logs reproduce completion math (`calculateCompletionRate`
on restored rows, tested); food/recipe/analytics engines untouched;
heatmap meaning unchanged. Snapshot test: restored 150 kcal log stays
150 kcal; rate-bearing history entry byte-identical.

## 16. Files Created/Modified/Deleted

Created: `lib/backup/{backup,backup.test}.ts`,
`lib/validation/backup.ts`, `lib/migration/reset.test.ts`,
`stores/{energy-store,habit-store}.test.ts`,
`components/data/backup-panel.tsx`, `docs/PHASE-10.5-REPORT.md`.
Modified: `types` + `schema.prisma` + `validation/sync` + `apply-push` +
`pull-apply` (rate fields), `repositories/base` (helpers), `reset.ts` +
`carryover.ts` (index-agnostic fix), `analytics.ts` (rateChanged),
`energy-store.ts` (recordRateChange), `settings/page.tsx` (rate hook,
backup panel, safety copy), `calorie-store.ts` (repeat intent + helper),
`calories/page.tsx` (modal repeat + row buttons), `dashboard/page.tsx`
(FAB actions), `habit-store.ts` (findWaterHabit), `diagnostics-card.tsx`
(backup/DB/outbox/cursor rows), `ARCHITECTURE.md` (§17),
`MOBILE-QA-CHECKLIST.md` (10.5 rows), `apply-push.test.ts`,
`sync-engine.test.ts`, `adaptive-energy.test.ts`,
`calorie-store.test.ts`, existing backup-adjacent fixtures. Deleted: none
(scratch debug file removed during work).

## 17. Dependencies Changed

None.

## 18. Remaining Issues

- Real-device QA outstanding (checklist extended, all NOT TESTED).
- Merge-restore deferred (replace-only documented).
- Restored rows are not re-pushed (local-only restore documented).
- CSP, dev-only audit items, low-end perf: unchanged from Phase 10.
- Camera `video.play()` frozen-frame edge: unchanged.

## 19. Phase 11 Readiness

V1 data-safety loop closed (export → reset → restore verified
automatically); rate history consistent end-to-end incl. sync; daily
friction reduced without new systems. Architecture stable (Dexie v5, same
sync, same engines). Recommended prerequisite unchanged: complete the
mobile gate before release; Phase 11 feature work has no new blockers.
