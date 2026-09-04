# Dietician — backend changes for the mobile feature

The mobile Coach tab (`mobile/lib/features/dietician/`) is built and shipped
against the **current** wire contract. The coaching chat — SSE turn pipeline,
tiered LLM, plan/day header, `propose_meal_log` + confirm, rolling digest,
nudge job, rate limiting — is **already done** and needs no changes.

Two things the mobile UI renders that the backend does **not** produce yet,
plus one product decision. Everything below follows the existing
`propose_meal_log` → `proposal` pattern exactly.

---

## Change 1 — "rate my meal" → a `rating` card

**What the app does today:** a "rate my lunch — chicken & rice bowl" turn comes
back as a plain `advice` paragraph. The app shows it as a text bubble.

**Target:** the model calls a `rate_meal` tool during the gather loop; the tool
output is streamed as `event: rating` and persisted, so the app draws the
score-ring card (and replays it on reload).

### 1a. Domain — `domain/MealRating.ts` (new)

```ts
export interface MealRating {
  mealName: string;
  /** 0–10, one decimal. Mobile: >=7 green, >=4 amber, else red. */
  score: number;
  macros: {
    totalCalories: number;
    totalProteinGrams: number;
    totalCarbsGrams: number;
    totalFatGrams: number;
  };
  /** 'protein' | 'carbs' | 'fat' | null — the macro to flag as "high". */
  flaggedMacro: 'protein' | 'carbs' | 'fat' | null;
  goodNote: string; // one sentence, what's working
  fixNote: string;  // one sentence, the single most useful change
}

export const mealRatingSchema = z.object({ /* mirror the above, z.number().min(0).max(10) etc. */ });
```

### 1b. Codec — extend `domain/proposalMessageCodec.ts` (or a sibling `cardMessageCodec.ts`)

Same content-prefix trick — **no Prisma migration**:

```ts
export const RATING_MESSAGE_PREFIX = '__DIETICIAN_RATING__:';
export const RECIPE_MESSAGE_PREFIX = '__DIETICIAN_RECIPE__:';
// encodeRatingMessage / decodeRatingMessage — copy encode/decodeProposalMessage verbatim
```

### 1c. Repository — `adapters/repository/PrismaDieticianConversationRepository.ts`

In `toDomainMessage`, decode the new prefixes alongside the proposal one:

```ts
function toDomainMessage(row: PrismaDieticianMessage): DieticianMessage {
  const proposal = decodeProposalMessage(row.content);
  const rating = decodeRatingMessage(row.content);
  const recipe = decodeRecipeMessage(row.content);
  const isCard = Boolean(proposal || rating || recipe);
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as DieticianMessageRole,
    content: isCard ? '' : row.content,
    origin: row.origin as DieticianMessageOrigin,
    ...(proposal ? { proposal } : {}),
    ...(rating ? { rating } : {}),
    ...(recipe ? { recipe } : {}),
    createdAt: row.createdAt,
  };
}
```

Add `rating?: MealRating` / `recipe?: Recipe` to `domain/DieticianMessage.ts`.
The `GET /:id` response serializes `DieticianConversation` straight to JSON, so
`messages[].rating` / `messages[].recipe` then appear **for free** — the mobile
DTO parser already reads them.

### 1d. Stream chunk — `domain/DieticianStreamChunk.ts`

```ts
export type DieticianStreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'proposal'; proposal: MealLogProposal }
  | { type: 'rating'; rating: MealRating }
  | { type: 'recipe'; recipe: Recipe };
```

### 1e. Tool — `use-cases/tools/RateMealTool.ts` (new)

Model on `ProposeMealLogTool`. It should **not** write anything. Options for
where the numbers come from:

- **Cheap path:** the tool bridges to `food-recognition`'s `RecognizeFromText`
  for the macros (same as `propose_meal_log`), then a small structured
  cheap-model call scores it against the plan context passed in `context`.
- **Prime path:** the tool just returns the macros + the plan snapshot and the
  *scoring* happens in the prime `streamAdvice` call — but then it isn't a
  clean card. Prefer the cheap structured call inside the tool.

