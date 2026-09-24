# FuelUp — Phase 4 Report (Production PWA Shell + Offline Experience)

## 1. Architecture Before

Phase 3 complete: local-first Dexie data + outbox + idempotent push/pull +
cursors + tombstones + Clerk ownership + 68 tests. PWA state: a
hand-maintained `public/manifest.webmanifest` (SVG-only icons — not
installable), no service worker, no install UX, no offline fallback, no
security headers, no safe-area utilities.

## 2. PWA Architecture After

Browser → Next.js → manifest (`app/manifest.ts`) + vanilla `public/sw.js`
(shell/static caches; API/auth network-only) + IndexedDB (domain data,
unchanged) + existing sync engine (+ Background Sync relay). Registration,
update banner, and install card are additive client components; no route,
store, repository, or sync logic was rewritten.

## 3. Manifest

Single source `src/app/manifest.ts` (Next serves `/manifest.webmanifest`;
verified in build output: correct JSON with 192/512/maskable icons).
Old `public/manifest.webmanifest` deleted — no competing manifests. Root
layout keeps the explicit link + adds PNG icon set + Apple touch icon,
`appleWebApp` standalone, `viewportFit: cover`, no `maximumScale`.

## 4. Service Worker

`public/sw.js` (vanilla, zero deps): install precaches `/offline` + icons +
manifest (never rejects); activate deletes only `fuelup-*` caches (never
IDB); fetch: CacheFirst for `/_next/static` + icons/images/fonts,
NetworkFirst-5s for navigations → cached shell → `/offline`, NetworkOnly for
`/api/*`, `?_rsc=`, auth, Clerk, non-GET. Registration (`sw-register.tsx`):
browser-only, once, failure-safe. Lifecycle: no auto-`skipWaiting`; waiting
→ banner → user Reload → `SKIP_WAITING` → `controllerchange` reload.
`CACHE_VERSION` single-sourced in sw.js, independent of IDB v2.

## 5. Cache Policy

Cached: precache list, hashed static chunks, icons/images/fonts, last-seen
navigation shells (LRU 25). Network-only: all API (incl. sync), RSC flight,
sign-in/up, Clerk, non-GET. Offline fallback: branded `/offline`
(`force-static`, Continue/Try-again). Cache Storage holds zero private data
(enforced by `sw-guard.test.ts`).

## 6. Offline Behavior

Online-first-visit caches shell; offline reopen serves last shell (data from
IndexedDB via unchanged Zustand flow) or `/offline` with retry. Logging
food/weight/habits/sets, heatmap, analytics all work offline (no network in
write paths); outbox queues; existing triggers + Background Sync relay resume
sync on reconnect. Active-workout draft survives reloads/updates (persisted
UI state; SW never touches storage).

## 7. Install Experience

Settings → App → `InstallCard`: Chromium shows Install (captured prompt, user
gesture; no auto-modal); iOS shows Share → Add-to-Home-Screen steps;
installed shows status. `useIsInstalledPWA()` (display-mode + `standalone`).
No install code runs before user value (Settings placement).

## 8. Sync Integration

No sync logic duplicated: SW `sync` event only posts `FUELUP_SYNC_NOW` to
clients; the page's existing `syncNow()` runs (listener in `sw-register`);
tags registered best-effort in triggers after mutations. Unsupported browsers
silently skip everything. Status UI reuses `useSyncStore` exclusively.

## 9. Security

No API/Clerk/RSC/tokens in caches (tested); SW has no imports, no secrets, no
storage access; headers: nosniff, strict-origin-when-cross-origin,
SAMEORIGIN framing, `/sw.js` no-cache, icons immutable; no CSP (documented:
Clerk + Next inline scripts). Ownership model untouched.

## 10. Mobile UX Changes

Safe-area `@utility` classes + header inset, mobile-only bottom-sheet
padding (calories/exercise/metrics), banner clears nav + home indicator
(bottom nav already inset; FAB/modals audited). No redesign, no nav changes.

## 11. Files Created/Modified/Deleted

- Created: `app/manifest.ts`, `app/offline/page.tsx`, `public/sw.js`,
  `public/icons/*` (4 PNGs), `scripts/generate-pwa-icons.mjs`,
  `config/pwa.ts`, `lib/pwa/{pwa-store,install,use-is-installed-pwa}.ts`,
  `components/pwa/{sw-register,pwa-update-banner,install-card}.tsx`,
  3 test files, this report.
- Modified: `app/layout.tsx` (icons, mounts), `globals.css` (safe-area),
  `components/layout/header.tsx`, 3 bottom sheets, `settings/page.tsx`
  (App section), `next.config.ts` (headers), `sync-triggers.ts` (BG-sync
  tag), `eslint.config.mjs` (plain-JS ignores), `ARCHITECTURE.md`.
- Deleted: `public/manifest.webmanifest` (migrated, not duplicated).

## 12. Dependencies Changed

None added. Serwist evaluated and deliberately rejected (Next 16
Turbopack-default vs webpack plugin; 16MB for static caching). Icons via
Node built-ins. `npm install` not run.

## 13. Tests Added

17 new (85 total): install platform matrix (8), SW guards (6: versioning,
storage/auth absence, network-only categories, precache/cleanup, BG-sync
purity, controlled updates), artifacts (4: PNG sizes, single manifest,
version independence).

## 14. Validation Results

- `npx prisma generate` — pass (schema untouched).
- `npx tsc --noEmit` — pass, 0 errors.
- `npm run lint` — pass, 0 errors, 0 warnings.
- `npm run build` — pass; routes include `/manifest.webmanifest` (verified
  JSON) and `/offline` (prerendered); `/api/sync/*` intact.
- `npm test` — 14 files, 85/85 passed (68 prior + 17 new).

## 15. Browser Testing

Not performed on physical devices in this environment (no mobile lab):
Desktop Chrome/Android install flows, iOS Add-to-Home-Screen, and the §28
offline acceptance run (online tour → offline kill → home-screen reopen →
offline logging → reconnect → no-dupe sync) must be executed on real
hardware before release. Automated guards + build-artifact verification
(manifest JSON, prerendered `/offline`, icons, headers config) are done;
unit tests cover install branching and SW policy.

## 16. Preserved Features

Confirmed (page/component logic untouched; only additive mounts + safe-area
padding): dashboard, food, workouts, metrics, habits, monthly heatmap, daily
score, streaks, analytics, sync engine + outbox + triggers, responsive
navigation. All 68 prior tests pass unmodified.

## 17. Remaining Issues

- Real-device install/offline/update testing outstanding (see §15).
- No `beforeinstallprompt` desktop-Chrome end-to-end verification here.
- Update banner is mobile-only placement (`lg:hidden`) — desktop shows no
  prompt (acceptable: desktop updates apply on next load silently).
- No push-notification plumbing (deferred by design).

## 18. Phase 5 Readiness

PWA foundation is done and additive: installable manifest + icons, offline
shell with guarded caches, controlled updates, install UX, safe-area mobile
treatment, security headers. Phase 5 (product features or PWA polish like
push) inherits working offline-first sync and needs no architectural
rework — only real-device acceptance remains as a release gate.
