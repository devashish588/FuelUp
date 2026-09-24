# FuelUp — Phase 10 Report (Mobile Hardening + Production Release QA)

## 1. Audit Scope

Full production audit, code-read (no device lab): PWA shell (manifest,
icons, SW, install, update lifecycle), camera lifecycle/memory/errors,
image pipeline, IndexedDB init, sync engine (locks, triggers, failure
UX), Clerk boundaries (all routes), API resilience, AI endpoints, env
config, security headers, logging, mobile viewport/touch/safe-area/
keyboard/a11y/motion, workout/nutrition wording + validation, heatmap +
analytics correctness, export/reset, dependencies. Automated: 21 new
tests; manual: `docs/MOBILE-QA-CHECKLIST.md` (all NOT TESTED — no device).

## 2. Mobile Findings

- Update banner was `lg:hidden`: desktop users never prompted (fixed).
- 16 numeric inputs lacked `inputMode` (fixed: decimal/numeric).
- No `prefers-reduced-motion` support despite infinite animations (fixed).
- Tap highlight flash on dark UI (fixed).
- Bottom nav already 48px targets + safe-area padding (verified, unchanged).
- Viewport already zoom-safe, `viewportFit=cover` (verified via guard test).
- Settings goal/activity labels could render blank on unknown enum values (fixed with fallbacks).

## 3. PWA Findings

- SW verified: no skipWaiting on install, user-controlled reload, no API/
  Clerk/RSC caching (code-read + existing sw-guard tests), offline page
  prerendered + precached, icons present at manifest sizes (artifacts test).
- Fix: `controllerchange` listener leaked on unmount (removed in cleanup).
- Fix: banner now shows on desktop (bottom-right card).
- Headers already include SW `max-age=0, must-revalidate`; CSP deliberately
  deferred + documented (Clerk/Next inline scripts).

## 4. Camera Findings

- No `visibilitychange` handling: hidden tabs kept the camera on (fixed —
  stream stops, state resets to idle; re-open is explicit, no re-prompt).
- All getUserMedia failures mapped to one "denied" state (fixed —
  `cameraErrorMessage()` distinguishes busy/no-camera/insecure-context,
  always offering upload; tested).
- Double-tap start race could orphan a stream (fixed — starting guard).
- Unmount during pending permission leaked the granted stream (fixed —
  mounted guard releases immediately).
- Transparent PNGs flattened to black JPEG (fixed — white base in both
  capture and compress paths; better for label OCR).
- Missing `createImageBitmap` threw a raw TypeError (fixed — user-safe
  rejection, tested in node).
- Blob-URL revocation already correct in both scan panels (verified).

## 5. Offline Findings

- Offline shell, local-first writes, and sync triggers verified by
  code-read + existing engine tests. Camera screens work offline up to
  Analyze (by design; nothing queued). AI unavailability never blocks
  manual logging (existing fallback UI + tests). No network requirements
  introduced.

## 6. Sync Findings

- Exclusive lock (`navigator.locks` + memory fallback) serializes runs
  incl. multi-tab; push-then-pull ordering preserved (verified, unchanged).
- `SyncStatusCard` already distinguishes saved-locally vs synchronized
  (Offline/pending/error states + counts + manual sync; verified).
- No duplicate-mutation or cursor-corruption paths found; idempotency
  covered by existing outbox/engine tests.

## 7. Authentication Findings

- All API routes resolve identity via `requireDbUser`/`getCurrentDbUser`
  (22 references; zero routes without); no route trusts body userId/
  ownerId/email (verified by scan). Cross-user isolation covered by
  repository + engine tests. No changes needed.

## 8. Security Findings

- `npm audit`: 22 → 18 findings after a justified minor bump
  (next 16.2.4 → 16.3.6, full suite green). Remaining 18 are dev-only
  (babel/postcss/vitest/prisma-CLI/hono/valibot) requiring breaking
  majors (prisma 6, vitest 5) — deferred with justification; sharp chain
  resolved; `next/image` unused so the image-optimizer path is
  unreachable. No secrets committed; AI keys server-only (existing
  tests); SW caches no private data (guard tests).
- CSP remains deferred (documented: Clerk + Next inline scripts).

## 9. Accessibility Findings

- Labeled inputs, `aria-live` regions, `role="alert"`, dialog close
  controls verified across AI/camera/label/review flows (existing).
- Added: `aria-label`s on workout set weight/reps inputs (were
  placeholder-only).
- Added: `prefers-reduced-motion` kill-switch for all CSS animations.

