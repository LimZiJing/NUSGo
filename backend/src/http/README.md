# HTTP request handling

`app.ts` composes the Express request flow. It installs shared middleware, registers the route modules, and attaches the final 404 and error handlers.

## Request order

Requests under `/api` pass through these steps:

1. Set shared response headers.
2. Apply the per-client request limit.
3. Check the CORS origin and preflight request.
4. Check the URL length and parse a bounded JSON body.
5. Run the health, live-data, Journey, or Community Waypoint submission route.
6. Return a safe 404 or error response when needed.

The shared limit runs before CORS and body parsing so rejected origins, malformed bodies, and unknown routes still use the client's request budget.

Journey planning deadlines return HTTP 504 with `planning_timeout`; failures from the walking provider remain HTTP 503 with `provider_unavailable`. A disconnected client cancels planner work without writing a response.

## Tests and related guidance

`app.test.ts` checks the shared policy through Express, including every public route, CORS rejection, and client-IP handling. `routes/journeys.test.ts` checks Journey-specific limits and slot cleanup.

See [the application architecture](../../../docs/agents/architecture.md) for module ownership. See [local services](../../../docs/local-services.md#api-request-limits) for configured limits, client address selection, Cloudflare Tunnel assumptions, and process-local behavior.
## Community Waypoint submissions

`POST /api/community-waypoint-submissions` accepts validated no-photo submission fields and creates a private issue in `LimZiJing/NUSGo-waypoint-submissions`. A new Community Waypoint report requires a category and coordinates. The app derives its display label from reviewed public facts after publication. Optional building, floor, accessibility, details, and private reviewer-note fields are retained for moderation. The backend composes the title, body, and kind/review labels to match the private queue template. It returns a generic 202 receipt without a private issue URL or number. Unsupported fields, reporter identity, photo files, photo URLs or IDs, and URL-like content in supported text fields are rejected.

`COMMUNITY_WAYPOINT_GITHUB_TOKEN` is optional for local startup. Without it, submissions return a safe 503 response. In production, provide a server-only, repository-scoped GitHub credential with issue-creation permission. The route applies an additional process-local limit of three submissions per client per hour; the general API limit also applies. The route never logs submission content or GitHub credentials.
