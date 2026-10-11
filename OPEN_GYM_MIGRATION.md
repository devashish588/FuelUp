# openGym Migration Inventory

Full-replacement migration of this project (FuelUp) to the openGym
implementation. Source of truth: `DuarteSantos8/openGym`, branch `main`.

> Status: INVENTORY ONLY. No broad changes have been made yet.
> This document must be reviewed before any replacement begins.

---

## A. Source commit SHA

- **SHA:** `1350409a7b15ff8ce5690c18b530cfba62d80f46`
- **Branch:** `main`
- **Commit date:** 2026-10-04 12:10:59 +0200
- **Commit subject:** "Website: contents always in view on the docs and API pages, v1.3.9 features, how openGym is built"
- **Version:** 1.3.9 (`frontend/package.json`, `api/package.json` agree)
- **License of source:** AGPL-3.0-or-later
- **Copyright holder:** Duarte Santos, Copyright (C) 2026

## B. Source architecture

Three deployable pieces plus a data folder:

```
browser/PWA ──HTTPS──▶ web (nginx) ──/api/*──▶ api (plain node:http)
                           │                        │
                     serves static app         reads/writes ./data
                     + /img + /gif             (JSON files)
                           ▲
              media (one-shot alpine/git: downloads ~140 MB exercise
              media from upstream on first `docker compose up`)
```

- `frontend/` — React 19 + Vite + React Router 7 + Zustand 5. Builds to
  static files. No Next.js, no Tailwind, no shadcn, no Prisma. One global
  CSS file (`src/index.css`, ~1725 lines, CSS custom properties design
  system, dark-first, iOS-like surfaces).
- `api/` — single-file-ish Node server (`server.js`, ~4000+ lines, no
  framework, plain `node:http`). Two runtime deps: `@simplewebauthn/server`
  (passkeys), `web-push` (notifications). JSON-file storage under `DATA_DIR`.
- `web/` — multi-stage Dockerfile (builds frontend → nginx) +
  `nginx.conf.template` (serves app, proxies `/api` → api, serves shared
  media volume). Single origin, required for WebAuthn passkeys.
- Optional: `api/coach/` (AI coach, opt-in), `mcp/` (read-only MCP stdio
  bridge, not in Docker build), Capacitor shells under `frontend/android`
  + `frontend/ios`, `kubernetes/` example manifests, `website/` static
  project site (deployed separately), `scripts/` dataset builders.

Key architectural facts that forbid "forcing into Next.js/Prisma":

1. Routing is `HashRouter` (`/#/plan`, `/#/history`…), so a path is never a
   screen and deep-path serving rules differ from Next.js App Router.
2. Auth is WebAuthn passkeys bound to an exact hostname (`RP_ID`) + signed
   session cookies (HMAC, `DATA_DIR/secret`). No Clerk, no JWT store.
3. The whole per-user state is ONE JSON document with a server revision
   (`PUT /api/data` with `baseRev`, 409 + merge + retry on conflict).
4. The PWA service worker (`frontend/public/sw.js`) is hand-written with a
   build-hash cache name, separate LRU media cache, push handling.
5. Exercise media (~140 MB) is downloaded at deploy time, never committed.

## C. Frontend structure