```ts
readonly definition = {
  name: 'rate_meal',
  description:
    "Use when the user asks how good / how healthy a meal is, or to rate a meal " +
    "they ate or are considering. Produces a 0–10 score with one concrete fix. " +
    "Not for logging (use propose_meal_log) and not for 'what should I eat'.",
  inputSchema: { /* { description: string } */ },
};
readonly yieldsCard = 'rating' as const;   // see Change 3
```

### 1f. Orchestration — `use-cases/RunDieticianTurn.ts`

In `gatherContext`, generalize the `tool.yieldsProposal` branch (Change 3) so a
`rate_meal` result is `yield`ed as `{ type: 'rating', rating }` **and**
persisted via `appendMessage(conversationId, 'assistant', encodeRatingMessage(rating), 'live')`.

Also add a `toLlmMessage` case so a persisted rating is summarised into history
for follow-ups ("show me the lighter version"):

```ts
if (message.rating) {
  return { role: 'assistant', content:
    `Rated "${message.rating.mealName}" ${message.rating.score}/10. Fix: ${message.rating.fixNote}` };
}
```

---

## Change 2 — "send me a recipe" → a `recipe` card + full view

Identical shape to Change 1.

### 2a. Domain — `domain/Recipe.ts` (new)

```ts
export interface RecipeIngredient { name: string; amount: string; }
export interface Recipe {
  title: string;
  subtitle?: string;
  timeMinutes: number;
  servings: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams?: number;
  ingredients: RecipeIngredient[];
  steps: string[];       // plain strings, ordered
  why?: string;          // one line: why this fits the user's plan
}
export const recipeSchema = z.object({ /* … */ });
```

### 2b. Tool — `use-cases/tools/ProvideRecipeTool.ts` (new)

```ts
readonly definition = {
  name: 'provide_recipe',
  description:
    "Use when the user explicitly asks for a recipe, or asks for a 'lighter " +
    "version' / variant of a meal just discussed. Returns a full recipe sized " +
    "to the calories the user has left. Never for a plain meal suggestion " +
    "(answer those in prose).",
  inputSchema: { /* { request: string, targetCalories?: number } */ },
};
readonly yieldsCard = 'recipe' as const;
```

Generate the recipe with **one cheap structured-output call** inside the tool
(pass the plan context + today's snapshot so `calories`/`why` are grounded).
Do **not** spend a prime completion on this — the prime call is still the
streamed prose that accompanies the card.

### 2c. Persistence / codec / stream chunk / history summary

Exactly as Change 1 (`RECIPE_MESSAGE_PREFIX`, `decodeRecipeMessage`,
`{ type: 'recipe', recipe }`, `toLlmMessage` case).

### 2d. No new endpoint for "Log this meal" from a recipe

The mobile recipe view's **Log this meal** button sends a normal
`"log the <title>"` message — that hits the existing `log_help` → `propose_meal_log`
path. Nothing to build. "Save recipe" + "add photo" are **on-device only**;
there is no recipe-collection endpoint and the app doesn't expect one.

---

## Change 3 — generalize the tool card-yield mechanism

`RunDieticianTurn.gatherContext` currently special-cases `tool.yieldsProposal`.
Replace with a discriminated marker so all three cards flow through one branch:

```ts
// DieticianTool.ts
export interface DieticianTool {
  readonly definition: LlmToolDefinition;
  /** When set, execute()'s output is also yielded as this stream-chunk type + persisted. */
  readonly yieldsCard?: 'proposal' | 'rating' | 'recipe';
  execute(userId, input, context): Promise<unknown>;
}
```

```ts
// RunDieticianTurn.gatherContext, inside the tool-call loop
if (tool?.yieldsCard) {
  const card = output;
  const encoded =
    tool.yieldsCard === 'proposal' ? encodeProposalMessage(card as MealLogProposal)
    : tool.yieldsCard === 'rating' ? encodeRatingMessage(card as MealRating)
    : encodeRecipeMessage(card as Recipe);
  await this.conversationRepository.appendMessage(input.conversationId, 'assistant', encoded, 'live');
  yield { type: tool.yieldsCard, [tool.yieldsCard]: card } as DieticianStreamChunk;
}
```

Keep `armedTools` filtering: `rate_meal` and `provide_recipe` are armed for
`advice` / `quick_fact` / `log_help` intents; the existing `!yieldsProposal`
filter for the non-`log_help` lanes becomes "arm `propose_meal_log` only on
`log_help`", the other two cards stay armed.

---

## Change 4 — controller SSE serialization

`http/DieticianController.ts` → `writeSseChunk` currently has a two-way
if/else. Make it exhaustive:

```ts
function writeSseChunk(res: Response, chunk: DieticianStreamChunk): void {
  switch (chunk.type) {
    case 'text':
      res.write(`event: text\ndata: ${JSON.stringify({ delta: chunk.delta })}\n\n`); break;
    case 'proposal':
      res.write(`event: proposal\ndata: ${JSON.stringify({ proposal: chunk.proposal })}\n\n`); break;
    case 'rating':
      res.write(`event: rating\ndata: ${JSON.stringify({ rating: chunk.rating })}\n\n`); break;
    case 'recipe':
      res.write(`event: recipe\ndata: ${JSON.stringify({ recipe: chunk.recipe })}\n\n`); break;
  }
}
```

Wire the two new tools into `http/dieticianRoutes.ts` `tools = [...]` (they need
`RecognizeFromText` and the cheap LLM client — already constructed there).

---

## Change 5 — system prompt

`dieticianSystemPrompt.ts` — add two lines next to the existing
`propose_meal_log` instruction:

- "When the user asks how good a meal is, or to rate/score a meal, call
  `rate_meal` — give exactly one concrete fix, not a list."
- "When the user asks for a recipe (or a lighter/simpler version of a meal
  just discussed), call `provide_recipe`. Size it to the calories they have
  left today."

