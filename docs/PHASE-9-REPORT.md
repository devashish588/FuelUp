# FuelUp — Phase 9 Report (Camera Food Logging + Nutrition Label Scanner)

## 1. Camera Architecture Before

Phase 8 shipped text-only AI: user text → `/api/ai/food-parse` → structured
candidates → deterministic resolver → quantity/nutrition engines → review →
FoodLog. The provider interface accepted (but never sent) images; no camera
code, no vision calls, no label handling existed anywhere in the repo.

## 2. Camera Architecture After

Two capabilities on one extended abstraction. Meal: photo → `POST
/api/ai/vision` (`task: 'meal'`) → `AiMealItem[]` → unchanged resolver →
quantity/nutrition engines → shared review → confirm → FoodLog. Label:
photo → same endpoint (`task: 'nutrition_label'`) → `AiLabelCandidate` →
Zod → `buildLabelFoodDraft` → editable review → `addFoodItem` (no FoodLog).
The only new intelligence is image interpretation; everything downstream
is existing Phase 5/6/8 logic. No AI tables, no photo storage, no sync
changes.

## 3. Vision Provider Interface

`AiProvider` gains optional `supportsVision` + `generateVision(request)`
(optional so text-only providers and all Phase 8 fakes keep compiling).
`AiVisionRequest` carries system prompt, optional user text, exactly one
image, token/timeout budgets. `openai-compatible` implements vision via
content-parts (text + image_url data URL) with a vision-model override and
the same single-transient-retry discipline. Capability detection is
explicit — `providerSupportsVision()` AND `AI_VISION_ENABLED` AND key —
with `isVisionCapableProvider()` owning provider knowledge; no model-name
heuristics, no UI hardcoding. Unsupported setups fail fast with the one
new code, `AI_IMAGE_UNSUPPORTED`.

## 4. Meal Image Contract

Request: `{task: 'meal', image: {mimeType, dataBase64}, text?}` (text ≤300
chars, optional clarification). JPEG/PNG/WebP only — declared MIME plus
server-side magic-byte sniffing (JPEG/PNG/WebP signatures; GIF/text/
garbage rejected without calling the provider). Exactly one image per
request (multi-image rejected pre-quota). Server base64 cap ~750 KB
decoded; raw body cap 1.5 MB.

## 5. Meal Resolution Pipeline

Vision `AiMealItem` = Phase 8 candidate + `visualPortionHint` +
`foodState`. The service folds `foodState` into `preparationHint` so the
resolver scores unchanged; portion hints are display-only. Mixed plates
resolve per-item independently (rice + dal + curry + salad tested);
unknown dishes arrive as descriptive names ("unknown curry-like dish") →
`unsupported` → manual search/pick/remove; paneer-style ties stay
`ambiguous` with the shared picker; saved recipes resolve by exact match
(`Your Chicken Curry` via the materialized item). Corrections (200 g →
250 g) recompute locally with zero further AI calls.

## 6. Nutrition Label Contract

`{task: 'nutrition_label', image}` → `{label: {name, brand,
servingQuantity, servingUnit (g/ml/serving/count), calories, protein,
carbs, fat, fiber, sugar, sodium (mg)}, clarificationRequired}`. Strict
structured output + Zod; nulls for missing/unreadable (never estimated);
negatives and non-g/ml/serving/count units rejected.

## 7. Label Validation

Three layers: JSON parse → Zod schema → `buildLabelFoodDraft` semantics.
Unclear serving basis → per-100 g + warning (never silently invented);
unreadable macros → 0 + warning (manual-form convention); sugar/sodium
stay null (unknown ≠ zero); placeholder name ("Scanned food") instead of
failure; no mass⇄volume conversion (ml/serving/count bases preserved).
Review requires name, serving > 0, calories > 0 before saving.

## 8. Image Compression

Client compresses to ≤1280px longest edge, JPEG q0.82 (~≤500 KB) via
canvas; always-JPEG output so users never think about formats and every
endpoint accepts it. Pre-compression guard (supported MIME, non-empty,
≤10 MB) plus post-compression size guard. Pure dimension math unit-tested;
canvas path is browser-only (covered by device testing). Server receives
the smallest useful representation; originals are never uploaded.

## 9. Privacy

Photos may contain people/faces/surroundings: the UI states "Photo is used
to analyze your meal" before capture. Lifecycle is memory/blob-URL →
analysis → discard (URLs revoked; tested helper). Images never enter
IndexedDB, FoodLog, outbox, sync, or Prisma. Provider payloads carry image
+ optional clarification text only (asserted byte-level in tests: no ids,
emails, history, EnergyState). Audit logs carry metadata only — never
image bytes or base64.

## 10. Security

Clerk auth on both vision endpoints; MIME + size + magic-byte validation;
separate image rate bucket; timeouts; normalized codes; no secret leakage
(keys in headers only, asserted); cross-user access impossible (no user
data in requests; resolution happens client-side over the caller's own
catalog). Image/label text treated as untrusted data via prompt clauses +
Zod (injection safety). Versioned prompts live in the AI layer, never in
components.

## 11. Offline Behavior

Camera screen never crashes offline: capture, preview, retake, and upload
all work; Analyze is replaced with "Save this image? Not available in
this version" (nothing queued, nothing in the outbox). Search/Recent/
Recipes/Manual/analytics keep working; reconnect restores normal sync.
`isAiOnline()` gates both flows.

## 12. AI Failure Handling