```
frontend/
  index.html            # RTL pre-paint script, manifest, icons, /src/main.jsx
  vite.config.js        # dev proxy /api→:3000 /img /gif→:8888, swStamp plugin
                        # (build-hash into sw.js), APP_VERSION define, base './'
  package.json          # opengym-frontend 1.3.9, React 19, RR 7, Zustand 5,
                        # Capacitor 7, jsqr, lean-qr. No Tailwind/Next/shadcn.
  capacitor.config.json
  android/ ios/         # Capacitor native shells
  resources/ scripts/   # icons, fatigue-monotonic-probe script
  public/
    sw.js               # ~238 lines: shell cache + media LRU cache + push
    manifest.json, icons (icon-180/192/512, maskable), …
  src/
    main.jsx            # StrictMode root, media-sync + native-keyboard start,
                        # SW register (https only, non-mobile)
    App.jsx             # HashRouter + Shell: theme/accent prefs, lang, wakelock,
                        # scroll restore, TabBar/RestTimer/Modals/Toast/SyncBanner
    index.css           # THE design system (tokens, reset, type scale, components)
    sheets.jsx          # shared sheet builders (referenced by all views)
    views/              # one file per screen (+ many colocated *.test.jsx):
      Home.jsx  CheckIn.jsx  Plan.jsx  RoutineEdit.jsx  Workout.jsx  Stats.jsx
      History.jsx  Library.jsx  Muscles.jsx  StructuralBalance.jsx  Settings.jsx
      Admin.jsx  Login.jsx  MobileOnboarding.jsx
      CoachChat.jsx  CoachIntake.jsx  CoachSetup.jsx  AdminCoach.jsx
    components/         # shared UI:
      TabBar.jsx  Icon.jsx  ui.jsx (Button/Section/Row/Switch/…)  Modals.jsx
      Toast.jsx  SyncBanner.jsx  RestTimer.jsx  TimerFlash.jsx  Media.jsx
      WorkoutMedia.jsx  BodyMap.jsx  Heatmap.jsx  LineChart.jsx  MuscleExplorer.jsx
      Passkeys.jsx  PasswordAuth.jsx  ServerSync.jsx  CameraScan.jsx  QrCanvas.jsx
      CustomMedia( Field).jsx  NumField.jsx  Stepper.jsx  SwipeCards.jsx
      SwipeToDelete.jsx  ErrorBoundary.jsx (+ *.test.jsx beside each)
    store/
      useStore.js       # ~1533 lines: entire client state S, localStorage
                        # (gym_state_v1) + debounce-push, sync engine
                        # (pushState/pullState, 409-merge-retry, stash),
                        # guest/demo/mobile modes
      useUI.js          # ephemeral UI state (sheets, toasts, timers)
    lib/                # ~200 modules, pure helpers + colocated *.test.js.
      Domain logic lives here, never in views:
      progression.js (+progression-copy.js, extra-sets) · onerm.js ·
      finish-workout.js · recovery(.js,-view.js) · workout-model.js ·
      supersetFlow.js · session-start/noprog/routines/merge/edit.js ·
      history.js · exercise-history.js · sync-merge.js · sync-changes.js ·
      exercises.js + exercises-data.js (1-line, 1324 exercises) ·
      exercise-muscle-batch-{1,2}.js + olympic json · muscles.js ·
      body-paths.js (MuscleMap-derived SVG geometry, MIT — see NOTICE.md) ·
      api.js (fetch wrapper, time-bounded, passkey ceremonies) · remote.js ·
      guest.js · demo.js/demoSeed.js · mobile.js · capacitor-fetch.js ·
      media-{store,store-idb,store-fs,sync,owed,refs,prefetch,ingest,
             sniff,limits,backup-media}.js · push.js · qr.js · scan(-web).js ·
      import-{csv,hevy}.js + hevy-id-map.js · plan-share.js · zip.js ·
      backup-media.js · audit.js · backfill.js · bar.js · plates.js ·
      bodyweight.js · speed.js · units.js · rep-range.js · effort.js ·
      favourites.js · routines.js · starter.js (+ strength-exercises.js) ·
      warmup-seed / warmup-invariants · structuralBalance(.js,-view,
      Templates).js · coach-{api,demo,device,insights,local,secrets}.js +
      coach.js · sound.js · rest-alert.js · wakelock.js · viewport-guard.js ·
      hchips.js · back.js · nav.js · app-base.js · sha256.js · clipboard.js ·
      format.js · i18n.js + i18n-core.js · default-lang.js ·
      update.js (APK self-update) · use-sheet-keyboard.js ·
      native-keyboard.js · android-backup/system-bars · device-link.js ·
      workout-{controls,date,keys,media,text}.js · active-exercise-swap.js ·
      active-workout-order.js · session-note/rename tests · sw*.test.js …
    locales/            # ar de es fr hi hu it ko pl pt pt-BR ru th tr uk zh
                        # (+ derived de-CH). Lazy via import.meta.glob.
    exercise-names/     # translated exercise names: de es fr hu it pt-BR ru
    instr/              # translated instructions: ar es fr hi hu it ko pl
                        # pt-BR ru tr zh
```

