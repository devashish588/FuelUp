# FuelUp — Phase 3 Report (Cloud Sync + Reconciliation)

## 1. Architecture Before

UI → Zustand (in-memory mirror) → owner-scoped Dexie repositories →
`FuelUpLocalDB v1`. Validated Clerk/Prisma API existed; `/api/me` supplied
the owner id. No network writes; device-local namespaces offline-capable.

## 2. Architecture After

Same local path, plus: every repository mutation enqueues an outbox event;
`syncNow()` pushes batches to `POST /api/sync/push` and pulls deltas from
`GET /api/sync/pull`, applying them transactionally with the cursor and
reloading only changed stores. Status (`synced/syncing/offline/pending/
error`) lives in `useSyncStore`, surfaced by a small Settings card.

## 3. Sync Architecture

Write path: validate (client) → IndexedDB tx → memory update → outbox row
(snapshot payload, stable mutation id) → UI returns. Sync path (independent):
claim due events → push ≤50 → per-event acks → pull loop (≤10 pages) →
single-Dexie-tx apply + cursor → selective store reload. Device-local owners
skip sync entirely; overlapping runs serialize via `navigator.locks` (memory
fallback). Triggers: boot, mutation debounce (3s), `online`, refocus (60s
throttle), backoff wake-ups, manual.

## 4. IndexedDB Changes

v1 → v2 (in-place Dexie upgrade, domain data preserved): added `outbox`
(`id, [ownerId+status], [ownerId+status+nextAttemptAt]`). `meta` additionally
stores `sync:cursor:<owner>`. Reset clears outbox + cursor with the namespace.

## 5. Outbox Design

Row = `{id (=mutationId), ownerId, entity, entityId, operation
(upsert|create|delete), payload snapshot, createdAt, retryCount,
nextAttemptAt, status (pending|inflight|dead)}`. Coalescing: same
(owner,entity,entityId) pending rows merge to one `upsert` (latest payload,
original id); `delete` absorbs pending upserts. Event rows (unique ids) never
merge across ids. Enqueue never throws (local write always wins).

## 6. API Endpoints

- `POST /api/sync/push` — Clerk (`requireDbUser`), 500KB cap, Zod
  (`syncPushRequestSchema`, ≤50 events), per-event results.
- `GET /api/sync/pull?cursor=` — Clerk, Zod cursor, bounded pages (200/table)
  + tombstones + new cursor + `hasMore`.
- Unchanged: `/api/me`, `/api/metrics|meals|habits`, webhook.

## 7. Push Flow

