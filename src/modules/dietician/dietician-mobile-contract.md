# Dietician — Mobile Integration Contract

What the backend exposes for the Flutter dietician feature. Written for whoever
builds `mobile/lib/features/dietician/`.

## TL;DR — how it differs from the existing chatbot

The dietician is a **separate, goal-oriented coaching chat**. The wire protocol
(SSE streaming, proposal cards, confirm flow) is **identical to the chatbot**, so
the SSE parser and proposal DTOs in
`mobile/lib/features/home/data/repositories/api_chat_repository.dart` +
`data/models/chat_*.dart` can be copied almost verbatim.

Differences from chatbot the UI must handle:

| | Chatbot | Dietician |
|---|---|---|
| Purpose | reactive "log this / answer that" | coach toward the plan; ties answers to today's budget |
| Header | none | plan + today's calories-left card (from `GET`) |
| Old proposal cards in history | dropped on reload | **persisted** — replay them |
| Proactive messages | none | messages can have `origin: "proactive"` (dietician reached out) — none are sent yet (nudge job deferred), but render the field |
| Photo → meal | `/chat/.../proposals/photo` | not supported here (text conversation only) |
| Free-tier daily limit | 7 msgs/day | **3 turns/day** (`FREE_TIER_DAILY_LIMIT` → upsell) |

## Endpoints

Base path `/dietician`. All require `Authorization: Bearer <accessToken>`.
`conversationId` is a **client-generated UUID**, fixed for the life of one thread
(doubles as `x-trace-id`). A user can have many threads.

### 1. `POST /dietician/:conversationId/messages` — send a message (SSE stream)

Headers: `Authorization`, `Content-Type: application/json`,
`Accept: text/event-stream`, `x-trace-id: <conversationId>`.

Body:
```json
{ "content": "what should I eat for dinner?", "timeZone": "Europe/Istanbul" }
```
`content` 1–4000 chars. `timeZone` is an IANA name — used to resolve the user's
local day for "today's intake".

**Response is Server-Sent Events** (`200`, `Content-Type: text/event-stream`).
Event sequence:

| `event:` | `data:` payload | meaning |
|---|---|---|
| *(comment `: connected`)* | — | stream is open |
| `thinking` | `{"status":"thinking"}` | heartbeat every ~2s while working; show typing indicator |
| `proposal` | `{"proposal": <MealLogProposal>}` | a meal draft — render a proposal card (only on "log this meal" turns) |
| `text` | `{"delta":"partial text "}` | append to the current assistant bubble |
| `done` | `{}` | turn finished, close the bubble |
| `error` | `{"code":"...","retryAfterSeconds"?:N}` | turn failed mid-stream — see error codes |

A turn is usually: many `text` deltas → `done`. A "log this" turn:
`proposal` → `text` deltas → `done`.

If the request fails **before streaming starts** (bad body, auth, rate limit),
you get a normal JSON error instead of an SSE stream:
`4xx { "error": { "code": "...", "message": "..." } }`.

### 2. `GET /dietician/:conversationId?timeZone=Europe/Istanbul` — history + header

`200`:
```json
{
  "conversation": {
    "id": "…", "userId": "…", "createdAt": "2026-09-03T…Z",
    "turnCount": 4, "digest": { … } | null, "digestTurn": 4,
    "messages": [
      { "id": "…", "conversationId": "…", "role": "user",
        "content": "what should I eat?", "origin": "live", "createdAt": "…Z" },
      { "id": "…", "role": "assistant", "content": "Have grilled chicken…",
        "origin": "live", "createdAt": "…Z" },
      { "id": "…", "role": "assistant", "content": "",
        "proposal": { …MealLogProposal… }, "origin": "live", "createdAt": "…Z" }
    ]
  },
  "header": {
    "plan": {
      "goal": "lose", "dailyCalories": 1800,
      "proteinG": 140, "carbsG": 160, "fatG": 60,
      "currentWeightKg": 82, "targetWeightKg": 75,
      "workoutsPerWeek": 3, "age": 31, "gender": "male"
    } | null,
    "snapshot": {
      "date": "2026-09-03", "consumedCalories": 1200,
      "remainingCalories": 600, "loggedMealTypes": ["breakfast","lunch"]
    } | null
  }
}
```

