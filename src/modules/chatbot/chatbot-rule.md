# Chatbot Modülü — Rule

Bu dosya `src/modules/chatbot/` altında kod yazarken uyulması gereken kuralları
listeler. Referans: `backend-architecture.md` §8.8, `shared-rule.md` (özellikle
"LLM Client" bölümü), `daily-tracking-rule.md`/`body-analytics-rule.md` (tool
köprüleri için).

**Ön koşul**: `shared/llm/` eki tamamlanmış olmalı. Değilse DURUN.

---

## `LlmChatPort` — `shared/llm/LlmClient`'a ince bir sarmalayıcı

- Bu modülün KENDİ Port'u: `ports/LlmChatPort.ts` —
  `sendTurn(messages, tools?): Promise<LlmTurnResult>` (tool-calling turları için) ve
  `streamFinalReply(messages): AsyncIterable<string>` (son metin yanıtı için).
- `adapters/llm/SharedLlmChatAdapter.ts`, bu Port'u `shared/llm/LlmClient`'ın
  `complete()`/`streamComplete()`'ini çağırarak implemente eder — `feature: 'chatbot'`
  etiketiyle (maliyet takibi için).
- Bu modül HİÇBİR ZAMAN OpenAI/Anthropic SDK'sını doğrudan import ETMEZ, sadece
  `shared/llm/`'i.

## Streaming ortasında hata — BİLİNEN bir sınır, ÖZELLİKLE ele alınmalı

- `shared/llm/`'deki resilience (circuit breaker/retry) SADECE stream'in başlamasını
  korur — akış ortasında bağlantı koparsa (kısmi metin zaten kullanıcıya gönderilmiş
  olabilir), retry YAPILMAZ (yarım yayınlanmış içeriği güvenle tekrarlamak mümkün
  değil, bu bilinçli bir mimari sınır, `shared/llm/`'in kendi raporunda belgelendi).
- Bu yüzden `SendMessage`/`ChatController`, stream ortasında bir hata (exception/
  connection drop) yakaladığında:
  1. O ana kadar STREAM EDİLMİŞ kısmi metni (varsa) `role: 'assistant'` olarak
     KAYDETMEZ (yarım/kesik bir mesajı geçmişe kalıcı olarak eklemek, bir sonraki
     turda modele yanlış/eksik context verir) — bunun yerine hatayı SSE üzerinden
     bir `error` event'i olarak client'a iletir.
  2. Kullanıcıya `code: 'STREAM_INTERRUPTED'` ile net bir hata döner — mobil taraf
     bunu görüp "tekrar dene" UX'i gösterebilir (backend hazır bir mesaj metni
     TAŞIMAZ, sadece kod).
  3. Konuşma geçmişinde YARIM bir assistant mesajı KALMAZ — bir sonraki kullanıcı
     mesajı, kesintiden önceki temiz geçmişin üzerine eklenir.

## Tool-calling döngüsü — `complete()` ile loop, `streamComplete()` ile son yanıt

```
SendMessage.execute(conversationId, userMessage):
  1. Geçmiş + yeni mesaj birleştirilir (context window sınırı uygulanır, aşağıya bkz.)
  2. LOOP: llmChatPort.sendTurn(messages, availableTools) çağrılır
     - Sonuç tool çağrısı içeriyorsa: ilgili tool (bkz. tools/) çalıştırılır,
       sonucu 'tool' rolüyle messages'a eklenir, LOOP TEKRARLANIR
     - Sonuç tool çağrısı içermiyorsa (ya da max tool-turn sayısına ulaşıldıysa,
       bkz. aşağı): LOOP biter
  3. llmChatPort.streamFinalReply(messages) çağrılır, sonuç AsyncIterable<string>
     olarak use-case'ten yield edilir (Controller bunu SSE ile client'a iletir)
  4. Stream bittiğinde, TAM yanıt metni ConversationRepositoryPort'a kaydedilir
```

- **Sonsuz tool-calling döngüsü koruması**: max 5 tool-turn (env: `MAX_TOOL_TURNS`,
  varsayılan 5) — bu sayıya ulaşılırsa LOOP zorla kesilir, mevcut mesajlarla
  `streamFinalReply` çağrılır (model "elindeki bilgiyle" cevap vermek zorunda kalır).

## `tools/` — modüller arası köprüler, DOĞRUDAN erişim YASAK

- `tools/MealDataTool.ts`: `nutrition-logging/GetDaySummary` (ve varsa
  `GetLoggedMealTypesForDateRange`) use-case'lerini DOĞRUDAN import edip çağırır.
