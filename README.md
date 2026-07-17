# Quiz Buzzer

Live buzzer system for college quiz events. Built with Next.js, TypeScript, Tailwind CSS, and Vercel KV.

## Architecture

- **Next.js App Router** — API routes + React client components
- **Vercel KV** — shared game state (Redis via Upstash)
- **HTTP Polling** — participants poll every 500ms, organizer polls every 300ms
- **No WebSockets, No Express, No SQL**

```
Participant  ──GET /api/state (500ms)──>  Next.js API  ──>  Vercel KV
                POST /api/join                     │
                                                   │
Organizer   ──GET /api/state (300ms)──>            │
                POST /api/start                    │
                POST /api/end                      │
                POST /api/next                     │
```

## Folder Structure

```
src/
  app/
    page.tsx              Home — links to /participant and /organizer
    participant/
      page.tsx            Participant join + waiting + buzz UI
    organizer/
      page.tsx            Organizer dashboard with controls
    api/
      state/route.ts      GET — full game state
      join/route.ts       POST — add participant
      buzz/route.ts       POST — submit buzz
      start/route.ts      POST — open question (admin)
      end/route.ts        POST — close question (admin)
      next/route.ts       POST — advance question (admin)
  lib/
    types.ts              Participant, Buzz, GameState types
    kv.ts                 Vercel KV client with in-memory fallback
    admin.ts              Admin secret validation
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ADMIN_SECRET` | Yes | Secret key for organizer endpoints. Sent as `x-admin-secret` header. |
| `KV_URL` | For deployment | Vercel KV REST API URL (auto-injected by Vercel) |
| `KV_REST_API_TOKEN` | For deployment | Vercel KV REST API token (auto-injected by Vercel) |

Without KV variables, the app uses an in-memory store (development only — state resets on server restart).

## Local Development

```bash
cp .env.example .env.local
# Set ADMIN_SECRET in .env.local
npm run dev
```

Open `http://localhost:3000` — joins as participant, or navigate to `/organizer` for the dashboard.

## Production Deployment (Vercel)

1. Push to GitHub
2. Import into Vercel
3. Add `ADMIN_SECRET` environment variable
4. Add Vercel KV storage (Redis) via the Vercel marketplace
5. Deploy

KV variables (`KV_URL`, `KV_REST_API_TOKEN`) are injected automatically by Vercel when KV is linked.

## API Overview

### `GET /api/state`

Returns the full game state. No auth required.

```json
{
  "currentQuestion": 0,
  "status": "CLOSED",
  "participants": [],
  "buzzQueue": []
}
```

### `POST /api/join`

Add a participant. Body: `{ "name": "string" }`. Returns `{ id, name }`.

Validation: name required, trimmed, max 50 characters.

### `POST /api/buzz`

Submit a buzz. Body: `{ "participantId": "uuid" }`. Returns the `Buzz` entry.

Validates: question must be OPEN, participant must exist, no duplicate buzz.

### `POST /api/start` (admin)

Opens the current question for buzzing. Clears buzzQueue. Requires `x-admin-secret` header.

### `POST /api/end` (admin)

Closes the current question. Requires `x-admin-secret` header.

### `POST /api/next` (admin)

Advances to the next question (increments, sets CLOSED, clears buzzQueue). Requires `x-admin-secret` header.

## Question Lifecycle

```
CLOSED → [START] → OPEN (buzzing accepted) → [END] → CLOSED → [NEXT] → question++ → CLOSED → repeat
```

## Limitations

- Single quiz session — one game at a time
- No authentication (participants join by name)
- No scoring, no teams, no answer validation
- Buzz ranking based on server reception order — near-simultaneous requests have a small race window
- No WebSockets — uses HTTP polling (500ms participant, 300ms organizer)