- Calling `GET` on a fresh `conversationId` **creates** the thread (empty
  `messages`) and returns it — same as chatbot.
- `messages[].role` in practice is only `"user"` or `"assistant"`.
- A message with a non-empty `proposal` and `content: ""` → render a proposal
  card, not a text bubble.
- `origin: "proactive"` → the dietician messaged first; style it distinctly.
- `header.plan` / `header.snapshot` are `null` if the user hasn't onboarded /
  has no logged data — hide or placeholder the header card.
- `digest` is internal state; the UI can ignore it.

### 3. `POST /dietician/:conversationId/proposals/confirm` — save a proposed meal

Body:
```json
{
  "mealType": "dinner",              // breakfast | lunch | dinner | snack — user picks
  "timeZone": "Europe/Istanbul",
  "date": "2026-09-03",              // optional, defaults to today in timeZone
  "applyMode": "append"              // append | replace_meal_slot, default append
}
```
`201 { "mealItem": { …nutrition-logging MealItem… } }`. Identical semantics to
`POST /chat/.../proposals/confirm`. After a successful confirm, re-fetch the
day / analytics as you already do post-chatbot-confirm.

## DTOs

### `MealLogProposal` (same shape as chatbot's)
```json
{
  "rawDescription": "chicken sandwich",
  "entries": [
    {
      "id": "uuid", "userId": "…", "source": "text",
      "status": "completed",                         // or "insufficient_data"
      "needsUserAction": false,
      "items": [
        { "name": "Sandwich", "portionGrams": 220, "calories": 450,
          "proteinGrams": 30, "carbsGrams": 40, "fatGrams": 15 }
      ],
      "macros": { "totalCalories": 450, "totalProteinGrams": 30,
                  "totalCarbsGrams": 40, "totalFatGrams": 15 }
    }
  ]
}
```
`needsUserAction: true` / `status: "insufficient_data"` → prompt the user to add
detail before confirming (reuse the chatbot proposal-card behavior).

## Error codes

Delivered as an SSE `error` event mid-stream, or a JSON `error.code` before the
stream starts.

| code | HTTP | UI |
|---|---|---|
| `INVALID_REQUEST_BODY` | 400 | bug — shouldn't happen with a valid client |
| `UNAUTHENTICATED` / 401 | 401 | refresh token, retry once (as chatbot does) |
| `RATE_LIMIT_EXCEEDED` | 429 | "slow down" toast; `retryAfterSeconds` may be present |
| `FREE_TIER_DAILY_LIMIT` | 429 | **show the upgrade / upsell sheet** (daily coaching limit) |
| `DIETICIAN_CONVERSATION_NOT_FOUND` | 404 | thread belongs to someone else — start a new one |
| `MEAL_PROPOSAL_NOT_FOUND` / `MEAL_PROPOSAL_EMPTY` | 400 | proposal expired — ask again |
| `LLM_RATE_LIMITED` / `LLM_OVERLOADED` / `LLM_UPSTREAM_UNAVAILABLE` | 429/503 | "try again in a moment"; honor `retryAfterSeconds` |
| `STREAM_INTERRUPTED` | — | the reply was cut off; show a "tap to retry" affordance. **The backend did NOT save a partial reply**, so retrying is safe |

## Suggested screen

- **Header card**: goal chip, a calories-left ring/number from
  `header.snapshot.remainingCalories`, `header.plan.dailyCalories` as the target,
  maybe `loggedMealTypes` as filled/empty meal dots.
- **Thread**: reuse chatbot bubbles + proposal card. Proactive messages get a
  small "Dietician" avatar/label.
- **Composer**: text field + send. Quick-action chips that just send preset
  `content` strings: "What should I eat now?", "Review my day", "Am I on track?".
- **Empty state**: a short intro + the same quick-action chips.

## Not in scope yet (backend deferred)

- Push notifications / proactive nudges — the `origin: "proactive"` field exists
  but nothing produces those messages yet. Don't build notification handling for
  this feature now; just don't crash on the field.
- No photo entry point in the dietician thread.
