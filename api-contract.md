# eatBetter Chatbot API Contract

This document defines the exact backend contract the mobile app must use for the **chatbot + meal draft** feature as of **August 24, 2026**.

This contract now covers all three chat-driven cases:

1. General chatbot conversation
2. Text-first meal drafting and confirmation
3. Photo-estimate follow-up, where the user revises the detected gramaj/ingredients through chat and then confirms

---

## 1. Authentication

All endpoints require:

```http
Authorization: Bearer <access_token>
```

---

## 2. Core Model

The backend treats chat meal estimation as a **proposal lifecycle**:

1. Chat produces or revises a `proposal`
2. Mobile renders that proposal inside the chat UI
3. User confirms from inside the chat UI
4. Mobile calls the confirm endpoint
5. Backend writes the confirmed data to nutrition logging

Important:

- Chat does **not** save meals automatically
- Chat does **not** decide `mealType`
- Mobile must still choose `mealType`
- A proposal can be created from:
  - plain text chat
  - a photo estimate
  - a revision of an earlier proposal

---

## 3. Trace / Conversation Rules

- `conversationId` is supplied by mobile
- the same `conversationId` must be reused for the whole chat thread
- backend uses `conversationId` as the request trace id
- mobile may send:

```http
x-trace-id: <conversationId>
```

- if mobile sends a different `x-trace-id`, backend ignores it and responds with:

```http
x-trace-id: <conversationId>
```

Recommendation:

- generate one UUID on mobile when a new chat thread starts
- persist it locally for that thread
- reuse it for all `/chat/:conversationId/*` calls

---

## 4. Shared Schemas

### 4.1 Food Item

```json
{
  "name": "Pilav",
  "portionGrams": 280,
  "calories": 370,
  "proteinGrams": 7,
  "carbsGrams": 77,
  "fatGrams": 3,
  "vitaminAMcg": 0,
  "vitaminCMg": 0,
  "vitaminDMcg": 0,
  "calciumMg": 0,
  "ironMg": 0,
  "potassiumMg": 0,
  "cholesterolMg": 0
}
```

### 4.2 Food Entry

```json
{
  "id": "entry-1",
  "userId": "user-1",
  "source": "text",
  "status": "completed",
  "items": [],
  "macros": {
    "totalCalories": 370,
    "totalProteinGrams": 7,
    "totalCarbsGrams": 77,
    "totalFatGrams": 3
  },
  "nutrients": {},
  "needsUserAction": false,
  "errorCode": "string",
  "createdAt": "2026-08-24T00:00:00.000Z"
}
```

Rules:

- `source` is one of: `"photo" | "barcode" | "text" | "search"`
- `status` is one of: `"processing" | "completed" | "insufficient_data" | "failed"`

### 4.3 Meal Proposal

```json
{
  "rawDescription": "10 kasik pilav yedim",
  "entries": [
    {
      "id": "entry-1",
      "userId": "user-1",
      "source": "photo",
      "status": "completed",
      "items": [
        {
          "name": "Pilav",
          "portionGrams": 280,
          "calories": 370,
          "proteinGrams": 7,
          "carbsGrams": 77,
          "fatGrams": 3
        }
      ],
      "macros": {
        "totalCalories": 370,
        "totalProteinGrams": 7,
        "totalCarbsGrams": 77,
        "totalFatGrams": 3
      },
      "needsUserAction": false,
      "createdAt": "2026-08-24T00:00:00.000Z"
    }
  ]
}
```

Rules:

- `mealType` is deliberately absent
- proposal is chat state, not persisted meal logging state
- latest proposal in a conversation is used by the confirm endpoint

### 4.4 Confirmed Meal Item

The confirm endpoint returns a normal nutrition-logging `MealItem`:

```json
{
  "id": "meal-item-1",
  "userId": "user-1",
  "date": "2026-08-24T00:00:00.000Z",
  "mealType": "lunch",
  "entries": [
    {
      "id": "logged-entry-1",
      "name": "Pilav",
      "source": "photo",
      "portionGrams": 280,
      "calories": 370,
      "proteinG": 7,
      "carbsG": 77,
      "fatG": 3
    }
  ],
  "createdAt": "2026-08-24T10:00:00.000Z",
  "updatedAt": "2026-08-24T10:00:00.000Z"
}
```