Reuses Phase 8 categories plus `AI_IMAGE_UNSUPPORTED` (503): timeout 504,
quota/rate-limit 429 (+retryAfterMs), malformed 502, oversize 413,
unavailable/misconfigured 503. Specific messages per task ("That label
couldn't be read…", "Couldn't understand that photo…"); retry buttons
re-analyze the same image (no recapture needed); permission-denied and
unsupported-browser states get explanations + upload fallback.

## 13. User Confirmation

Mandatory for both flows. Meal: proposal → shared review (resolve all
rows) → Add to Food Log → existing persistence. Label: extraction →
editable review ("Review before saving — not independently verified") →
Save to My Foods → success panel stating NO meal was logged. Malformed
output and clarification cases create nothing.

## 14. Persistence

Confirmed meal → standard FoodLog snapshot (IndexedDB → outbox → sync),
indistinguishable from manual logs (no image fields — asserted).
Confirmed label → FoodItem via `addFoodItem` (existing entity, syncs
normally). AI candidates, prompts, results, and photos persist nowhere.

## 15. Sync

No new sync system, no new entities, no outbox entries for parsing or
images. Only confirmed FoodLogs/FoodItems use existing sync. No Prisma or
Dexie changes (v5 untouched).

## 16. UI Changes

- AI tab: Describe/Scan-Meal/Scan-Label segmented control (Food → AI →
  Scan Meal = minimal taps; no food-page redesign).
- `CameraCapture`: user-initiated camera (environment facing), live
  preview with plate guide, Capture/Retake/Close, upload fallback
  (`capture="environment"`), permission/unsupported explanations,
  aria-live statuses, touch-sized controls.
- `MealScanPanel`: preview → optional clarification → Analyze → shared
  `AiReviewPanel` (extracted verbatim from the text flow + portion-hint
  line; identical behavior).
- `LabelScanPanel` + `LabelReviewPanel`: editable name/brand/serving/
  7 nutrients → Save to My Foods → success state (no auto-log).
- Full labeling, `role="alert"`, live regions, desktop upload fallback.

## 17. Database Changes

None. No Prisma models, no Dexie version bump, no AI tables. `.env.example`
+ `serverEnv` gained `AI_VISION_MODEL` / `AI_VISION_ENABLED` /
`AI_IMAGE_REQUESTS_PER_HOUR` (names only).

## 18. Tests Added

51 new (290 → 341, all green): vision schemas (11: sniff JPEG/PNG/WebP/
GIF/text/garbage, request validation incl. oversize/long-text, meal
strip rules + state enum + bounds, label sparse/decimal/negative/unit
rejections); label draft (6: basis preservation, branded/user source,
per-100 fallback + warning, null-macro defaults, name fallback, ml/count
bases); image-client (6: downscale/no-upscale/invalid dims, MIME/file/
output guards); vision service (6: Indian plate without invented grams,
state→hint normalization, malformed rejection, triple capability gating,
timeout propagation, label extraction/rejection); provider vision (5:
content-parts + data URL + key hygiene, model override, multi-image
guard, quota/timeout normalization, capability knowledge); route handler
(6: meal/label success, bad-JSON/MIME/oversize/magic-mismatch incl. no
provider call, separate rate bucket, unsupported/timeout/malformed
mapping, status extension); HTTP boundary (3: 401/413/authenticated meal
with payload privacy assertion); vision client (3: minimal contract
with/without text, unsupported mapping, network failure); resolver reuse
(5: missing-qty blocking, recipe match, ambiguity tie, unsupported
unknown, correction math + FoodLog shape without image fields).

## 19. Validation Results

- `npx prisma generate` — pass (no schema change; client regenerates cleanly).
- `npx tsc --noEmit` — pass (0 errors).
- `npm run lint` — (final run below).
- `npm run build` — (final run below).
- `npm test` — 44 files, 341/341 passed (290 prior + 51 new, zero regressions).

## 20. Manual Device Testing

No physical device lab in this environment — camera/canvas paths
(`getUserMedia`, `createImageBitmap`, canvas encode) cannot run under
vitest node and were verified by code review only, with a real-phone run
outstanding (PWA → Food → AI → Scan Meal → permission → capture Indian
plate → correct quantities → confirm → FoodLog/macros/analytics/dedup/
no-retained-image; label photo → edit → save → search → log → scaling;
offline camera behavior). Automated coverage stands in for everything up
to the lens: compression math, guards, contracts, resolution, persistence
shape, privacy bytes. Live-key + device run recommended pre-release;
observed limitations must be documented from that run, not from one photo.

## 21. Preserved Features

Confirmed (prior 290 tests green unmodified + inspection): Dashboard,
Food (all five original tabs + text AI tab intact), Recipes, Workouts,
Metrics, Habits, Heatmap, Daily score, Streaks, Analytics (camera logs
flow through canonical rollups; no redesign), PWA (shell/SW/offline/
manifest untouched), Offline, Sync (push/pull/outbox/multi-device),
Clerk, Adaptive Energy Engine (untouched, never sent), Phase 8
natural-language logging (behavior-identical after review-panel
extraction — same code path, plus portion-hint display).

## 22. Remaining Issues

- Real-device camera + live-key run outstanding (§20) — the one path
  automation cannot cover.
- `max_tokens` vs `max_completion_tokens` tradeoff inherited from Phase 8.
- Rate limits remain per-instance approximate (documented).
- Label sodium assumes mg-as-printed with g→mg instruction to the model;
  exotic label formats may need user correction (by design: review).
- No prompt caching (deliberate); no multi-image meals (one photo default).
- No barcode/voice/coach (deferred).

## 23. Phase 10 Readiness

Vision interface + candidate schema + resolver + engines now cover
text AND image inputs; a coach phase can consume FoodLogs, EnergyState,
and the existing analytics untouched. Next: device hardening, then
whatever Phase 10 defines — no architectural prerequisites outstanding.