And in `DIETICIAN_ADVICE_GUARD`: "If a `rate_meal` or `provide_recipe` card was
produced this turn, keep the prose to one or two sentences — the card carries
the detail."

---

## Change 6 — free-tier gate (product decision)

The contract says `FREE_DAILY_DIETICIAN_LIMIT` = 3 turns/day for free users.
**Mobile now hard-locks the whole feature to premium** — a non-premium user
never reaches the thread (they get a paywall on the Coach tab). So:

- **Option A (matches mobile):** gate the routes on premium. Add
  `premiumOnlyMiddleware` (subscription module already has `req.isPremium`
  from `premiumContextMiddleware`) to all three `/dietician/*` routes; it
  rejects non-premium with `403 { error: { code: 'PREMIUM_REQUIRED' } }`. Then
  `FREE_DAILY_DIETICIAN_LIMIT` is dead code for this module — keep the burst
  limits, drop the daily-quota check.
- **Option B (keep a taste):** leave it as-is (3 free turns/day) and change
  mobile back to a soft gate. More conversion surface, more prime-model spend
  on non-payers.

Recommend **A** — it's what shipped, and every dietician turn is a prime
completion. If you take A, also make `GET /dietician/:id` premium-only so a
lapsed subscriber can't keep pulling history.

---

## Already done — no change needed

- SSE endpoint, `: connected`, `thinking` heartbeat every 2s, `done`, `error`
  with `retryAfterSeconds`.
- `GET /dietician/:id?timeZone=` — creates on first hit, returns
  `{ conversation, header: { plan, snapshot } }`; `loggedMealTypes`,
  `remainingCalories` all present.
- `origin: 'proactive'` field + the nudge job (mobile renders the field, does
  not act on it).
- `POST /proposals/confirm` — unchanged, recipe/rating never confirm.
- `DIETICIAN_CONVERSATION_NOT_FOUND` on someone else's thread.

---

## Test checklist

- `RunDieticianTurn.test.ts` — add cases: `rate_meal` tool call →
  yields `{type:'rating'}` + persists an encoded message; `provide_recipe` →
  `{type:'recipe'}`. Reload the conversation → `messages[].rating` /
  `.recipe` decode back, `content === ''`.
- `PrismaDieticianConversationRepository.integration.test.ts` — round-trip a
  rating message and a recipe message.
- `DieticianController` — SSE frames for the two new events
  (`FakeLlmDieticianPort` returns the tool calls).
- Prompt eval (if the suite exists): "rate my breakfast: 3 eggs and toast"
  routes to `rate_meal`, not `propose_meal_log`; "give me a high-protein
  dinner recipe" routes to `provide_recipe`, not a prose suggestion.
- If Option A: a non-premium token gets `403 PREMIUM_REQUIRED` on all three
  routes.
