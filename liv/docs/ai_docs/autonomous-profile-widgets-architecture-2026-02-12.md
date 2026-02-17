# Autonomous Profile Widgets Architecture (2026-02-12)

## Goal
Turn the `Profile` page into a widget-driven intelligence panel where:
- each widget can be enabled/disabled by the user,
- background agents populate only active widgets,
- output remains persistent, inspectable, and easy to extend.

## End-to-end flow
1. Auto-journal run finishes in `src/main/services/auto-journal-service.ts`.
2. Service calls:
   - `refreshAutonomousKanban()`
   - `refreshAutonomousProfile()`
3. `refreshAutonomousProfile()` reads:
   - latest runs from `recordings/auto-journal/runs/*.json`
   - current widget config from `configStore.get().profileWidgetsEnabled`
4. Profile cards are generated per active widget and persisted to:
   - `recordings/auto-agent/profile-board.json`
5. Renderer fetches board via TIPC:
   - `getAutonomousProfileBoard`
6. Profile UI displays:
   - widget toggles,
   - week/day filters,
   - sectioned card grid.

## Main files
- Backend generation:
  - `src/main/services/autonomous-profile-service.ts`
- Pipeline trigger:
  - `src/main/services/auto-journal-service.ts`
- IPC exposure:
  - `src/main/tipc.ts`
- Shared contracts:
  - `src/shared/types.ts`
- UI:
  - `src/renderer/src/pages/pile/Profile/index.jsx`
  - `src/renderer/src/pages/pile/Profile/Profile.module.scss`
- Config defaults:
  - `src/main/config.ts`

## Widget model
Widget IDs are defined in `AutonomousProfileWidgetId`:
- `work_time_daily`
- `parallelism`
- `engagement_topics`
- `meeting_suggestions`
- `top_projects`
- `top_people`
- `business_opportunities`
- `focus_risks`

Each generated card now carries `widgetId`, so provenance and filtering are explicit.

## Persistence and source of truth
- Runtime output:
  - `recordings/auto-agent/profile-board.json`
- User preference:
  - `config.json` field `profileWidgetsEnabled`
- Durable memory notes:
  - `recordings/auto-agent/MEMORY.md`
  - `recordings/auto-agent/memory/YYYY-MM-DD.md`

## How widget toggling works
1. User toggles widget chip in Profile page.
2. Renderer calls `saveConfig({ ...config, profileWidgetsEnabled: [...] })`.
3. Renderer immediately calls `refreshAutonomousProfile()`.
4. New board is generated only with active widgets.

## Extension guide
To add a new widget:
1. Add ID to `AutonomousProfileWidgetId` in `src/shared/types.ts`.
2. Add metadata entry in `AVAILABLE_WIDGETS` (`autonomous-profile-service.ts`).
3. Add generation logic block in `buildCards(...)`, gated by `enabledSet.has("<new_id>")`.
4. Optionally add section grouping rule in Profile UI.
5. Update this doc with behavior and data assumptions.

## Operational notes
- The service intentionally uses deterministic heuristics over activity summaries.
- No external LLM call is required for widget generation, keeping this layer local and cheap.
- If old persisted board schema is found, `getAutonomousProfileBoard()` re-generates board automatically.
