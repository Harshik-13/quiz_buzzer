# Quiz Buzzer

Multi-quiz live buzzer system for college quiz events. Built with Next.js, TypeScript, Tailwind CSS, and Vercel KV.

- **No public listing** — participants join only via shared quiz links
- **Organizer auth** — secret-based admin dashboard with full CRUD
- **Per-quiz state** — isolated game state per quiz, concurrent quizzes don't interfere
- **Atomic buzz** — Lua scripts (Redis) / per-quiz mutex (memory) ensure unique server-determined rankings

## Architecture

```
                  ┌─────────────────────┐
Participant ─────>│  /quiz/:publicId     │<── GET /api/quiz/:publicId/state (500ms)
    (browser)     │  Join form, lobby,   │<── POST /api/quiz/:publicId/join
                  │  buzz button, rank   │<── POST /api/quiz/:publicId/buzz
                  └─────────────────────┘

                  ┌─────────────────────┐
Organizer  ──────>│  /dashboard          │<── GET/POST /api/quizzes (CRUD)
    (browser)     │  /quiz/:publicId/    │<── GET/PUT/DELETE /api/quizzes/:id
                  │    manage            │<── POST /api/quizzes/:id/start
                  │    live              │<── POST /api/quizzes/:id/next
                  └─────────────────────┘<── POST /api/quizzes/:id/previous
                                               POST /api/quizzes/:id/end-quiz
                                               POST /api/quizzes/:id/duplicate
                                               POST /api/quizzes/:id/archive
                  ┌─────────────────────┐
                  │  Vercel KV (Redis)   │<── per-quiz state keys
                  │  or in-memory (dev)  │    quiz:{id}:state
                  └─────────────────────┘    publicId:{pubId} → quizId
                                             quiz:index → [id, ...]
```

## Folder Structure

```
src/
  app/
    page.tsx                        Home — links to /participant and /organizer
    participant/page.tsx            Enter quiz link, redirects to /quiz/:publicId
    organizer/page.tsx              Auth gate → redirects to /dashboard
    dashboard/page.tsx              Full organizer dashboard (Live / Drafts / My Quizzes)
    quiz/[publicId]/
      page.tsx                      Participant join + lobby + buzz UI
      manage/page.tsx               Quiz settings (share link, publish, start)
      live/page.tsx                 Live control panel (buzz rankings, participants, navigation)
    api/
      auth/route.ts                 POST — verify admin secret
      quizzes/route.ts              GET — list quizzes (admin), POST — create quiz (admin)
      quizzes/[id]/route.ts         GET/PUT/DELETE — quiz CRUD (admin)
      quizzes/[id]/start/route.ts   POST — start quiz or toggle question (admin)
      quizzes/[id]/next/route.ts    POST — advance question (admin)
      quizzes/[id]/previous/route.tsPOST — go back one question (admin)
      quizzes/[id]/end-quiz/route.tsPOST — finish quiz (admin)
      quizzes/[id]/duplicate/route.tsPOST — copy quiz (admin)
      quizzes/[id]/archive/route.ts POST — archive quiz (admin)
      quiz/[publicId]/route.ts      GET — public quiz metadata
      quiz/[publicId]/state/route.tsGET — per-quiz game state
      quiz/[publicId]/join/route.ts POST — add participant
      quiz/[publicId]/buzz/route.ts POST — submit buzz
  lib/
    types.ts                        Participant, Buzz, GameState, Quiz, QuizStatus types
    kv.ts                           Vercel KV client + in-memory fallback + atomic operations
    admin.ts                        Admin secret validation and organizer ID derivation
```

## Quiz Lifecycle

```
DRAFT ──[Publish]──> PUBLISHED ──[Start]──> RUNNING ──[End Quiz]──> FINISHED
                  \                              │
                   └── participant can join       ├── [Start]  → OPEN (buzzing open)
                                                  ├── [End]    → CLOSED (buzzing closed)
                                                  ├── [Next]   → question++ → CLOSED
                                                  └── [Prev]   → question-- → CLOSED

ARCHIVED (can be archived from any state except RUNNING)
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ADMIN_SECRET` | Yes | Secret key for organizer endpoints. Sent as `x-admin-secret` header. |
| `KV_REST_API_URL` | For production | Vercel KV REST API URL (auto-injected by Vercel, or set manually) |
| `KV_REST_API_TOKEN` | For production | Vercel KV REST API token (auto-injected by Vercel, or set manually) |

