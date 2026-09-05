# Dietician — AI Response Structure

How the dietician AI is expected to shape a reply, and why the shape matters for
the mobile UI. Read this together with `dietician-mobile-contract.md` (the wire
protocol) and `dietician-backend-changes.md` (how the card mechanism was built).

## Why a reply has structure at all

A chatbot turn is "text in, text out". The dietician is different: some answers
are **better shown than said**. "Rate my lunch" wants a score ring, not a
paragraph of numbers. "Send me a recipe" wants an ingredient list and steps you
can cook from, not prose the user has to re-parse in the kitchen.

So a dietician turn produces **one optional card plus prose**:

```
turn ─┬─ (0 or 1) card   → proposal | rating | recipe   → custom mobile UI
      └─ prose            → streamed text                → normal chat bubble
```

- The **card** is a typed JSON object. Mobile renders it with a dedicated
  widget and, where relevant, an action (confirm a meal, open the full recipe).
- The **prose** is the coach talking: one or two sentences that frame the card
  and tie it to today's calorie/macro budget. When a card is present the prose
  stays short — the card carries the detail.
- A turn with **no card** (most turns: advice, quick facts, small talk) is just
  prose.

There is **at most one card per turn**. The AI never emits two cards in the same
reply.

## The two places the structure shows up

The exact same variants appear on both channels; mobile needs to handle both.

### 1. Live — SSE stream (`POST /dietician/:conversationId/messages`)

The `event:` name **is** the discriminator. No prefix parsing.

| `event:` | `data:` | render as |
|---|---|---|
| `proposal` | `{ "proposal": <MealLogProposal> }` | proposal card |
| `rating` | `{ "rating": <MealRating> }` | rating card |
| `recipe` | `{ "recipe": <Recipe> }` | recipe card |
| `text` | `{ "delta": "…" }` | append to the assistant bubble |
| `done` | `{}` | close the bubble |

**Ordering within a turn:** the card event is emitted *first* (it is produced in
the data-gathering phase), then the `text` deltas stream, then `done`. So a
"recipe" turn looks like:

```
event: recipe   data: {"recipe": {...}}
event: text     data: {"delta": "Here's a "}
event: text     data: {"delta": "light option that fits your "}
event: text     data: {"delta": "500 kcal left today."}
event: done     data: {}
```

Mobile should place the card above the accompanying text bubble in the thread.

### 2. History — `GET /dietician/:conversationId`

Cards are **persisted** (unlike the chatbot, which drops old proposal cards on
reload). On the wire a card is stored as a separate assistant message; the
server decodes it before serializing, so **mobile never sees the internal
`__DIETICIAN_RECIPE__:` / `__DIETICIAN_RATING__:` / `__DIETICIAN_PROPOSAL__:`
prefix** — it only sees the decoded field.

Detection rule for `messages[]`:

```
if (message.proposal) → render proposal card   (content is "")
else if (message.rating) → render rating card  (content is "")
else if (message.recipe) → render recipe card  (content is "")
else → render message.content as a text bubble
```

A card turn therefore reloads as **two assistant messages**: the card message
(`content: ""`, card field set) followed by the prose message (`content: "…"`,
no card field). Render both, card first.

```jsonc
{
  "id": "…", "role": "assistant", "content": "",
  "recipe": { /* Recipe */ }, "origin": "live", "createdAt": "…Z"
},
{
  "id": "…", "role": "assistant",
  "content": "Here's a light option that fits your 500 kcal left today.",
  "origin": "live", "createdAt": "…Z"
}
```

`DieticianMessage` fields: `proposal?`, `rating?`, `recipe?` are mutually
exclusive and only ever appear on `role: "assistant"` messages.

## The card variants

### `recipe` — "send me a recipe"

**When the AI produces it.** The user explicitly asks for a recipe, or asks for
a "lighter / simpler / higher-protein version" of a meal just discussed. The
model calls the `provide_recipe` tool. It is **not** produced for a plain meal
suggestion ("what should I eat for dinner?") — those are answered in prose; the
AI may then *offer* the full recipe and only calls `provide_recipe` once the
user says yes.

**Purpose.** Give the user something cookable, sized to the calories they have
left today, without making them extract ingredients and steps from a paragraph.

**Shape** (`domain/Recipe.ts`):

```ts
interface Recipe {
  title: string;              // "Garlic butter shrimp & greens"
  subtitle?: string;          // short framing line, optional
  timeMinutes: number;
  servings: number;
  calories: number;           // per serving
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams?: number;
  ingredients: { name: string; amount: string }[];  // amount is free text: "200 g", "1 tbsp"
  steps: string[];            // ordered, plain strings
  why?: string;               // one line: why this fits the user's plan
}
```

**Mobile UI.** A recipe card in the thread (title, time/servings, calorie +
macro chips, `why` as a highlighted line) that opens a full recipe view
(ingredients checklist, numbered steps). Actions in the full view:

- **Log this meal** → send a normal message like `"log the <title>"`. That runs
  the ordinary `log_help` → `propose_meal_log` path and comes back as a
  `proposal` card the user confirms. There is no dedicated endpoint.
- **Save recipe** / **Add photo** → on-device only. No backend.

The recipe is never written anywhere server-side and never "confirmed".

### `rating` — "how good is this meal?"

**When the AI produces it.** The user asks how healthy / how good a meal is, or
asks to rate or score a meal they ate or are considering. The model calls the
`rate_meal` tool. **Not** for logging, and not for "what should I eat".

**Purpose.** Turn a judgement call into a single glanceable score plus exactly
one concrete fix — not a list of caveats.

**Shape** (`domain/MealRating.ts`):

```ts
interface MealRating {
  mealName: string;
  score: number;              // 0–10, one decimal. >=7 green, >=4 amber, else red
  macros: {
    totalCalories: number;
    totalProteinGrams: number;
    totalCarbsGrams: number;
    totalFatGrams: number;
  };
  flaggedMacro: 'protein' | 'carbs' | 'fat' | null;  // the one macro that's disproportionate, if any
  goodNote: string;           // one sentence — what's working
  fixNote: string;            // one sentence — the single most useful change
}
```

**Mobile UI.** A score-ring card: the number, colour from the score band, the
macro row (highlight `flaggedMacro` if set), `goodNote` and `fixNote` as two
short lines. No action — it's informational. Replays from history.

### `proposal` — "help me log this"

Unchanged from the chatbot contract — see `dietician-mobile-contract.md` §DTOs.

**When the AI produces it.** The user describes a meal they ate or want to log
(`log_help` intent). The model calls `propose_meal_log`. This tool is **armed
only on `log_help` turns**; `rate_meal` and `provide_recipe` stay armed on every
assisted turn.

**Purpose.** A draft estimate the user reviews and confirms — the dietician
never writes a meal on its own.

**Shape.** `MealLogProposal` = `{ rawDescription: string; entries: FoodEntry[] }`.
Each entry carries `items[]`, `macros`, and `needsUserAction` /
`status: "insufficient_data"` when the estimate is shaky.

**Mobile UI.** The existing proposal card. On confirm →
`POST /dietician/:conversationId/proposals/confirm` with the user-picked
`mealType`. `needsUserAction` → prompt for more detail before allowing confirm.

## How the AI decides — the rules it follows

From `dieticianSystemPrompt.ts`. These are the behaviours mobile can rely on:

1. **One card per turn, max.** Prose always accompanies a card; when a card is
   present the prose is one or two sentences (`DIETICIAN_ADVICE_GUARD`).
2. **Cards are opt-in by intent.** A meal *suggestion* is prose. A recipe is a
   card only on an explicit ask (or an accepted offer). A rating is a card only
   on an explicit "how good is…" / "rate this".
3. **Never paste raw tool output, JSON, or field names into the prose.** The
   card is the structured surface; the prose is plain coach language.
4. **Language mirrors the user.** Prose is in the user's language, including
   after a tool call. Card *labels* are mobile's responsibility — the card
   strings (`title`, `goodNote`, `steps`, …) come back in the user's language.
5. **No writes without confirmation.** Only `proposal` leads to a write, and
   only via the explicit confirm endpoint. `rating` and `recipe` never persist
   anything the user has to undo.
6. **Safety overrides structure.** For disordered eating, pregnancy/nursing,
   chronic illness, medication interactions, under-18, or dangerous calorie
   targets, the AI drops into a non-prescriptive prose reply and produces **no
   card** — it recommends a professional instead.

## Adding a new card type (backend)

Every card follows the `propose_meal_log` → `proposal` pattern. Touch points:

1. `domain/<Card>.ts` — interface + zod schema.
2. `domain/DieticianStreamChunk.ts` — add the `{ type: '<card>'; <card>: … }` variant.
3. `domain/DieticianMessage.ts` — add the optional `<card>?` field.
4. `domain/cardMessageCodec.ts` — add `__DIETICIAN_<CARD>__:` prefix + encode/decode.
5. `adapters/repository/PrismaDieticianConversationRepository.ts` — decode the
   prefix in `toDomainMessage` (no migration — it's a content prefix).
6. `use-cases/tools/<Card>Tool.ts` — implement `DieticianTool` with
   `yieldsCard = '<card>'`. One **cheap** structured-output call inside the
   tool; never a prime completion.
7. `use-cases/RunDieticianTurn.ts` — add a `toLlmMessage` case so the card is
   summarised into history for follow-ups; extend the `yieldsCard` encode
   switch in `gatherContext`.
8. `http/DieticianController.ts` — add the `case '<card>':` to `writeSseChunk`.
9. `http/dieticianRoutes.ts` — construct the tool into the `tools` array.
10. `dieticianSystemPrompt.ts` — one line telling the model when to call it, and
    a line in `DIETICIAN_ADVICE_GUARD` keeping the prose short when it fires.

The card generator must be cheap-tier and read-only. The single prime call per
turn stays the streamed prose.