## 10. Performance Findings

- Image budget enforced (1280px/JPEG-0.82/~500 KB client, ~750 KB server
  cap; pure-math tests + guards). No new network calls on dashboard
  paths; sync debounced + backoffed (existing). No blocking work added.
  Low-end simulation not possible here — documented as device-QA item.

## 11. Fixes Made

Camera: visibility stop, error-name mapping, start/mount guards,
white-fill canvas, bitmap-API guard. PWA: desktop banner, listener
cleanup. CSS: reduced-motion, tap highlight. Inputs: 16× inputMode +
min attributes, workout negative clamp. Settings: export += foods,
favorites, recipes, ingredients; enum label fallbacks. New:
DiagnosticsCard (Settings → App) + `APP_VERSION` pinned to package.json
by test. Deps: next 16.3.6.

## 12. Tests Added

21 new (341 → 362, all green): diagnostics helpers (4), APP_VERSION pin
(1), camera error mapping (3), compressImage env guard (1), heatmap
boundaries — month/year-crossing streaks, leap-day + month windows,
series zeros/duplicates (6), static release guards — viewport zoom,
reduced motion, tap highlight, desktop banner, nav targets, inputModes
(5), workout finish idempotency (2).

## 13. Automated Validation

- `npx prisma generate` — pass (Client v7.8.0).
- `npx prisma validate` — pass.
- `npx tsc --noEmit` — pass (0 errors).
- `npm run lint` — pass (0 errors, 0 warnings).
- `npm test` — 49 files, 362/362 passed.
- `npm run build` — pass ("Compiled successfully").
- `npm audit` — 18 remaining, all dev-only/breaking-gated (see §8).

## 14. Real Device Validation

Android: all NOT TESTED. iOS: all NOT TESTED. No physical device lab in
this environment; nothing is marked PASS. See `docs/MOBILE-QA-CHECKLIST.md`.

## 15. Heatmap/Analytics Regression

Habit math extended (not altered): month/year-crossing streaks, leap-day
windows, series edge cases — all green alongside existing completion/
streak tests. Analytics, adaptive energy, and nutrition suites untouched
and green. No visualization changes.

## 16. Data Export/Reset

Export now covers profile, foods, favorites, food logs, recipes +
ingredients, metrics, workouts, habits + logs, target history (added the
four missing collections; no secrets ever included). Reset clears the
owner IndexedDB namespace + in-memory stores incl. energy (verified by
code-read; destructive path covered by manual QA item).

## 17. Files Created/Modified/Deleted

Created: `docs/MOBILE-QA-CHECKLIST.md`, `docs/PHASE-10-REPORT.md`,
`src/lib/pwa/diagnostics.ts` (+test), `src/components/pwa/diagnostics-card.tsx`,
`src/config/app.test.ts`, `src/components/nutrition/camera-capture.test.ts`,
`src/lib/pwa/release-guards.test.ts`, `src/stores/exercise-store.test.ts`.
Modified: camera-capture.tsx, image-client.ts, pwa-update-banner.tsx,
sw-register.tsx, globals.css, calories/exercise/metrics pages,
ai-review-panel labels, settings page, config/app.ts, habits.test.ts,
image-client.test.ts, package.json + lock (next 16.3.6). Deleted: none.

## 18. Dependencies Changed

- `next` 16.2.4 → 16.3.6 (exact pin kept; minor bump for sharp
  high-severity chain; full suite + build green). Nothing else touched;
  remaining audit items deferred for breaking majors.

## 19. Remaining Issues

- Real-device QA outstanding (release-blocking; checklist ready).
- Low-end performance simulation outstanding (no harness here).
- CSP deferred (documented justification).
- 18 dev-only audit findings deferred (breaking majors required).
- Camera `video.play()` failure still degrades to a frozen frame (accepted;
  capture validates dimensions before use).

## 20. Release Readiness

**Staging Ready, NOT Release Ready.** Automated, build, security
(no production-reachable criticals), PWA, and data gates pass; the
mobile real-device gate is untested, which blocks a release declaration
per the gate rules. Diagnostics card + checklist are in place to make
that run efficient.

## 21. Phase 11 Readiness

The product surface is frozen and hardened; architecture unchanged
(local-first, Dexie v5, outbox sync, deterministic engines + AI
proposals). Any Phase 11 feature work starts from 362 green tests, a
versioned release process (APP_VERSION pin), and a device-QA harness.
Recommended prerequisite: complete the mobile gate first.
