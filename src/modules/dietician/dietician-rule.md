# Dietician Modulu — Rule

`src/modules/dietician/` altinda kod yazarken uyulacak kurallar. Referans:
`chatbot-rule.md` (tool koprusu + stream-interrupt sozlesmesi), `shared-rule.md`
("LLM Client"), `nutrition-logging-rule.md` / `body-analytics-rule.md` / `onboarding-plan-rule.md`.

---

## Iki model katmani — `shared/llm/modelTiers.ts`

- `adapters/llm/TieredLlmDieticianAdapter.ts` bu modulde `shared/llm/`'e dokunan TEK dosyadir.
  `LlmClient` + `structuredOutput` uzerine kurulur, provider-specific tip SIZDIRMAZ.
- Katman secimi ADAPTER'in isidir, use-case'in degil:
  - `classifyIntent`, `runContextGathering`, `streamSmalltalk`, `summarizeConversation` -> `resolveModel('cheap')`
  - `streamAdvice` -> `resolveModel('prime')` — turda YALNIZCA BIR kez, sadece sentez asamasinda.
- Her cagriya kendi `feature` etiketi: `dietician:classify|gather|smalltalk|advice|digest`.
  Bu etiketleri degistirmeyin — maliyet takibi bunlara bagli.
- OpenAI/Anthropic SDK'sini ASLA dogrudan import etmeyin.

## `RunDieticianTurn` — pipeline

```
1. Repo.findOrCreate + appendMessage(user, origin='live')
2. history = trimHistory([...gecmis, yeni], DIETICIAN_MAX_CONTEXT_MESSAGES)
   (system mesajlari her zaman korunur — shared/llm/conversation/trimHistory.ts)
3. intent = llm.classifyIntent(...)            // CHEAP, structured output
4. context block = buildDieticianContextBlock({ plan, snapshot, digest })
   -> role:'system' mesaji olarak history'nin BASINA eklenir (eager context)
5. intent === 'smalltalk'  -> llm.streamSmalltalk (CHEAP)
   aksi halde              -> gatherContext (CHEAP tool loop) sonra llm.streamAdvice (PRIME)
6. streamAndPersist: TAM metin bitince appendMessage(assistant)
7. incrementTurnCount; (turnCount - digestTurn >= DIETICIAN_DIGEST_EVERY_N_TURNS) ise
   llm.summarizeConversation (CHEAP) + saveDigest — HATA YUTULUR, turu dusurmez
```

- **Sonsuz tool-calling korumasi**: `DIETICIAN_MAX_GATHER_TURNS` (varsayilan 3). Asilirsa
  loop zorla kesilir, eldeki mesajlarla `streamAdvice` cagrilir.
- **`propose_meal_log` sadece `intent === 'log_help'` iken armed edilir.** Diger turlarda
  tool listesinden cikarilir (`yieldsProposal` filtresi).
- **stream ortasinda hata** — `chatbot-rule.md`'deki sozlesmenin AYNISI: yarim metin
  KAYDEDILMEZ, `STREAM_INTERRUPTED` (IntegrationError) firlatilir, controller SSE `error`
  event'i yollar, turnCount ARTMAZ.

## Eager context — neden tool degil

Plan hedefleri + bugunku ozet + digest her turda `system` mesaji olarak enjekte edilir.
Boylece dietician kullaniciyi bir tool round-trip harcamadan tanir. Volatile/agir veri
(gecmis gunlerin ogunleri, analytics) TOOL yolunda kalir.