---

## 5. Endpoints

### 5.1 POST `/chat/:conversationId/messages`

**Description**: Sends one user message and receives the assistant response as an SSE stream.

**Headers**:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
Accept: text/event-stream
x-trace-id: <conversationId>
```

**Request Body**:

```json
{
  "content": "Ben 10 kasik pilav yedim, sence kac gram?"
}
```

**Validation**:

- `content` is required
- `content` must be string
- min length: `1`
- max length: `4000`

**Response**:

- HTTP `200 OK`
- `Content-Type: text/event-stream`

#### `event: text`

```text
event: text
data: {"delta":"Yaklasik "}
```

Schema:

```json
{
  "delta": "string"
}
```

Notes:

- append all `text` chunks to build the assistant bubble

#### `event: proposal`

```text
event: proposal
data: {"proposal":{"rawDescription":"10 kasik pilav yedim","entries":[{"id":"entry-1","userId":"user-1","source":"photo","status":"completed","items":[{"name":"Pilav","portionGrams":280,"calories":370,"proteinGrams":7,"carbsGrams":77,"fatGrams":3}],"macros":{"totalCalories":370,"totalProteinGrams":7,"totalCarbsGrams":77,"totalFatGrams":3},"needsUserAction":false,"createdAt":"2026-08-24T00:00:00.000Z"}]}}
```

Schema:

```json
{
  "proposal": {
    "rawDescription": "string",
    "entries": []
  }
}
```

Semantics:

- proposal can be a fresh meal draft
- proposal can be a revised version of the current draft
- if the current conversation already contains a proposal and the model decides to revise it, the new `proposal` event replaces the previous proposal state from the mobile perspective

Practical meaning for mobile:

- show/update the proposal card
- keep only the latest proposal as the active confirmable draft

#### `event: error`

```text
event: error
data: {"code":"STREAM_INTERRUPTED"}
```

Schema:

```json
{
  "code": "string"
}
```

#### `event: done`

```text
event: done
data: {}
```

Notes:

- marks successful stream completion

**Pre-stream Error Response**:

Example `400 Bad Request`:

```json
{
  "error": {
    "code": "INVALID_REQUEST_BODY",
    "message": "String must contain at least 1 character(s)"
  },
  "code": "INVALID_REQUEST_BODY",
  "message": "String must contain at least 1 character(s)"
}
```

Possible known codes:

- `INVALID_REQUEST_BODY`
- `INVALID_PARAMS`
- `MISSING_ACCESS_TOKEN`
- `CONVERSATION_NOT_FOUND`
- `RATE_LIMIT_EXCEEDED`
- `STREAM_INTERRUPTED`
- `INTERNAL_ERROR`

---

### 5.2 GET `/chat/:conversationId`

**Description**: Returns the full persisted conversation history.

**Headers**:

```http
Authorization: Bearer <access_token>
```

**Success Response `200 OK`**:

```json
{
  "id": "conv-123",
  "userId": "user-123",
  "createdAt": "2026-08-24T10:00:00.000Z",
  "messages": [
    {
      "id": "msg-1",
      "conversationId": "conv-123",
      "role": "user",
      "content": "10 kasik pilav yedim",
      "createdAt": "2026-08-24T10:00:10.000Z"
    },
    {
      "id": "msg-2",
      "conversationId": "conv-123",
      "role": "assistant",
      "content": "",
      "proposal": {
        "rawDescription": "10 kasik pilav yedim",
        "entries": []
      },
      "createdAt": "2026-08-24T10:00:11.000Z"
    },
    {
      "id": "msg-3",
      "conversationId": "conv-123",
      "role": "assistant",
      "content": "Istersen bunu oglende kaydedebilirsin.",
      "createdAt": "2026-08-24T10:00:12.000Z"
    }
  ]
}
```

Message schema:

```json
{
  "id": "string",
  "conversationId": "string",
  "role": "system | user | assistant | tool",
  "content": "string",
  "proposal": {
    "rawDescription": "string",
    "entries": []
  },
  "createdAt": "ISO-8601 datetime"
}
```

Notes:

- `proposal` is optional
- if `proposal` exists, `content` may be empty string
- render `proposal` messages as proposal cards
- conversation history may contain multiple proposals over time
- for confirmation UX, mobile should treat the **latest proposal in the message list** as the active one

---

### 5.3 POST `/chat/:conversationId/proposals/photo`

**Description**: Seeds the chat with a proposal created from an already recognized photo result.

This is for case 3:

- user uploads photo
- backend photo recognition returns estimate
- user is not satisfied
- mobile opens chat tied to the same meal flow
- mobile calls this endpoint once to turn the photo estimate into the active chat proposal
- user continues revising via normal `/messages` SSE chat

**Headers**:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:

```json
{
  "mealPhotoId": "photo-123"
}
```

**Success Response `201 Created`**:

```json
{
  "proposal": {
    "rawDescription": "Photo estimate from meal photo photo-123",
    "entries": [
      {
        "id": "photo-123",
        "userId": "user-1",
        "source": "photo",
        "status": "completed",
        "items": [],
        "macros": {
          "totalCalories": 0,
          "totalProteinGrams": 0,
          "totalCarbsGrams": 0,
          "totalFatGrams": 0
        },
        "needsUserAction": false,
        "createdAt": "2026-08-24T10:00:00.000Z"
      }
    ]
  }
}
```

Known error codes:

- `FOOD_ENTRY_NOT_FOUND`
- `FOOD_ENTRY_NOT_READY`
- `FOOD_ENTRY_FAILED`
- `INVALID_REQUEST_BODY`
- `INVALID_PARAMS`

Notes:

- this also persists the seeded proposal into conversation history
- after this call, the next `/messages` turn can revise that photo-based proposal

---

### 5.4 POST `/chat/:conversationId/proposals/confirm`

**Description**: Confirms the latest proposal in the conversation and writes it to nutrition logging.

This endpoint is the backend action for the confirm button shown inside the chat UI.

**Headers**:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:

```json
{
  "mealType": "lunch",
  "timeZone": "Europe/Istanbul",
  "date": "2026-08-24",
  "applyMode": "append"
}
```

Schema:

```json
{
  "mealType": "breakfast | lunch | dinner | snack",
  "timeZone": "string",
  "date": "YYYY-MM-DD",
  "applyMode": "append | replace_meal_slot"
}
```

Rules:

- `mealType` is required
- `timeZone` is required
- `date` is optional
- if `date` is omitted, backend resolves "today" using `timeZone`
- if `applyMode` is omitted, backend uses `"append"`

Meaning of `applyMode`:

- `append`
  - adds the proposal entries into the target meal slot
  - use this for normal "add this meal" behavior
- `replace_meal_slot`
  - replaces the entire target meal slot with the proposal entries
  - use this when chat is acting as a correction flow for an already drafted meal slot

**Success Response `201 Created`**:

```json
{
  "mealItem": {
    "id": "meal-item-1",
    "userId": "user-1",
    "date": "2026-08-24T00:00:00.000Z",
    "mealType": "lunch",
    "entries": [
      {
        "id": "logged-entry-1",
        "name": "Pilav",
        "source": "photo",
        "portionGrams": 280,
        "calories": 370,
        "proteinG": 7,
        "carbsG": 77,
        "fatG": 3
      }
    ],
    "createdAt": "2026-08-24T10:05:00.000Z",
    "updatedAt": "2026-08-24T10:05:00.000Z"
  }
}
```

Known error codes:

- `MEAL_PROPOSAL_NOT_FOUND`
- `MEAL_PROPOSAL_EMPTY`
- `CONVERSATION_NOT_FOUND`
- `INVALID_REQUEST_BODY`
- `INVALID_TIME_ZONE`
- `INVALID_DATE`

Notes:

- backend confirms the **latest persisted proposal** in that conversation
- after successful confirm, backend also appends a plain assistant message indicating the meal was saved

---

## 6. Mobile Integration Flows

### 6.1 General chatbot only

1. Create/reuse `conversationId`
2. Call `POST /chat/:conversationId/messages`
3. Render text chunks
4. If a `proposal` appears, show a proposal card

### 6.2 Text-first meal drafting

Example user messages:

- "1 tabak pilav yedim"
- "2 cay kasigi yag ekledim"
- "Bence 250 gramdi, tekrar hesapla"

Recommended flow:

1. Open normal `/messages` SSE chat
2. When proposal event arrives, render/update proposal card
3. Let user choose `mealType`
4. On confirm button tap, call `POST /chat/:conversationId/proposals/confirm`
5. Use returned `mealItem` as the saved result

### 6.3 Photo estimate follow-up

Recommended flow:

1. User uploads photo through food recognition flow
2. Poll `/food/photo/:mealPhotoId` until ready
3. If user wants refinement through chat:
   - create/reuse a dedicated `conversationId`
   - call `POST /chat/:conversationId/proposals/photo` once
4. Render seeded proposal card
5. Continue normal `/messages` SSE chat for clarifications:
   - "10 kasik pilav yedim"
   - "2 cay kasigi yag vardi"
   - "pirinci 280 gram yap"
6. Each new `proposal` event replaces the current draft
7. On confirm, call `POST /chat/:conversationId/proposals/confirm`
8. Use:
   - `append` if this should add into a meal slot
   - `replace_meal_slot` if this should fully overwrite the meal slot draft

---

## 7. Rendering Rules

### 7.1 Chat history rendering

Render by message shape:

- `role=user` => user bubble
- `role=assistant` + `proposal` exists => proposal card
- `role=assistant` + non-empty `content` => assistant bubble

### 7.2 Active proposal rule

When more than one proposal exists in a conversation:

- use the latest proposal in message order as the active draft
- older proposal cards may remain visible in history
- confirm button should act on the latest proposal only

### 7.3 Confirm button rule

The confirm button belongs to the chat proposal card UI, but the action is:

- not another SSE chat request
- not direct mobile-side meal assembly
- always `POST /chat/:conversationId/proposals/confirm`

---

## 8. Non-Goals / Important Limits

- Chatbot still does not save meals automatically
- Chatbot still does not choose `mealType`
- SSE response is still stream-based, not final JSON
- a single stream may contain both `proposal` and `text`
- if streaming breaks mid-response, backend does not persist a partial assistant text message
- proposal revision is conversation-scoped, not global
- backend confirms the latest proposal only, not an arbitrary historical one

---

## 9. Recommended Client Types

```ts
type ChatSseTextEvent = {
  delta: string;
};

