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
  tool listesinden cikarilir; `rate_meal` ve `provide_recipe` ise her turda armed kalir
  (`DieticianTool.yieldsCard` — `'proposal' | 'rating' | 'recipe'` — genellenmis filtre).
- **stream ortasinda hata** — `chatbot-rule.md`'deki sozlesmenin AYNISI: yarim metin
  KAYDEDILMEZ, `STREAM_INTERRUPTED` (IntegrationError) firlatilir, controller SSE `error`
  event'i yollar, turnCount ARTMAZ.

## Diyetisyenin AI asistani — `ports/CoachAccessPort.ts`

- Karar `practice`'te (`ResolveAiAssistant`); burada `adapters/practice/PracticeCoachAccessAdapter.ts`.
  `self` = normal koc · `assistant` = diyetisyenin persona'si · `unavailable` (`disabled` | `off_hours`) = 403.
- `http/coachAccessGuard.ts`: `send` modu (mesaj) acik saat ister; `read` modu (gecmis, proposal onayi) `off_hours`'ta
  da gecer. `disabled` her ikisinde 403 `AI_COACH_UNAVAILABLE_MANAGED_CLIENT`; `off_hours` → `DIETITIAN_AI_OFF_HOURS`.
- `RunDieticianTurn` persona'yi TURUN BASINDA tekrar cozer (guard'dan sonra kapanmis olabilir); `unavailable` → hicbir sey
  yazmadan ayni 403. Lookup hatasi turu DUSURUR (genel koca dusmek diyetisyenin kontrolunu deler).
- Persona varken GENEL KOC PROMPT'U (`DIETICIAN_PERSONA` / `DIETICIAN_GATHER_SYSTEM_PROMPT` / `DIETICIAN_ADVICE_GUARD`)
  KULLANILMAZ — "yemek/porsiyon oner", "tarif teklif et" satirlari diyetisyenin yasaklariyla celisiyor ve kucuk modeller
  sistem prompt'unun tarafini tutuyor. Adapter persona'ya gore `assistantSystemPrompt` / `assistantGatherSystemPrompt`
  (`domain/assistantPersonaBlock.ts`) kurar; oncelik sirasi: kimlik → guvenlik → DIYETISYEN KURALLARI (mutlak) → uslup /
  yaklasim / danisan talimati → notr cevap kurallari → yonlendirme → ornekler. Guvenlik satirlari (`COACH_SAFETY_RULES`)
  ikisinde ORTAK — tek kaynak.
- Cevaptan hemen once SON mesaj `assistantRulesReminder` (kurallar + yonlendirme tekrar). Advice guard'i persona'da
  `assistantAdviceGuard` ("kalori butcesine bagla" itmesi yok).
- Persona varken kart araci ASLA zorlanmaz (`forceToolChoice` yok) — zorlamak kurali kodda deler. Model, kurallar
  prompt'un basindayken karar verir.
- Onizleme (`PreviewAssistantReply`) ayni system prompt + ayni son hatirlatmayi kullanir; farki sadece veri/tool yok.
- Turdaki HER mesaj (user, kartlar, cevap) `dietitianId` ile damgalanir — diyetisyen incelemesi sadece bunlari gorur.
- `AssistantTranscripts` / `PreviewAssistantReply`: `practice` icin public use-case'ler. Onizleme `previewReply`
  (prime, tool yok, feature `dietician:assistant_preview`).
- Proaktif mesaj (nudge) diyetisyen danisanlarina GONDERILMEZ.

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
- `RateMealTool` -> `food-recognition` `RecognizeFromText` (makrolar) + CHEAP structured call
  (skor/not). `ProvideRecipeTool` -> tek CHEAP structured call (tarif). Ikisi de YAZMAZ;
  `yieldsCard` ile `'rating'` / `'recipe'` kart uretir (`Change 1-3`, `dietician-backend-changes.md`).
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
