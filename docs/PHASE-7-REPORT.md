# FuelUp — Phase 7 Report (Adaptive Energy + Weight Trend Engine)

## 1. Energy Architecture Before

Profile → BMR (Mifflin-St Jeor) → activity-based initial TDEE → goal
adjustment → initial calorie target, computed once at onboarding and stored
on the profile. The target never learned: identical intake/weight histories
produced identical targets forever. No weight-trend function existed (charts
mapped raw points); no maintenance observation, quality, confidence, target
history, or target-rate concept. Goals were cut/bulk/recomp only.

## 2. Energy Architecture After

Initial estimate (kept, immediate) → real intake + weigh-ins → 7-day
rolling-median trend → observed energy balance → adaptive maintenance
(with bounds) → goal-based target → quality/confidence/explanation. All
deterministic, no AI. Derivation (`deriveEnergyState`) is pure over raw
facts (profile, food logs, metrics, target history) in a 28-day
local-calendar window, so every device converges. Application is explicit
(Metrics "Update target"), weekly-cadenced, guardrail-stepped (±150 kcal),
and recorded as append-only `TargetHistory` events.

## 3. Initial Estimate

Unchanged and still first: `calculateBMR`/`calculateTDEE`
(Mifflin-St Jeor × activity multipliers), `resolveGoalAdjustment`,
`generateRecommendation` (floor 1200), `calculateMacroTargets`. Onboarding
flow untouched (auto-derive still assigns cut/bulk/recomp only) plus two
new profile fields seeded as rate null / source 'initial'. Backfilled with
unit tests (previously untested). The adaptive layer only activates past
the minimum-data gate; before that the UI says "Using your starting
estimate" with exactly what is missing.

## 4. Weight Trend Model

One canonical method (`calculations/metrics`): 7-day rolling median.
Same-day weigh-ins collapse to median (repository already enforces one
row/day, latest write wins — documented as the multi-weigh-in rule);
smoothed(d) = median of observed daily weights in [d−3, d+3]; days without
observations in range are omitted (gaps never fabricated); rate =
(last − first smoothed)/calendar days between (0 when < 2 points). Chosen
because medians ignore single anomalous weigh-ins, tolerate missing and
irregular days, and need no tuning constants. The same series feeds the
maintenance math and the chart overlays. Local calendar days throughout
(`toDateString` convention; no UTC shifting).

## 5. Observed Maintenance Model

`calculateObservedMaintenance` in `energy.ts`: maintenance ≈ average
valid-day intake − trend rate × `KCAL_PER_KG_EQUIVALENT` (7700, documented
approximation isolated in the calc layer — tissue change varies; UI must
say "estimated maintenance / based on logged data"). Intake comes from the
canonical `calculateDailyNutrition` per window day; days < 200 kcal are
excluded as non-observations. Output is structured (estimate, minimum,
maximum ±max(100, 15% of rate component) rounded to 10, rate/day/week,
window, counts) — never a bare number. Synthetic fixtures: stable 2700 →
2700 exactly; 2500 + −0.1 kg/day → ≈3270 (> intake); 3200 + gain → below
intake.

## 6. Adaptive Target

`calculateAdaptiveTarget(maintenance, goal, rate)`: cut → −rate·7700/7,
bulk → +rate·7700/7, maintain/recomp/custom → 0 (maintenance-oriented by
design; custom users edit directly). Rate = stored value ?? goal default
(cut 0.5, bulk 0.25, else 0), clamped [0, 1.5]; adjustment capped ±750
(guardrail, not medical advice), rounded to 10; target floored at 1200 with
`floorHit` reported; macros recalculated through canonical
`calculateMacroTargets`. Applied target = weekly-stepped (±150) toward the
raw target. Recomposition emphasizes protein/training/trend via the
maintenance target + existing macro/training surfaces — no deficit applied,
no guarantee claimed.

## 7. Data Quality

Deterministic 0–100 (`assessDataQuality`): nutrition coverage
min(valid/14,1)×50 + weight coverage min(obs/8,1)×30 + span
min(span/21,1)×20. Bands High ≥70 / Medium 40–69 / Low <40. Reproducible
from the same inputs; not an AI score, not adherence.