Routes (HashRouter): `/home /checkin /plan /plan/r/:id /workout /stats
/history /library /muscles /structural-balance /settings /coach
/coach/intake /coach/setup /admin`, catch-all → `/home`. Login and mobile
onboarding render in place of routes when unauthenticated.

Tab bar: Home · Plan · Start/Resume (center action) · Stats · Exercises.

## D. API structure

```
api/
  server.js            # the whole backend: plain node:http, routes object keyed
                       # 'METHOD /path'. ~4000+ lines incl. comments.
  openapi.yaml         # hand-written OpenAPI 3.1, ~3780 lines, mirrors server.js
  device-link.js       # one-time codes for adding a passkey from another device
  media.js             # custom-exercise photo/GIF/video store (hashed, quota'd)
  passkeys-store.js    # passkey record CRUD (MAX_PASSKEYS)
  password.js          # scrypt password auth (opt-in), reset codes, e-mail login
  push-messages.js     # rest-timer + day-reminder push payload builders
  rate-limit.js        # burst window + backoff counters for password routes
  verify-error.js
  Dockerfile           # default target (no AI) + coach target (Agent SDK/Codex)
  coach/               # AI coach: config/jobs/routes/cadence/warmup/node-fetch,
                       # core/ (payload, validator, prompts, adapters, providers:
                       # anthropic/openai/gemini/compatible, claude/codex CLIs)
  scripts/             # fixture CLI etc.
  test/                # node --test suite: server-*, passkeys, password,
                       # device-link, media-*, push-*, admin-*, coach-*, … 
```

Route families (see openapi.yaml tags): `meta` (health/config) · `auth`
(register+login WebAuthn ceremonies, sessions) · `pairing` (mobile pair
create/redeem) · `password` (404 unless PASSWORD_LOGIN=1) · `passkeys`
(list/add/rename/remove, device links) · `data` (whole-state GET/PUT with
revisions, stash) · `push` (subscribe/test/rest-schedule) · `activity`
(live-workout presence heartbeat) · `admin` (users, disable, invites, audit,
workout history) · `media` (PUT/GET/DELETE hashed uploads) · `coach`
(admin-gated, optional).

Auth model: `<uid>:<expiry>:<sv>.<hmac-sha256>` in `__Host-gymsid`
(https) or `gymsid` (localhost) cookie; paired phones use the same token as
`Authorization: Bearer`. CSRF guard: Sec-Fetch-Site else Origin-vs-ORIGIN
on state-changing browser requests (ceremony/pair routes exempt, password
routes deliberately NOT exempt). Sign-in throttle on password/link routes
only; passkey ceremonies unthrottled by design.

## E. web/nginx structure

```
web/
  Dockerfile           # --platform=$BUILDPLATFORM node:22-alpine build stage
                       # (copies api/coach/core + frontend, APP_BUILD arg,
                       # npm ci --ignore-scripts, vite build) → nginx:alpine
  nginx.conf.template  # envsubst at start: NGINX_PORT BACKEND PORT RESOLVER
                       # CF_CONNECTING_IP BASE_PATH MEDIA_UPLOAD_MAX
```

Behavior: serves static app; `^~ /api/` → backend (5m body cap, per-request
DNS re-resolve, overwrites X-Forwarded-For/X-Real-IP, drops CF-Connecting-IP
by default); `^~ /api/media/` → backend with 48m cap + unbuffered streaming
+ 300s timeouts; deep paths redirect to root (hash routing); js/css/json/html
`no-cache must-revalidate`; media extensions immutable 30d; gzip; security
headers (DENY framing, nosniff, same-origin referrer, frame-ancestors none).
HEALTHCHECK on the configured port.

## F. Assets

```
assets/
  banner.png / banner.svg / social.jpg   # project branding (README/website)
  screenshots/  home.png  workout.png  stats.png
```

