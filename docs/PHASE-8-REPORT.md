# FuelUp — Phase 8 Report (AI Foundation + Smart Natural-Language Food Logging)

## 1. AI Architecture Before

Zero AI: no provider code, no AI SDKs, no external fetch calls; `nutrition.ts`/`quantity.ts` headers state "deterministic, no AI". Food logging was Search/Recent/Saved/Recipes/Manual tabs → `calculateNutritionForQuantity` → `addFoodLog` → IndexedDB → outbox → sync. The only machine-generated numbers came from FuelUp's own engines.

## 2. AI Architecture After

User text → `POST /api/ai/food-parse` (Clerk, validated, rate-limited) → provider-agnostic AI service → Zod-validated structured candidates → deterministic resolver (real foods/recipes) → quantity engine → nutrition engine → review → explicit confirm → FoodLog → existing persistence/sync. AI proposes identity+quantity+unit+hints; FuelUp calculates; the user confirms. The prohibited AI→calories→FoodLog path is structurally impossible (schema strips nutrition; route has no DB access).

## 3. Provider Abstraction

`AiProvider` interface (`generateText`, `name`) in `lib/ai/types.ts`; business logic never imports vendor code. One `openai-compatible` implementation (native fetch, JSON mode, temperature 0, AbortController timeout, exactly one retry on transient 5xx/timeout/network only) covers OpenAI/Groq/OpenRouter-style endpoints via `AI_API_BASE_URL`. Factory `getAiProvider(config)`; unknown providers and missing keys fail as `AI_CONFIGURATION_ERROR` without leaking secrets. Image inputs accepted by the interface but never sent (camera prep, no storage).

## 4. AI API

`POST /api/ai/food-parse`: Clerk `requireDbUser` → 8 KB body cap → strict JSON → Zod request → per-user rate check → service → `{items, clarificationRequired, meta{requestId, model, latencyMs}}`. Never creates a FoodLog. `GET /api/ai/status`: per-caller `{enabled, provider, model, requestsRemaining, windowSeconds}` (no globals, no secrets). Follows existing route conventions (Zod, `toErrorResponse`, logger, status codes incl. 401/400/413/429/502/503/504).

## 5. Structured Output Contract

Request: `{text}` 1–500 chars, unknown keys stripped (ownership fields ignored, tested). Model output: `{items[{name, quantity|null, unit|null, mealHint, preparationHint}], clarificationRequired}`, max 15 items, strict `JSON.parse` (no prose salvage). Allowed units: engine units (g/kg/ml/L/count/serving) + household (glass/bowl/cup/piece/slice/tbsp/tsp). Zod strips calories/macros/confidence — verified by test. Rejects: invalid units, negative quantities, missing names, >15 items.

## 6. Food Resolution

`resolveFoodCandidates(candidates, foods)` over the user's full catalog (seeds + customs + materialized recipes): shared `food-search` scoring with the store (exact 100 / prefix 30 / substring 20 / weak 10 / +5 preparation tie-break) → **resolved** (one strong match, incl. exact-beats-prefix) / **ambiguous** (tie — user picks, never silent) / **unresolved** (weak only) / **unsupported** (no signal). Missing quantities stay empty (never invented); household units map to the food's own serving definition as an editable suggestion (e.g. 1 bowl dal → 150 g); picking a food re-suggests household rows only. Deterministic (tested by deep equality).

## 7. Quantity Integration

Resolved rows flow into the existing `calculateNutritionForQuantity` (same function as manual logging): count via `count_weight_g` (2 eggs → factor 2), grams/ml/serving per basis rules, household suggestions already converted to engine units before calculation. Invalid combinations surface engine error reasons in the row. No quantity logic duplicated; Phase 5 tests untouched and passing.

## 8. Nutrition Integration

Preview totals use canonical `calculateMealNutrition` over provisional rows (same rollup as the food page). Verified: 2 eggs → 156 kcal identical to a manual log; roti×2 + dal 200 g sums match independent engine calls. "2 eggs" acceptance: AI's `egg/2/count` → egg weight mapping → deterministic 156 kcal; any AI-supplied calorie number is stripped at the schema and cannot reach the snapshot. Confirmed rows persist via `confirmAiReview` mirroring the manual submit shape exactly (food snapshot, servings factor, fiber/sugar/sodium nulls).

## 9. Review/Confirmation Flow