type ChatFoodItem = {
  name: string;
  portionGrams: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  vitaminAMcg?: number;
  vitaminCMg?: number;
  vitaminDMcg?: number;
  calciumMg?: number;
  ironMg?: number;
  potassiumMg?: number;
  cholesterolMg?: number;
};

type ChatFoodEntry = {
  id: string;
  userId: string;
  source: 'photo' | 'barcode' | 'text' | 'search';
  status: 'processing' | 'completed' | 'insufficient_data' | 'failed';
  items: ChatFoodItem[];
  macros: {
    totalCalories: number;
    totalProteinGrams: number;
    totalCarbsGrams: number;
    totalFatGrams: number;
  };
  nutrients?: Record<string, unknown>;
  needsUserAction: boolean;
  errorCode?: string;
  createdAt: string;
};

type MealLogProposal = {
  rawDescription: string;
  entries: ChatFoodEntry[];
};

type ChatSseProposalEvent = {
  proposal: MealLogProposal;
};

type ChatHistoryMessage = {
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  proposal?: MealLogProposal;
  createdAt: string;
};

type SeedPhotoProposalRequest = {
  mealPhotoId: string;
};

type SeedPhotoProposalResponse = {
  proposal: MealLogProposal;
};

type ConfirmMealProposalRequest = {
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  timeZone: string;
  date?: string;
  applyMode?: 'append' | 'replace_meal_slot';
};

type LoggedMealEntry = {
  id: string;
  name: string;
  source?: string;
  portionGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

type MealItem = {
  id: string;
  userId: string;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  entries: LoggedMealEntry[];
  createdAt: string;
  updatedAt: string;
};
```