Exercise media is NOT in the repo (by design — disputed third-party rights,
see §N). Deploys download ~140 MB from
`github.com/hasaneyldrm/exercises-dataset` via the `media` compose service;
mobile/demo builds load it from a jsDelivr CDN at runtime. Filenames referenced
by `exercises-data.js` (`img`: `0001-2gPfomN.jpg`, `gif`: `0001-2gPfomN.gif`).

## G. Environment variables

Full contract (see `.env.example`, 258 lines; README table summarized):

| Variable | Default | Purpose |
|---|---|---|
| RP_ID / ORIGIN / RP_NAME | localhost / http://localhost:8080 / openGym | WebAuthn binding |
| WEB_PORT / NGINX_PORT / BACKEND / PORT | 8080 / 80 / api / 3000 | plumbing |
| SESSION_DAYS | 90 | cookie lifetime |
| ADMIN_UIDS / INVITE_ONLY / ALLOW_GUEST | unset / off / on | access control |
| DEFAULT_LANG | unset | instance language default |
| PASSWORD_LOGIN / TRUST_PROXY | off / 1-in-compose | password auth, throttle addr |
| AUDIT_LOG / AUDIT_MAX / AUDIT_DAYS / AUDIT_IP | on / 5000 / 90 / off | activity log |
| VAPID_SUBJECT | ORIGIN | push contact |
| DATA_DIR | /data (pinned in compose) | storage root |
| MEDIA_* (uploads/quota/image/gif/video/sec/gc/per-hour/min-free) | on/200/2/8/40/60/14d/600/512 | custom media |
| MEDIA_UPLOAD_MAX | 48m | nginx cap |
| RESOLVER / CF_CONNECTING_IP / BASE_PATH | 127.0.0.11 / empty / empty | net/subpath |
| API_TARGET (default/coach) / COACH_DISABLED / COACH_JOB_TIMEOUT_MS | default / unset / 5min | AI coach |
| VITE_* (IMG_BASE/GIF_BASE/UMAMI/DEMO/MOBILE) | unset | build-time frontend |

## H. Authentication