- `tools/AnalyticsSummaryTool.ts`: `body-analytics`'in ilgili public use-case'lerini
  (örn. `GetBodyStats`, `GetMealAverages`) DOĞRUDAN import edip çağırır.
- Her tool, `shared/llm/types.ts`'teki `LlmToolDefinition` formatında bir şema
  (`name`, `description`, `inputSchema`) + bir `execute(input): Promise<result>`
  fonksiyonu olarak dışa açılır — `SendMessage` bu listeyi `sendTurn`'e `tools`
  parametresi olarak geçirir.
- `chatbot`, `nutrition-logging`/`body-analytics`'in `domain/`/`adapters/`
  klasörlerine ASLA dokunmaz — sadece bu köprüler üzerinden, tıpkı `GetActivePlan`/
  `GetLoggedMealTypesForDateRange` pattern'i gibi.

## Konuşma geçmişi ve context window

- `context/trimConversationHistory.ts` (pure fonksiyon): mesaj sayısı bir eşiği
  (env: `MAX_CONTEXT_MESSAGES`, varsayılan 20) aştığında, EN ESKİ mesajlar
  kırpılır (basit "son N mesaj" penceresi — özetleme YOK bu turda, o bir
  zenginleştirme).
- Sistem mesajı (varsa persona/talimat) HER ZAMAN korunur, kırpma dışı tutulur.

## Trace ID — `conversationId` = `trace_id`, `messageId` ayrı

- Daha önce karar verdiğimiz gibi: `x-trace-id` header'ı = `conversationId` (sohbet
  boyunca SABİT). Her mesaj isteği AYRICA bir `messageId` (UUID, her seferinde yeni)
  taşır, loglara ikinci bir alan olarak eklenir.
- `ChatController.ts`, gelen `x-trace-id`'yi `conversationId` ile EŞLEŞTİRİR (aynı
  olduğunu doğrular ya da yoksa `conversationId`'yi trace context'e yazar).

## Rate limiting

- `shared/rateLimiting/checkRateLimit('chat:${userId}', limit, windowSeconds)` —
  LLM çağrısı maliyetli olduğu için sınırlı. Öneri: 20 mesaj/dakika (env'den
  ayarlanabilir).

## Diğer kurallar (shared/'den miras)

- Hata taksonomisi, DI, config, trace context (`AsyncLocalStorage`) —
  `shared-rule.md`'deki gibi.
- Test altyapısı: testcontainers + `pgvector/pgvector:pg16`, `beforeAll` içinde
  env-sonrası dinamik import.
- **Repoda bu modüle ait `test.todo` stub'ları olabilir** — tarayın, SİLİP yeniden
  yazmak yerine DOLDURUN.

---

## Test Stratejisi

### Unit — `context/`
- `trimConversationHistory.test.ts`: eşik altı/üstü senaryolar, sistem mesajının
  her zaman korunduğu.

### Unit — `use-cases/` (fake `LlmChatPort` + fake tool'larla)
- `SendMessage.test.ts`:
  - Tool çağrısı OLMADAN direkt yanıt akışı.
  - Tool çağrısı İÇEREN akış: fake tool'un çağrıldığı, sonucun mesaj geçmişine
    eklendiği, `sendTurn`'ün İKİNCİ kez (tool sonucuyla) çağrıldığı.
  - `MAX_TOOL_TURNS`'e ulaşıldığında loop'un zorla kesildiği (KRİTİK — sonsuz
    döngü koruması test edilmeli).
  - Stream tamamlandığında tam mesajın repository'ye kaydedildiği.
  - **Stream ortasında hata (fake `streamFinalReply`'nin yarıda exception fırlatması)
    senaryosu**: yarım mesajın repository'ye KAYDEDİLMEDİĞİ, `STREAM_INTERRUPTED`
    kodunun döndüğü (KRİTİK — bu, `shared/llm/`'in bilinen sınırının chatbot
    tarafında doğru ele alındığının kanıtı).

### Cross-module
- `MealDataTool.test.ts`, `AnalyticsSummaryTool.test.ts`: gerçek
  `nutrition-logging`/`body-analytics` use-case importlarıyla (fake değil).

### Integration — `adapters/`
- `PrismaConversationRepository.integration.test.ts`: testcontainers,
  `pgvector/pgvector:pg16`.
- `SharedLlmChatAdapter.test.ts`: fake `shared/llm/LlmClient` ile, `feature: 'chatbot'`
  etiketinin doğru geçirildiği doğrulanır.

**Tüm testler yazıldıktan sonra çalıştırılıp geçtiği doğrulanmalı.**
