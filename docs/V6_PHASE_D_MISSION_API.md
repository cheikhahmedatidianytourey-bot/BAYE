# BAYE V6 Phase D — authenticated Mission API

This branch adds an API layer for the V6 mission engine, durable store, and bounded worker.

## Configuration
- `BAYE_MISSION_TOKEN`: required secret, at least 32 characters. API endpoints return 503 if missing/weak.
- `BAYE_MISSION_DIRECTORY`: optional storage directory. Defaults to `/var/data/baye-missions`; configure a Render persistent disk mounted at `/var/data` before relying on stored missions.
- `AI_API_KEY`: required to execute tasks; provider endpoint/model overrides remain supported.

## Endpoints (Bearer token required)
- `GET /api/missions/status` — limits and execution scope.
- `POST /api/missions` — create mission; body `{goal,tasks,constraints?}`, 1–10 tasks.
- `GET /api/missions` — list missions.
- `GET /api/missions/:id` — inspect mission.
- `POST /api/missions/:id/run` — execute one ready task per call.

## Safety / limitations
- This API is single-process and intended for one instance only; no distributed locks, lease, scheduler, or multi-instance coordination.
- Tasks are text-only AI processing; no arbitrary tools, browser, shell, account access, purchases, posting, or external side-effect execution is enabled.
- All endpoints use a single shared bearer token (not per-user authentication); this is an internal/early-stage integration, not ready for public multi-tenant use.
- Each mission is limited to 10 tasks and each worker request advances one task. Retries are bounded to two attempts.
- Persistence depends on an actual mounted persistent disk; filesystem storage on ephemeral service storage may be lost on restart/deploy.
- Verify CI and review before merge or deployment.