- Primary: **passkeys (WebAuthn)** via `@simplewebauthn/server`. Ceremonies:
  register options/verify, login options/verify; add passkey in Settings;
  device-link codes (#95) for a second device. Bound to exact `RP_ID`,
  HTTPS-only except localhost.
- Optional: **password sign-in** (`PASSWORD_LOGIN=1`): scrypt hashes,
  throttled, one-time admin reset codes, optional sign-in e-mail. All
  password routes 404 while off.
- **Guest mode** (default on, `ALLOW_GUEST=0` removes button): browser-only,
  never touches the server.
- **Mobile pairing**: short code from signed-in tab → bearer token, self-
  renewing past half-life, revoked by "sign out everywhere".
- Sessions: HMAC-signed `<uid>:<exp>:<sv>` cookies; `sv` bump = global logout.
- Admins: `ADMIN_UIDS` or `admin:true` on user record; server-enforced.

FuelUp's Clerk must be REMOVED, not adapted. Nothing in openGym speaks OIDC.

## I. Data persistence

Server (`DATA_DIR`, default `./data` bind mount — "back this up"):

| File | Contents |
|---|---|
| `db.json` | users, passkey creds, push subs, invites, device links (0600) |
| `state-<uid>.json` | one profile: plan, workouts, bodyweight, settings (sanitized uid) |
| `secret` | HMAC key (0600, generated on first boot; losing it signs everyone out) |
| `vapid.json` | push keys (0600, generated on first run) |
| `audit.log` | JSONL activity log (retention-capped) |
| `uploads/<profile>/` | custom-exercise/workout photos+videos (owner-only reads) |
| `coach.json` + `coach/` | encrypted provider creds (coach on) |

Client: `localStorage gym_state_v1` (whole state) + `gym_sync/gym_dirty/
gym_synced_at/gym_synced_fp/gym_stash/gym_logout_owed/gym_adopt` markers;
Capacitor: file mirror + secure storage + auto-backup. No IndexedDB-as-
primary, no Prisma, no Postgres. FuelUp's DB holds user/project data that
must be mapped (see §"FuelUp data" in final report, not this inventory).

## J. Sync

- One document + server revision. `PUT /api/data { state, baseRev }`;
  stale `baseRev` → 409 + current document → client merges (`sync-merge.js`,
  field-level rules incl. unit-aware + reset-stamp handling) → retry.
- Store polls rev every 30 s + on focus/visibility; pushes debounced.
- `SyncBanner` shows offline/working state; nothing unsent is discarded on
  disconnect/sign-out (stash per server+account, incl. phone file).
- Sign-in adopt flow (`gym_adopt`): guest/local entries question before sync
  (prevents a phone's 1 workout replacing the server's 12).
- Backup import asks merge-vs-replace when signed in.

## K. PWA

- Hand-written `sw.js`: build-hash shell cache (`opengym-rt-<hash>`),
  separate `opengym-media-v1` LRU cache (150 MB / 3000 items), network-first
  with 3 s cache fallback for navigations (issue #274), cache-first media,
  `/api/*` never cached, push + notificationclick + pushsubscriptionchange.
- Registered only on https + non-mobile (`main.jsx`); media prefetch only as
  installed app (`media-prefetch.js`).
- `manifest.json` + icons; installable; offline-first local state; update via
  new worker per build (old cache swept only after new shell verified in).

## L. Mobile / Capacitor

- `frontend/android` + `frontend/ios` shells, `capacitor.config.json`.
- Mobile build (`npm run build:mobile`): CDN media, `cap sync`, `MOBILE=1`.
- Local-first phone app: no account/server by default; file mirror, secure
  storage, native reminders, rest countdown in notification shade, wake lock,
  native keyboard handling, Android system bars + back-button, APK self-update
  with SHA-256 verification (Settings → check, GitLab releases source).
- "Connect to my server" pairing mode (`remote.js`, bearer auth).
- iPhone path: self-host + Safari home-screen PWA (no sideload), or Xcode build.
- Docs: `docs/MOBILE.md`.

## M. Optional services

| System | Location | Default | Migration mark |
|---|---|---|---|
| AI coach | `api/coach/` + 3 views + `lib/coach*.js` | OFF | IMPLEMENTED (code copied; stays off without provider + admin enable) |
| MCP server | `mcp/` (stdio, read-only) | not in Docker | IMPLEMENTED (copied; runs only when an LLM client spawns it) |
| Capacitor app | `frontend/android ios` | build-time opt | IMPLEMENTED (shells copied; APK build needs Android SDK — validated by presence, not by local APK build) |
| Kubernetes | `kubernetes/` + SELF_HOSTING_KUBERNETES.md | example only | IMPLEMENTED (manifests copied verbatim) |
| Admin dashboard | `views/Admin.jsx` + `/api/admin/*` | on (gated) | IMPLEMENTED |
| website/ | static project site | separate deploy | DEFERRED (marketing site, not the app; copy only if wanted) |

## N. License requirements

- openGym's own code: **GNU AGPL v3.0** (`LICENSE`, 661 lines). Copyright (C)
  2026 Duarte Santos. `package.json` license fields: `AGPL-3.0-or-later`.
- `NOTICE.md` (181 lines, MUST be preserved): app-store exception (§7
  additional permission for Apple/Google stores); MuscleMap MIT (body-paths);
  ExerciseDB-via-dataset MIT (metadata + EN instructions; non-EN translations
  are openGym's AGPL derivative); **exercise images/animations are third-party,
  neither MIT nor AGPL — NOT redistributed, never committed**; lean-qr MIT,
  jsQR + ML Kit Apache-2.0.
- Preserved as-is: `LICENSE`, `NOTICE.md`, `SECURITY.md`, copyright headers.
- Modified-version notices (§5a/§5b): our tree must state it is modified, with
  date — add `MODIFIED.md` at migration time, do not strip existing notices.
- AGPL §13 (network use) obligations trigger on public deployment — full
  analysis belongs in the final report, but in short: offer Corresponding
  Source (this repo, kept complete + buildable) to all network users, keep
  license + notices intact, license the whole derivative work under AGPL-3.0.

## O. Files to replace in FuelUp

Effectively everything that makes FuelUp FuelUp. Concretely:

- `src/` (Next.js app, components, stores, lib) → replaced by openGym
  `frontend/` tree (exact copy; only change at migration time: none intended)
- `prisma/` + Postgres usage → deleted (openGym uses JSON files; no ORM)
- `public/sw.js`, PWA plumbing, Clerk middleware/config → deleted/replaced
- `next.config.*`, Next API routes (`src/app/api/**`) → deleted
- `package.json` + lockfile → openGym `frontend/package.json` (+ root
  `api/package.json` for the backend side)
- `Dockerfile*` / compose files → openGym `docker-compose.yml`, `api/`,
  `web/` structure
- `.env*` → openGym `.env.example` contract (values re-entered by operator;
  secrets NEVER copied blindly)
- Branding (FuelUp name, amber/ember theme, Sora/Inter) → openGym identity
  (name, lime accent default, system-font stack, `index.css` verbatim)

## P. Files to preserve temporarily

- `docs/PHASE-*.md`, Phase 0–5 work: already committed? NO — working tree is
  dirty. Preserve via the pre-migration backup (filesystem copy, see below),
  then they leave the tree.
- Current `package.json`/`package-lock.json`: needed only until `frontend/`
  deps install is verified; then replaced.
- `prisma/` + existing DB files: needed for the FuelUp→openGym data-mapping
  step (final report §9); keep a copy in the backup, out of the new tree.
- `.env.local` / `.env`: operator secrets; NEVER commit, NEVER copy into the
  new tree; operator re-enters RP_ID/ORIGIN-style values per `.env.example`.
- `OPEN_GYM_MIGRATION.md` (this file) + forthcoming `MODIFIED.md`: stay.

## Q. Files that can be removed after migration

After validation passes (§Validation below): all Next.js/Prisma/Clerk
residue (`src/app/api/**`, `middleware.*`, `prisma/`, Next configs, FuelUp
PWA worker, FuelUp component library, Tailwind/shadcn config if any, Vercel
files), legacy route aliases (`/dashboard /exercise /calories` — openGym has
no such routes), and the pre-migration backup stays OUTSIDE the repo.

---

## Pre-migration safety state (recorded 2026-10-05, before any replacement)

- Branch: `main`, HEAD `a0627fb` ("feat: add RPE input and per-exercise rest timers")
- Working tree DIRTY: ~40 modified tracked files + ~40 untracked Phase 0–5/V2
  files (`src/components/{today,train,nutrition,progress,navigation,…}`,
  `docs/PHASE-*.md`, test files, etc.). No stashes.
- Rule: NO commit without explicit authorization. Before deleting/replacing
  anything: take a full filesystem backup of the working tree (excluding
  `node_modules/`, `.next/`, `.git/`, `.env*`) to
  `C:\Users\hp\AppData\Local\Temp\opencode\fuelup-backup-<date>\`, verify it,
  and only then replace. List of dirty files: `git status --porcelain` output
  saved alongside the backup.

## Source validation baseline (what "parity" will be checked against)

- `cd frontend && npm install && npm test` (vitest; training-logic suites)
- `cd api && npm test` (node --test)
- `cd frontend && npm run build` (vite; SW stamp plugin must run)
- `docker compose build` / `docker compose up -d --build`, then
  `curl http://localhost:8080/api/health`
- Browser: routes, passkey create/login (localhost), guest mode, plan →
  workout → finish, library search (1324), muscle map, progression line,
  body-weight log, offline reload, sync between two profiles/devices,
  FitNotes/Strong/Hevy import, JSON export, PWA install prompt.

## FuelUp data-preservation plan (pointer — full mapping in final report)

- openGym profile ≅ { routines, week, dayPlan, workouts[], bodyweight[],
  exWeights, customEx, settings }. FuelUp's Prisma rows (users, workouts,
  sets, body-weight, habits, nutrition) must be exported to JSON BEFORE the
  tree is replaced, then mapped by a one-off script into `state-<uid>.json`
  shape + imported via openGym's own backup-import path (merge). Nutrition/
  habits have NO openGym counterpart → export-only (JSON download), documented
  as loss. Nothing is destroyed automatically; mapping table + script +
  loss list are final-report items.