Claim due → POST → auth → validate → owner-check every row (client ids carry
no authority) → per-event `$transaction` (apply + `ProcessedMutation`) →
`{ok|duplicate|conflict|invalid|retryable}` each. `ok/duplicate` acked;
`invalid/conflict` dropped with logs (poison can't wedge the queue);
`retryable`/network/5xx back off; 401 aborts and keeps everything pending.
Push order: items/habits before dependent logs/graphs.

## 8. Pull Flow

Cursor (last applied server `updatedAt`, `meta`) → pull → runtime-guard →
apply in ONE Dexie tx (rows + deletions + cursor). Cursor advances only on tx
success; equal-timestamp overlap is harmless (idempotent upserts). Invalid
payloads abort before any write (cursor untouched). `hasMore` loops to catch
up without full downloads.

## 9. Conflict Strategy

State rows (profile/habits/metrics/items/exercises): latest-valid-update
converges (server `updatedAt` authoritative; push runs before pull each
cycle). Event rows (food/habit logs, sets, workout graphs): merge by stable
id — Device A 09-22 + Device B 09-23 habit logs both survive (tested).
Unpushed local edits are pull-guarded (never clobbered); pending edits beat
remote deletes; deletes win over clean state. Same-date metric/log races
across devices merge into the survivor row (unique-constraint handler).

## 10. Idempotency Strategy

Three layers: (1) outbox row id = mutationId, recorded in `ProcessedMutation`
(replays → `duplicate`, no re-apply); (2) entity upserts on stable client ids
(retried creates can't duplicate); (3) same-date merges for
`@@unique([userId,date])` / `@@unique([habitId,date])` races. Seed-catalog FKs
(`food-0`, `ex-3`) resolve via shared null-owner stubs provisioned from push
snapshots — no id collisions across users.

## 11. Retry Strategy

`nextAttemptAt = now + min(5s·2^retry, 10min) + jitter`, ≤10 retries, then
`dead` (counted, surfaced, revived by manual Sync now). Due-only batching
means no tight loop; a timer wakes for the earliest due event; triggers cover
the rest. UI never blocks.

## 12. Clerk/User Ownership

Server derives `userId` from the Clerk session per request; body ownership
fields ignored. Cross-owner reads return empty; cross-owner writes/deletes
are `conflict` no-ops (tested both directions). Email never an identity key
(sync never overwrites it; Clerk/webhook owns it). Device-local data never
uploads; the Phase 2 carryover rules are untouched.

## 13. Database Changes

`updatedAt @updatedAt` added to `FoodItem`, `FoodLog`, `Workout`,
`Exercise`, `BodyMetric`, `HabitLog` (+ `[userId, updatedAt]` indexes;
`Habit`/`User` already had it; graph children sync inside the workout pull).
New: `ProcessedMutation (mutationId PK, userId, entity, entityId)` and
`SyncDeletion (userId, entity, entityId, deletedAt, mutationId unique)` (+
`[userId, deletedAt]` index). Client regenerated via `prisma generate`. No
separate sync database.

## 14. Files Created/Modified/Deleted

- Created: `lib/sync/{sync-contracts,sync-outbox-event,outbox,notify,pull-apply,sync-controller,sync-triggers,sync-store}.ts`,
  `lib/sync/server/{apply-push,collect-pull}.ts`, `app/api/sync/{push,pull}/route.ts`,
  `lib/validation/sync.ts`, `components/sync/sync-status-card.tsx`,
  `test/{fake-sync-server,fake-prisma}.ts`, 5 test files, this report.
- Modified: `prisma/schema.prisma`, `local-schema.ts` (v2), `local-db.ts`
  (v2 upgrade), 5 repositories (enqueue), `reset.ts` (outbox), `session-init`
  (triggers + initial sync), settings (Sync card), `ARCHITECTURE.md`,
  `vitest.config` + `test/setup.ts` (dummy DB URL for server imports).
- Deleted: none.

## 15. Tests Added

39 new (68 total): outbox (7: coalesce, delete-wins, ack/release, backoff→
dead→revive, reload persistence); engine (16: push/idempotent-replay/partial/
401/network-retry/initial+incremental pull/cursor-freeze-on-failure/
deletions/LWW both directions/race-guard/independent-events/A↔B devices/
lock/device-skip/badge); server push (10: scoping, replay, cross-user ×2,
invalid ×2, batch partial, date merge, tombstones, stub FKs, graph);
server pull (6: full/incremental/tombstones/isolation/truncation/cursor).

## 16. Validation Results

- `npx prisma generate` — pass (client regenerated with sync models).
- `npx tsc --noEmit` — pass, 0 errors.
- `npm run lint` — pass, 0 errors, 0 warnings.
- `npm run build` — pass (see below), 18 routes incl. `/api/sync/*`.
- `npm test` — 11 files, 68/68 passed (29 Phase 2 + 39 Phase 3).

## 17. Offline Verification

Verified by code path + tests (no live browser available here): write paths
contain zero network calls (mutation → IDB tx → memory → outbox row, all
local); `syncNow` short-circuits to `offline` when `navigator.onLine` is
false; network-throw tests prove events persist with backoff and later succeed
(`backs off on network failure…`, outbox reload test reopens the same DB and
finds the event). Full manual scenario (airplane-mode logging → reload →
reconnect → sync) is scripted in §30 of the brief and should be run once
against a real deployment.

## 18. Multi-Device Verification

Simulated with two isolated Dexie instances + shared fake server
(`simulates two devices sharing one account`): A creates habit+log → syncs →
B (empty) pulls everything → B adds its own log → syncs → A pulls it; final
sets match exactly, no duplicates. Same-date and cross-user cases covered in
server tests. A live two-browser run against staging is recommended before
release (acceptance script in brief §30).

## 19. Preserved Features

Explicitly confirmed (no page/visual edits except the additive Settings sync
card): Dashboard, Food, Workouts, Metrics, Habits, Heatmap, Daily score,
Streaks, Analytics, responsive UI — all read the same local/domain layer;
suite behavior unchanged (68/68 incl. all Phase 2 tests).

## 20. Remaining Issues

- Live two-browser + airplane-mode acceptance (§30) still needs a real run.
- `lastError` beyond sync (per-store) still log-only, no UI surface.
- Pull pages cap at 200/table/cycle with `hasMore` looping (fine for personal
  scale; revisit if catalogs grow).
- Dead-letter revival is manual-only (by design).
- `README.md` still stock template.

## 21. Phase 4 Readiness

Sync is the last data-layer milestone: local-first + reconciled + tested.
Phase 4 (PWA shell/service worker, or product features) builds on stable
ground — offline writes, identity, idempotency, and cursors already exist, so
later work is additive (e.g. background-sync API can reuse `syncNow()`).
