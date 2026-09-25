# FuelUp — Mobile QA Checklist (Phase 10)

Real-device runs only. Mark every item **PASS** / **FAIL** / **BLOCKED** /
**NOT TESTED**. Never mark PASS without performing the step on that device.
Settings → App → Diagnostics shows platform, standalone, SW, sync, and
camera state while testing.

## Android (Chrome, installed PWA)

| # | Area | Step | Result |
|---|------|------|--------|
| A1 | Install | Open in Chrome → install prompt/banner → install → standalone launches | NOT TESTED |
| A2 | Login | Sign in (Clerk) in standalone mode; session persists after app restart | NOT TESTED |
| A3 | Dashboard | No horizontal overflow at 360px; cards readable; bottom nav clear of gesture bar | NOT TESTED |
| A4 | Food search | Type query; numeric keyboard for quantity; log 2 rotis + dal | NOT TESTED |
| A5 | AI text | "3 eggs and 250 ml milk" → review → confirm → FoodLog correct | NOT TESTED |
| A6 | Camera | Scan Meal → permission prompt → preview → Capture → Analyze → review | NOT TESTED |
| A7 | Camera retake | Retake releases old preview; no camera indicator after close | NOT TESTED |
| A8 | Label scan | Photograph a label → edit one field → Save → found in Search → log 20 g → scaling correct; no auto FoodLog | NOT TESTED |
| A9 | Recipes | Create recipe with cooked yield; log 150 g; duplicate; delete keeps history | NOT TESTED |
| A10 | Workout | Start → add sets (weight/reps keyboards) → background 2 min → finish → exactly one workout | NOT TESTED |
| A11 | Metrics | Log weight; trend chart shows actual + trend lines | NOT TESTED |
| A12 | Habits | Complete habit; heatmap cell fills for today | NOT TESTED |
| A13 | Heatmap | Month view correct at month boundary; streak count matches | NOT TESTED |
| A14 | Offline | Airplane mode → log food + weight + habit → heatmap/analytics update | NOT TESTED |
| A15 | Reconnect | Network back → sync → no duplicates → target/energy state intact | NOT TESTED |
| A16 | SW update | Deploy → update banner appears → Reload applies without losing draft | NOT TESTED |
| A17 | Reduced motion | Enable "Remove animations" → no infinite motion | NOT TESTED |
| A18 | Export | Settings → Data → Export → JSON downloads with all collections | NOT TESTED |
| A19 | Import | File picker → preview counts → Restore → dashboard/history/analytics rebuilt | NOT TESTED |
| A20 | Import dialog | Preview readable at 360px; Cancel/Restore reachable with keyboard open | NOT TESTED |
| A21 | Quick actions | FAB Repeat Last → prefilled review; Log Water +1; no silent logs | NOT TESTED |
| A22 | Target rate | Settings → Target Rate 0.5 → 0.4 → history shows old/new rates | NOT TESTED |

## iOS (Safari, Add to Home Screen)

| # | Area | Step | Result |
|---|------|------|--------|
| I1 | Install | Safari → Share → Add to Home Screen → standalone (no Safari chrome), icon correct | NOT TESTED |
| I2 | Login | Sign in standalone; session persists after force-quit + relaunch | NOT TESTED |
| I3 | Dashboard | No overflow at 390px; content clear of notch + home indicator | NOT TESTED |
| I4 | Food | Search → quantity keyboard → log meal | NOT TESTED |
| I5 | Camera | Scan Meal → permission → capture → analyze → review → confirm | NOT TESTED |
| I6 | Camera denied | Deny permission → upload fallback offered; no crash | NOT TESTED |
| I7 | Label scan | Label photo → review → save → search → log | NOT TESTED |
| I8 | Recipes | Create/edit/log/duplicate/delete-keeps-history | NOT TESTED |
| I9 | Workout | Sets entry; lock screen mid-workout; finish → one workout, synced | NOT TESTED |
| I10 | Metrics | Weight entry; trend overlay renders | NOT TESTED |
| I11 | Habits | Complete; heatmap correct | NOT TESTED |
| I12 | Offline | Airplane mode → full local use incl. heatmap/analytics; no blank screens | NOT TESTED |
| I13 | Reconnect | Sync without duplicates; energy state reproducible | NOT TESTED |
| I14 | SW update | Banner → Reload → no lost AI review/camera session (user controls timing) | NOT TESTED |
| I15 | Safe area | Header/nav/sheets/camera controls clear notch + home indicator | NOT TESTED |
| I16 | Export | Settings → Data → Export → JSON downloads (Files app) | NOT TESTED |
| I17 | Import | File picker → preview → Restore → data rebuilt; no duplicates after sync | NOT TESTED |
| I18 | Quick actions | FAB Repeat Last → prefilled review; Log Water +1; no silent logs | NOT TESTED |
| I19 | Target rate | Settings → Target Rate change → history records old/new rates | NOT TESTED |

## Release gates

| Gate | Rule | Status |
|------|------|--------|
| Automated | `tsc`, `lint`, `test` (392), `build`, `prisma generate+validate` green | PASS (CI/dev machine) |
| Security audit | `npm audit` reviewed; no production-reachable criticals | PASS (with notes) |
| PWA | Manifest/icons/SW/offline page valid; no private caching | PASS (automated guards) |
| Data | Offline + sync safe; export/reset verified | PASS (automated) / device NOT TESTED |
| Mobile | Real-device checklist above completed | **NOT TESTED — release blocked on this gate** |
