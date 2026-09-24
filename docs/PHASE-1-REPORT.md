# FuelUp — Phase 1 Report (Cleanup + Architecture Foundation)

## What was inspected

- `package.json` (Next 16.2.4, React 19, Clerk 7, Prisma 7 + `pg`, Zod 4,
  Zustand 5, recharts, date-fns; installed `svix` this phase)
- `next.config.ts`, `tsconfig.json` (path alias `@/*`), `eslint.config.mjs`,
  `prisma.config.ts`, `.env` / `.env.example`, `README.md` (stock template)
- `prisma/schema.prisma` vs `docs/schema.sql` (line-by-line divergence check)
- All 4 API routes + webhook, `middleware.ts`, all 6 Zustand stores, all 5
  services, constants (incl. food/exercise seed DBs), types, utils, db client
- All pages (root router, onboarding wizard, 6 main pages incl. dashboard,
  habits heatmap, analytics charts), all shared components/charts/layout

## Problems found

1. **Middleware was a passthrough** (`auth disabled for development`) while
   `ClerkProvider` and per-route `auth()` implied protection.
2. **Webhook had no signature verification** — anyone could POST fake
   `user.created/deleted` events (highest-severity issue).
3. **Prisma `WorkoutExercise.exerciseId` referenced a non-existent `Exercise`
   model**; `User` had no `exercises` relation; missing indexes everywhere;
   `Habit` lacked `updatedAt` (present in TS types).
4. **Invalid Prisma filters**: `delete/update({ where: { id, userId } })` on
   non-unique keys (meals, habits) would throw at runtime.
5. **`docs/schema.sql` (Supabase/RLS) diverged** from Prisma: `profiles` vs
   `users`, UUID vs cuid, `created_by` vs `userId`, `distance_km` vs
   `distanceMeters`, missing `exercises`, extra future tables (diet plans,
   templates, PRs), no per-day metric uniqueness.
6. **Duplicated calculations**: `calculateBMI` in both `utils` and
   `recommendation-engine` (different rounding), duration math inline in the
   exercise store, daily-summary reduce inline in the calorie store,
   all-time/all-window bug in `getCompletionRate`.
7. **Fake-user assumptions**: `user_id: ''` in 4 stores + 2 pages,
   `email: 'user@fuelup.app'` in onboarding, `created_by: null` seeds.
8. **No validation layer**: API routes passed raw `body` into Prisma.
9. **Raw error exposure**: `console.error` + Prisma errors reachable by clients.
10. **No centralized env**: `DATABASE_URL` read ad hoc; `.env.example` had
    placeholder secrets inline and no `CLERK_WEBHOOK_SECRET`.
11. **Unversioned persistence**: 6 `localStorage` keys, no `version`, magic
    strings scattered; `searchFoodItems` crashed on nullish `brand`.
12. **Dead code**: `CalorieRing` and `MacroBars` chart components with zero
    imports (pages use inline SVG/`ProgressBar` instead).
13. **Mobile/a11y**: `maximumScale: 1` (no pinch-zoom), hover-only
    (`opacity-0 group-hover`) delete/edit buttons unreachable on touch,
    22px habit checkboxes, missing `aria-label`s, no PWA manifest.

## Changes made (by file)

- **Created**: `src/config/env.ts`, `src/config/app.ts`,
  `src/lib/calculations/{energy,metrics,nutrition,habits,workout,analytics,index}.ts`,
  `src/lib/validation/{common,profile,food,metric,habit,workout,index}.ts`,
  `src/lib/auth/current-user.ts`, `src/lib/errors/app-error.ts`,
  `src/lib/logger/logger.ts`, `src/lib/repositories/types.ts`,
  `src/lib/persistence/storage-keys.ts`, `src/lib/mappers/index.ts`,
  `src/types/index.ts`, `src/features/{nutrition,workouts,metrics,habits,analytics}/index.ts`,
  `src/components/shared/feedback.tsx`, `public/manifest.webmanifest`,
  `docs/ARCHITECTURE.md`, `docs/PHASE-1-REPORT.md` (this file).
- **Rewrote (compat-preserving)**: `src/lib/services/recommendation-engine.ts`
  (re-exports canonical calculations), `src/lib/db/index.ts` (central env),
  `src/middleware.ts` (Clerk middleware restored), `src/app/layout.tsx`
  (manifest, `viewportFit`, dropped `maximumScale`), `.env.example`
  (names only + webhook secret).
- **Prisma** (`prisma/schema.prisma`): added `Exercise` model + `User.exercises`
  + `WorkoutExercise→Exercise` relation; indexes on food/metrics/workout/habit
  tables; `UNIQUE(userId, date)` on body metrics; `updatedAt` on habits;
  barcode/user indexes on food items.
- **Services**: fixed non-unique `where` filters (meals/habits), completed
  metric field coverage, hardened food search for missing `userId`.
- **API routes** (`metrics`, `meals`, `habits`): `requireDbUser` + Zod
  validation + user-safe `AppError` responses + structured logging.
- **Webhook** (`api/webhooks/clerk`): Svix verification via
  `CLERK_WEBHOOK_SECRET`, 400 on bad signature, 500 only when unconfigured.
- **Stores**: centralized keys/versions (`STORAGE_KEYS`, `PERSIST_VERSION`),
  `LOCAL_OWNER_ID` marker, canonical math (`summarizeFoodLogs`,
  `calculateWorkoutDurationMinutes`, date-bounded `calculateCompletionRate`),
  null-safe brand search.
- **Pages**: onboarding uses Clerk email (no fake placeholder);
  calories/metrics pages use `LOCAL_OWNER_ID`; touch-visible delete/edit
  controls (`opacity-100 lg:opacity-0 lg:group-hover…` + `aria-label`s);
  habit checkboxes 22px → 28px with `aria-pressed`.
- **Deleted**: `src/components/charts/calorie-ring.tsx`,
  `src/components/charts/macro-bars.tsx` (zero imports, verified).

## Files moved / deleted / created

- Moved: none (deliberate — barrels reference existing locations to avoid churn).
- Deleted: the two dead chart components above.
- Created: see list above (24 new files + 2 docs + manifest).

## Dependencies changed

- Added: `svix` (webhook signature verification — required security fix).
- Removed/updated: none.

## Architectural decisions

- Prisma is the source of truth; `docs/schema.sql` stays as historical reference.
- Formulas frozen: canonical modules preserve existing behavior byte-for-byte
  (only the completion-rate window bug, which contradicted its own contract,
  was corrected to date-bounded).
- Stores remain the runtime source until Phase 2; repositories are contracts
  only — no IndexedDB, no sync engine, no new product features.
- `LOCAL_OWNER_ID` centralizes (not legitimizes) the local-only owner until
  Clerk-scoped sync replaces it; server code never trusts it.

## Known limitations / next phase

- No tests exist in the repo (`*.test.*` absent, no `test` script) — none
  added in Phase 1; recommend adding store/calculation unit tests in Phase 2.
- `README.md` is still the stock Next.js template (docs live in `docs/`).
- Service worker / offline shell / IndexedDB / sync engine not started.
- Page-level auth gating still permissive (localStorage mode preserved);
  tighten once sync lands. `README` + page gating are Phase 2 items.

## Validation

- `npx prisma generate` — pass (client regenerated with `Exercise` model).
- `npx tsc --noEmit` — pass (0 errors; one Svix cast fixed, not suppressed).
- `npm run lint` — pass (0 warnings/errors).
- `npm run build` — pass (all 16 routes compiled).
- Tests — none exist; nothing to run (documented, not hidden).