## 8. Confidence

Separate from quality (`assessEnergyConfidence`): High requires
quality-High AND span ≥21 AND ≥8 weigh-ins; Medium for decent-but-short;
Low for sparse. Sub-ratings always shown: food tracking
excellent(≥20)/good(≥10)/sparse, weight tracking good(≥8)/fair(≥5)/sparse.
Example surfaces: "Food tracking: Excellent, Weight tracking: Good, Overall
energy estimate: Medium".

## 9. Goal Handling

Goals stay explicit (never inferred from BMI/body fat): cut/bulk/recomp
(auto-derivable + user-pickable) plus new maintain/custom (user-pickable in
Settings; onboarding never assigns them). `GOAL_LABELS` extended; settings
goal picker extends automatically. Macro protein factors: cut 2.2, bulk
1.8, maintain/recomp/custom 2.0. Custom = maintenance target; directed
loss/gain uses cut/bulk with an editable rate. Rate editable in Settings
(0–1.5, blank = goal default); never forced during onboarding.

## 10. Target History

Append-only `TargetHistory` rows (id, date, previous/new, rule-generated
reason, maintenance, valid days, confidence, goal, avg intake): the "why
did my target change?" source, rendered on Metrics + Settings with the
last-change line. Application writes one row per change; reasons derive
from thresholds (maintenance moved ≥50, intake moved ≥100, goal changed,
first activation, smoothing remainder). History never overwritten; food
logs never rewritten by target changes (only interpretation changes).

## 11. Retroactive Data

Derivation is pure over current arrays — backfilled food/weight is picked
up on the next recompute with no manual trigger and no full-DB rescan
(28-day window queries; stores already hold the data). Tested: adding a
historical 4200 kcal day + weigh-in changes the estimate; backfilling an
empty day adds a valid observation. Same-day weigh-in replaces via the
existing one-row/day upsert.

## 12. Offline Behavior

Everything derives from local IndexedDB: trend, averages, maintenance,
target, analytics, explanation. Offline logging → Dexie → recompute →
new target/analytics → outbox → eventual sync. No network in the loop.
Repo tests assert outbox enqueue; engine tests run the full offline cycle.

## 13. Sync Behavior

Standard Phase 3 mechanism only: `targetHistory` entity (priority 3) with
validation, push upsert/delete + tombstones, pull collect/apply (client
cascades nothing — append-only rows apply by id), ownership conflicts,
reload map entry. Profile carries the two new preference fields in its
whole-row upsert (push mapping + pull mapping with local fallbacks).
Derived analytics are never synced. Dexie v4→v5 (new table + V4 baseline);
reset + carryover cover the table; fake-prisma extended.

## 14. Multi-Device Behavior

Tested A→B→A: device A logs 16 food days + 6 weigh-ins, pushes 23 events;
device B pulls and derives the byte-identical maintenance estimate, mode,
and counts; device B backfills a weigh-in, both sync, both converge on the
new identical estimate with the observation counted. Convergence holds
because derivation is pure over identical synced facts — maintenance
numbers are never synced as truth (only history events + profile prefs).

## 15. UI Changes