Without KV variables, the app uses an in-memory store (**development only** — state resets on server restart, not shared across instances).

## Local Development

```bash
cp .env.example .env.local
# Set ADMIN_SECRET in .env.local
npm run dev
```

Open `http://localhost:3000`.

## Production Deployment (Vercel)

1. Push to GitHub
2. Import into Vercel
3. Add `ADMIN_SECRET` environment variable
4. Add Vercel KV storage (Redis) via the Vercel marketplace
5. Deploy

KV variables are injected automatically by Vercel when KV is linked. The app **requires KV in production** — it refuses to start without it.

## API Overview

### Public Routes (no auth)

#### `GET /api/quiz/:publicId`

Returns quiz metadata (name, description, totalQuestions, status, participantCount). Returns 410 for archived quizzes.

#### `GET /api/quiz/:publicId/state`

Returns the per-quiz game state (currentQuestion, status OPEN/CLOSED, participants, buzzQueue). Polled by participants every 500ms.

#### `POST /api/quiz/:publicId/join`

Add a participant. Body: `{ "name": "string" }`. Returns `{ id, name }`.

Validation: quiz must be PUBLISHED or RUNNING, name required, trimmed, max 50 chars.

#### `POST /api/quiz/:publicId/buzz`

Submit a buzz. Body: `{ "participantId": "uuid" }`. Returns the `Buzz` entry with server-determined rank.

Atomic: uses Redis Lua script in production or per-quiz mutex in development. Guarantees unique sequential ranks under concurrent requests.

### Admin Routes (require `x-admin-secret` header)

#### `GET /api/quizzes`
List quizzes for the authenticated organizer.

#### `POST /api/quizzes`
Create a new quiz. Body: `{ "name", "totalQuestions", "description"? }`.

#### `GET /api/quizzes/:id`
Get quiz by internal ID. Ownership checked.

#### `PUT /api/quizzes/:id`
Update quiz fields (name, description, totalQuestions, status). Ownership checked.

#### `DELETE /api/quizzes/:id`
Delete quiz. Ownership checked.

#### `POST /api/quizzes/:id/start`
Start a DRAFT/PUBLISHED quiz (transitions to RUNNING, opens question 1). If already RUNNING, toggles the current question from CLOSED to OPEN (atomically clears buzzQueue).

#### `POST /api/quizzes/:id/next`
Advance to the next question. If past the last question, finishes the quiz with statistics (winner, completion time).

#### `POST /api/quizzes/:id/previous`
Go back one question. Cannot go below question 1.

#### `POST /api/quizzes/:id/end-quiz`
Finish the quiz immediately with current statistics.

#### `POST /api/quizzes/:id/duplicate`
Create a copy of the quiz with "(Copy)" suffix and fresh DRAFT status.

#### `POST /api/quizzes/:id/archive`
Set quiz status to ARCHIVED. Prevents archiving RUNNING quizzes.

## Key Design Decisions

### Atomic Operations
All state mutations use either Redis Lua scripts (production) or in-memory per-quiz mutexes (development) to prevent race conditions:
- **Join** — no duplicate participants, no lost participants under concurrent requests
- **Buzz** — unique server-determined ranking, no duplicate rankings
- **Start/Next/Previous/End-Quiz** — no interleaved or lost updates

### Quiz Isolation
Each quiz has its own state key (`quiz:{id}:state`). Operations on one quiz never affect another. The legacy global `game:state` key is no longer written by any per-quiz operation.

### Security
- No public quiz listing — participants must have the direct link
- Admin routes require `x-admin-secret` header + organizer ownership validation
- Participant routes are unauthenticated by design (anyone with the quiz link can join)

### Polling
- Participants: every 500ms to `/api/quiz/:publicId/state`
- Organizer live panel: every 300ms to `/api/quiz/:publicId/state` + every 2s to `/api/quizzes` (for FINISHED detection)
- No WebSockets — keeps deployment simple

## Limitations

- No question content storage — tracks question numbers only
- No authentication for participants (join by name)
- No scoring, teams, or answer validation
- No WebSockets — uses HTTP polling
- Memory-only mode is development-only and not shared across instances
