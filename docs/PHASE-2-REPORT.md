# FuelUp — Phase 2 Report (Local-First Data Layer)

## 1. Architecture Before

UI → six Zustand `persist` stores → localStorage (versioned keys). A
validated, Clerk-authorized Prisma API existed but was never called; owner
identity was `user_id: ''` + `user@fuelup.app` placeholders.

## 2. Storage Before

Six localStorage payloads (`fuelup-profile/calories/exercise/metrics/habits/
workout-planner`), unscoped, single-user, synchronous. Server DB unreachable
from the client; refresh survived, but users, devices, and offline writes had
no namespace or transaction story.

## 3. Changes Made

- **IndexedDB foundation**: Dexie `FuelUpLocalDB v1` (`src/lib/db/local-db.ts`,
  schema/version single-sourced in `local-schema.ts`, rows in
  `local-entities.ts` = domain shape + `ownerId`). Client-only; never imported
  by API/services (verified by import audit).
- **Repositories** (`src/lib/repositories/`): `base.ts` (`repoContext` owner
  assertion, `repoError` → user-safe `AppError`, `omitOwner`/`withoutKeys`),
  plus `profile/metrics/habit/workout/nutrition-repository.ts` with
  domain-oriented methods (same-day metric upsert, habit-log upsert,
  transactional workout-graph save, cascade habit delete, date-bounded range
  queries on compound indexes).
- **Session/identity**: `GET /api/me` (session → upsert FuelUp user → `{id}`),
  `src/lib/session/{owner,session-store,session-init}.ts`,
  `<LocalSessionBootstrap/>` mounted in the root layout. Signed-in owners use
  the FuelUp user id; offline/signed-out use `local:<device-uuid>`.
- **Migration** (`src/lib/migration/`): `legacy-migration.ts` (six keys →
  owner namespace, seeds skipped, upsert-by-id reruns, markers in `meta`,
  legacy keys never deleted, malformed payloads skipped+logged),
  `carryover.ts` (device → user merge-by-id, once), `reset.ts` (explicit user
  reset clears owner namespace + legacy keys).
- **Stores**: all six keep identical action/selector APIs (zero page changes)
  and now: hold `ownerId/ready/lastError`, expose `load(ownerId)`, update
  memory synchronously and write through to repositories in the background.
  `persist` remains only for the onboarding flag (profile) and the
  in-progress workout draft (exercise) — both pure UI state.
- **Settings reset** updated for the new world (clears owner namespace +
  legacy keys + in-memory state, restores planner defaults).
- **Tests + `npm test`** (vitest, 7 files / 29 tests).

## 4. IndexedDB Schema

`FuelUpLocalDB v1` — `profiles` (PK owner), `foodItems` (id, owner),
`foodLogs` (id, `[owner+date]`, `[owner+date+meal_type]`), `exercises`,
`workouts` (`[owner+date]`), `workoutExercises` (`workout_id`),
`exerciseSets` (`workout_exercise_id`), `bodyMetrics` (`[owner+date]`),
`habits`, `habitLogs` (`[owner+habit_id+date]`, `[owner+date]`),
`weeklyPlans` (PK owner: routine + PRs), `meta` (markers). Date convention:
`date` = local `YYYY-MM-DD` (grouping), `created_at` ISO (audit). No tables
for water/sleep/activity/summaries by design (habits / profile / derived).

## 5. Repository Implementations

See §3. Every method takes `ownerId` first; empty ids throw `AppError`
(`SESSION_NOT_READY`); cross-owner reads return empty and writes no-op by
construction (row ownership checked before update/delete). Dexie failures map
to `saveFailed/loadFailed/deleteFailed` user messages; technical details go
to the structured logger. No UI component imports Dexie.

## 6. Zustand Changes

Priority order followed (metrics → habits → workouts → nutrition → profile,
planner with workouts). Pages required **zero** edits: same names, same sync
signatures (writes stay optimistic; persistence is background write-through).
`getDailySummary`, streaks, completion rates, heatmap selectors all read the
in-memory mirror, now hydrated from IndexedDB at boot.

## 7. localStorage Migration

Covered in §3 + `legacy-migration.test.ts` (migrates 6 keys, skips seeds,
rerun is a no-op, legacy keys preserved, garbage payloads don't crash). The
active-workout draft intentionally stays in its legacy `persist` slot as UI
state.

## 8. Authentication/User Scoping

Clerk user → `GET /api/me` → FuelUp `users.id` → `ownerId`. Email is never an
identity key (onboarding falls back to `''`). Device namespace is clearly
marked and never sent to the server. Tests assert cross-owner isolation for
every domain (read/update/delete).

## 9. Offline Behavior

Saves never touch the network: store → repository → IndexedDB transaction.
Owner resolution degrades to the device namespace when `/api/me` is
unreachable (8s timeout). Verified by suite + code path (no fetch in any
write path). Service worker still deferred — offline means "data operations
while the page is loaded", not offline shell.

## 10. Tests Added

- `calculations/habits.test.ts` (9): 7/30-day windows, zero/100%/partial,
  out-of-range exclusion, streak rules.
- `metrics-repository.test.ts` (6): save/retrieve, same-day upsert, scoping,
  range queries, cross-owner update/delete no-ops, empty-owner rejection.
- `habit-repository.test.ts` (4), `workout-repository.test.ts` (4),
  `nutrition-repository.test.ts` (3), `profile-repository.test.ts` (1):
  CRUD, graph rehydration, cascade, repeated-event allowance, scoping.
- `legacy-migration.test.ts` (2): full migration + idempotency +
  non-destructiveness; malformed payloads.
- Harness: `src/test/idb-harness.ts` (fake-indexeddb, isolated DB per file).

## 11. Validation Results

- `npx prisma generate` — pass (schema unchanged this phase).
- `npx tsc --noEmit` — pass, 0 errors.
- `npm run lint` — pass, 0 errors, 0 warnings.
- `npm run build` — pass, all 17 routes (incl. new `/api/me`).
- `npm test` — 7 files / 29 tests passed.

## 12. Preserved Features

Confirmed intact (no page/component edits except settings reset + layout
bootstrap mount): **dashboard preserved**, **nutrition/food logging
preserved**, **workouts + sets + planner + PRs preserved**, **metrics +
weight charts preserved**, **habits + monthly heatmap + daily score +
completion % + streaks preserved**, **analytics preserved**, **responsive
shell + onboarding preserved**. Same-day metric replace, habit toggle, food
search/recent, active-workout timer flows unchanged.

## 13. Remaining Limitations

- No service worker/offline shell; no outbox/sync/conflict resolution
  (architecture ready, see §14).
- Store `lastError` is recorded + logged but not yet surfaced in UI chrome
  (deliberate: no UI redesign in this phase).
- Stores hydrate async at boot; first paint may show empty state briefly on
  cold start (same as Phase 1 first-run).
- No dev seed mechanism added (static catalogs suffice; revisit if needed).
- `README.md` still stock template.

## 14. Phase 3 Readiness

Ready for the sync layer: every mutation already flows through an
owner-scoped repository with stable ids and date conventions; API contracts
(`metrics/meals/habits` + Zod) match repository shapes (mapping table:
`s/src/lib/mappers` + per-repo field parity); `meta` table is the natural
home for outbox cursors; `requireDbUser` + `/api/me` give the server the same
owner key the client uses. Phase 3 work reduces to: outbox table + retry +
push/pull against existing endpoints — no UI or store-API rewrites needed.