New **AI tab** (Search/Manual/Recent/Saved/Recipes/**AI**) opening `AiFoodLogger`: textarea → Parse → "Understanding your meal…" → "Matching foods…" → "Found N items — review before adding." Review rows show ✓/choice/attention states, per-row kcal/macros, editable food (picker with search + top matches), editable qty/unit (unit list from `availableUnitsFor`), removable rows, meal selector (defaults to first meal hint), deterministic totals card, and [Add to Food Log] disabled until every row is valid ("Nothing is saved until you confirm"). Editing never re-calls the model. Confirm → existing `addFoodLog` path → panel closes. Keyboard-native controls, labels on all inputs, `role="alert"` errors, `aria-live` status, retry button, no focus traps, mobile-friendly panel (no modal redesign).

## 10. Error Handling

Normalized codes end-to-end: `AI_TIMEOUT` (504), `AI_QUOTA`/`AI_RATE_LIMITED` (429 + `retryAfterMs`), `AI_INVALID_OUTPUT` (502), `AI_REQUEST_TOO_LARGE` (413), `AI_CONFIGURATION_ERROR`/`AI_UNAVAILABLE` (503), `BAD_REQUEST` (400), `UNAUTHORIZED` (401). Specific user messages everywhere ("AI unavailable — use manual logging.", "Couldn't understand that meal. You can edit it manually.", …). Retry only once on transient provider failures; never on 4xx/quota/malformed. Empty/clarification results show the manual-edit path, not a dead end.

## 11. Rate/Cost Controls

Per-user in-memory sliding window (default 20/hour, env-configurable; documented per-instance approximation on serverless). Request caps: 500-char text, 8 KB body, 15 items, 800 output tokens, 20 s timeout. In-process stats (requests/failures/avg latency/errors-by-code, no prompts) logged per request; per-caller remaining quota via status endpoint. No billing, no Redis, no new dependencies — $0 stack preserved.

## 12. Privacy

Minimal request contract: only `{text}` leaves the browser (verified in test — provider payload contains system prompt + food text only). Never sent: weight, body fat, health/food/workout history, email, Clerk tokens/metadata, EnergyState. Server audit logs carry metadata only. No prompt caching. No AI table; prompts never enter the outbox or sync.

## 13. Offline Behavior

`isAiOnline()` guard: offline → AI tab shows "You're offline. Manual food logging is available." with Parse disabled. Search/Recent/Favorites/Recipes/Manual fully functional. AI requests are never queued as food mutations. Manual logging regression-covered by existing tests.

## 14. Sync Behavior

Unchanged. AI parsing is ephemeral (no table, no outbox, no sync of prompts/candidates). Only confirmed FoodLogs travel IndexedDB → outbox → sync through the existing Phase 3 path (verified: confirm uses the store's `addFoodLog`, which enqueues). No sync code modified.

## 15. UI Changes

- Food modal: new **AI** tab (Sparkles icon) rendering `AiFoodLogger` (`date` in, `onClose` on confirm).
- New `AiFoodLogger` component (input → parsing → review → confirm states as above).
- No other screens touched; no redesign of Food/Dashboard/analytics.

## 16. Database Changes

None. No AI tables (ephemeral parsing; persistent record remains FoodLog). No Prisma changes, no Dexie version bump. `.env.example` + `serverEnv` gained AI_* names only (no secrets committed).

## 17. Tests Added

63 new (227 → 290, all green): schemas/contracts (9: stripping, limits, rejections), config + rate limiter (5), provider (8: success/header hygiene, 401/429 no-retry, 5xx + network single-retry, timeout abort, factory errors), service (7: English/Indian/multi-item/count/g/ml/meal/prep parsing, malformed + oversize + unconfigured failures, stats hygiene), route handler (8: shape, ownership stripping, 413/400/429/504/502/503, status), client (5: offline guard, minimal contract, code mapping, network failure), food-search (4: tiers, alias, boost, limits), resolver/preview/confirm (17: exact/ambiguous/unresolved/unsupported, recipe tie, missing qty, household mapping + scaling, selection, determinism, engine totals, invalid blocking, confirm-once semantics, snapshot factors), HTTP route (4: 401/413/unconfigured-key/e2e-stubbed success with provider-payload privacy assertion).

## 18. Validation Results

- `npx prisma generate` — pass (no schema change; client regenerates cleanly).
- `npx tsc --noEmit` — pass (0 errors).
- `npm run lint` — (final run below).
- `npm run build` — (final run below).
- `npm test` — 35 files, 290/290 passed (227 prior + 63 new, zero regressions).

## 19. Manual Acceptance

No live provider key in this environment — acceptance executed with stubbed/fake providers at HTTP and service levels plus deterministic resolver checks: "3 eggs and 250 ml milk" → egg 3 count + milk 250 ml → engine totals; Indian meal (2 rotis/180 g rice/200 g dal/150 g curry) → per-item resolution incl. household bowl mapping; "230g chicken curry" resolves the saved recipe row when exact (ties force a pick); "I had paneer" with tied matches requires selection; "I had chicken curry" (no qty) blocks confirm until filled; 200 g → 250 g edit recomputes deterministically without model recall; unconfirmed previews create zero logs; offline disables AI only; timeout/malformed paths keep UI functional; cross-user foods unreachable (server never receives catalogs; request strips ownership fields). Live-key run recommended pre-release (enter key, parse 3 test phrases, confirm totals match manual logging).

## 20. Preserved Features

Confirmed (prior 227 tests green unmodified): Dashboard, Food (all five original tabs + submit/edit/duplicate), Recipes (builder, materialization, search), Workouts, Metrics, Habits, Heatmap, Daily score, Streaks, Analytics, PWA (SW/offline/manifest), IndexedDB, Sync (push/pull/outbox/multi-device), Clerk, Adaptive Energy Engine (untouched, never sent to the model).

## 21. Remaining Issues

- Live provider run outstanding (§19) — needs an API key + quota.
- No prompt caching (deliberate; re-evaluate only with clear benefit).
- Rate limit is per-instance approximate (documented; fine for $0).
- `max_tokens` (broadest cross-provider support) vs `max_completion_tokens` (o-series) — documented tradeoff.
- AI tab English-first prompts; Indian-food handling verified via resolver/unit mapping, not multilingual prompts.
- No image/voice/coach (deferred by design).

## 22. Phase 9 Readiness

Reusable without redesign: provider interface + structured candidate schema + resolver + quantity/nutrition engines for photo→candidates (only image understanding is new); same `parseFoodText` contract for voice→text; `EnergyState` + analytics remain the documented Coach context (still never sent). Next: live-key hardening, then camera prep.