- `PlanContextPort` -> `onboarding-plan` `GetUserProfile` + `GetActivePlan` (public use-case).
- `DailySnapshotPort` -> `nutrition-logging` `GetDayNutrientTotals` (HAFIF use-case;
  `GetDaySummary`'nin foto/S3 zenginlestirmesi YOK — her turda cagrildigi icin ucuz olmali).
- Context lookup HATASI turu dusurmez — `null` ile devam, sadece `logger.warn`.

## `use-cases/tools/` — moduller arasi kopruler, DOGRUDAN erisim YASAK

- `DieticianMealDataTool` -> `nutrition-logging` `GetDayNutrientTotals` + `GetLoggedMealTypesForDateRange`.
- `DieticianAnalyticsTool` -> `body-analytics` `GetBodyStats` + `GetMealAverages`.
- `ProposeMealLogTool` -> `food-recognition` `RecognizeFromText`. SADECE yeni draft uretir;
  draft revizyonu chatbot akisidir, burada YOK.
- Her tool `DieticianTool` sekli: `definition` (`LlmToolDefinition`) + `execute(...)`.
- `chatbot` modulunden HICBIR SEY import edilmez (kendi `MealLogProposal`, kendi codec,
  kendi `trimHistory` re-export'u degil dogrudan `shared/llm/conversation/trimHistory`).

## Yazma islemi — SADECE `ConfirmMealProposal`

Dietician tek yazma islemini ancak kullanicinin acik onayiyla yapar (`.../proposals/confirm`).
Proposal `role:'assistant', content:''` + `proposal` JSON olarak DB'ye yazilir
(`proposalMessageCodec` prefix'i). Gecmis tekrar yuklendiginde eski proposal'lar gorunur
(chatbot'un aksine — dietician'da kaliciler).

## Rate limiting

`rateLimiting/dieticianRateLimiter.ts`, `POST /:conversationId/messages` uzerinde
`premiumContext`'ten SONRA. Uc kontrol, chat'le ayni sekil, ayri bucket'lar:
`dietician:user:<id>`, `dietician:global:<tier>`, free gunluk kota `dietician:<id>`
(`FREE_DAILY_DIETICIAN_LIMIT`, chat'ten dusuk).

## Digest

`ConversationDigest` = `{ goalsRecap, adviceGivenRecap, openThreads, learnedPreferences }`
(hepsi string). `dietician_conversations.digest` (JSONB) + `digestTurn`. Okurken
`conversationDigestSchema.safeParse` — bozuksa `null` (eski/uyumsuz digest turu dusurmez).

---

## Test Stratejisi

### Unit — `domain/`
- `dieticianContext.test.ts`: `buildDieticianContextBlock` — plan/snapshot/digest kombinasyonlari, bos -> null.

### Unit — `use-cases/` (fake `LlmDieticianPort` + fake tool + in-memory repo)
- `RunDieticianTurn.test.ts`:
  - smalltalk lane: sadece CHEAP stream, gather/advice YOK.
  - assisted lane: gather loop calisir, sonra `streamAdvice`.
  - `propose_meal_log` sadece `log_help`'te armed.
  - `log_help`: proposal chunk HEMEN yield edilir + DB'ye yazilir.
  - `DIETICIAN_MAX_GATHER_TURNS` asiminda sentez zorlanir (KRITIK).
  - digest esikte yenilenir; digest hatasi turu DUSURMEZ.
  - stream ortasinda hata -> yarim mesaj yazilmaz + `STREAM_INTERRUPTED` + turnCount artmaz (KRITIK).

### Cross-module
- `use-cases/tools/DieticianMealDataTool.test.ts`: gercek `nutrition-logging` use-case importlariyla.

### Adapter
- `adapters/llm/TieredLlmDieticianAdapter.test.ts` (fake `LlmClient`): her metodun DOGRU model
  katmanini ve `feature` etiketini kullandigi.
- `adapters/repository/PrismaDieticianConversationRepository.integration.test.ts`:
  testcontainers `pgvector/pgvector:pg16`; digest round-trip, `origin`, `turnCount`, sahiplik.

### Rate limiter
- `rateLimiting/dieticianRateLimiter.test.ts`: uc bucket, premium gunluk kotayi atlar.

**Tum testler yazildiktan sonra calistirilip gectigi dogrulanmali.**