- Dashboard + Calories heroes: one-line `TargetBasisLabel` under the
  target ("Starting estimate" / "Current adaptive target · based on N
  days" / "Edited target · adaptive updates paused"). No redesign.
- Metrics page: additive `EnergyEstimateCard` (maintenance range, target,
  confidence, counts, quality, sub-ratings, rule reasons, last change,
  "Update target → X kcal" when due, "up to date" otherwise; estimate
  language, no medical claims) + trend overlay (sky dashed) and
  goal-pace projection (violet dashed, cut/bulk only, labeled
  illustration) on the existing weight chart with an Actual/Trend/Target
  pace legend. Actual series untouched.
- Dashboard `WeightTrend`: optional trend overlay prop (existing callers
  unaffected).
- Settings: Target Rate row (editable, blank = default), Target Basis
  card (provenance + reasons + last change), manual-edit rule (calorie/
  macro edits set source 'manual', pausing adaptation), export includes
  target history, reset clears energy state.
- No Analytics route exists in the app; the Metrics page is the
  energy/weight analytics surface (documented decision).

## 16. Database Changes

Prisma: `User` += `targetRateKgPerWeek Float?`, `targetSource String
@default("initial")`; new `TargetHistory` model (+ User relation, indexes
[userId], [userId, updatedAt]); schema validated, client regenerated
(v7.8.0). Goal column stays String — new values need no column migration.
Dexie v4→v5: `targetHistory: 'id, [ownerId+date], ownerId'` + `V4`
baseline + version(4) block; profiles schemaless for the two new fields.
No daily TDEE / chart points / trend arrays stored anywhere.

## 17. Tests Added

57 new (170 → 227, all green): `energy.test.ts` (~30: BMR/TDEE backfill,
auto-derive branches + BMI fallback, rate resolve/clamp, adaptive per
goal incl. maintain/custom, ±750 cap, 1200 floor, maintenance
stable/deficit/surplus + bounds widening, quality bands, gate boundaries,
confidence separations, ±150 step, explanation rules, determinism);
`metrics.test.ts` (10: collapse median, up/down/stable, spike immunity,
gaps, irregular intervals, month rollover, single/empty, determinism);
`adaptive-energy.test.ts` (~12: three synthetic fixtures with tolerances,
sparse→initial + reason, 200 kcal floor, cadence hold/release, manual
pause, already-current, retroactive recompute + new-day count,
determinism + input immutability); `target-history-repository.test.ts`
(4: order, isolation, outbox, delete-coalescing); apply-push (+2:
history lifecycle, profile Phase 7 fields); collect-pull (+1); engine
(+1: multi-device convergence).

## 18. Validation Results

- `npx prisma generate` — pass (Client v7.8.0); `prisma validate` — schema valid.
- `npx tsc --noEmit` — pass (0 errors).
- `npm run lint` — pass (0 errors, 0 warnings).
- `npm run build` — (final run below).
- `npm test` — 26 files, 227/227 passed (170 prior + 57 new, zero regressions).

## 19. Manual Acceptance

No device lab — acceptance by construction + automated coverage; handheld
run recommended pre-release. Covered: 80 kg / 2500 kcal profile with 14
days ≈2400 kcal + declining trend → observed expenditure above initial
estimate with a stepped (non-extreme) proposal; single 4 kg spike moves
trend rate < 0.05 kg/day; missing days lower quality / hold adaptation;
retroactive adds recompute; offline derive → sync → identical cross-device
estimates. Unverified-by-hand: visual taps on the energy card / apply flow
(logic behind them tested).

## 20. Preserved Features

Confirmed (prior 170 tests green unmodified + inspection): Dashboard,
Food, Recipes, Workouts, Metrics, Habits, Heatmap, Daily score, Streaks,
Analytics (existing charts/scores untouched; energy is additive), PWA,
IndexedDB, Sync, Clerk. Habit heatmap and consistency system untouched.
Existing analytics/weight charts preserved and extended only with overlay
series. No AI/LLM calls anywhere (no new dependencies).

## 21. Remaining Limitations

- Device acceptance run outstanding (§19).
- No Analytics route — energy detail lives on Metrics (deliberate).
- `rateChanged` explanation input exists but never fires (rate history not
  stored; rate edits surface via smoothing reason).
- `GoalType` is declared in both `types` and re-exported from `energy`
  (kept for import compatibility).
- Custom goal ignores rate (maintenance target by design).
- Projection is a pace illustration, not a forecast (labeled as such).

## 22. Phase 8 Readiness

`EnergyState` is the documented future-AI contract: averageIntake,
weightTrend, maintenanceEstimate (+bounds), target, confidence, quality,
daysUsed, goal, targetRate — a coach can explain it without guessing.
Deterministic engine stays the calculation source of truth; AI would only
narrate. No model changes needed for a narration layer.
