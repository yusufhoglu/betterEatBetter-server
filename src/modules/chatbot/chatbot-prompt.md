# Claude Code Prompt — `src/modules/chatbot/`

Aşağıdaki prompt'u olduğu gibi Claude Code'a verebilirsin. `chatbot-rule.md` ve
`shared-rule.md`'yi (LLM Client bölümü dahil) aynı klasöre koyup referans ver.

**ÖN KOŞUL**: `shared/llm/` eki (`shared-llm-prompt.md`) tamamlanmış olmalı.

---

## PROMPT

```
Bu bir TypeScript backend projesi (food-tracking mobil uygulaması). shared/ (llm/
alt katmanı DAHİL), identity/, food-recognition/, onboarding-plan/, goal-management/,
nutrition-logging/, daily-tracking/, body-analytics/ zaten kurulu. Şimdi
src/modules/chatbot/ modülünü kuracağız.

Aynı klasördeki chatbot-rule.md ve shared-rule.md dosyalarını oku, TÜM kurallarına
harfiyen uy. ÖZELLİKLE:

1. Bu modül OpenAI/Anthropic SDK'sını DOĞRUDAN import ETMEZ — sadece shared/llm/
   LlmClient'ı, kendi LlmChatPort'u üzerinden.
2. Tool-calling döngüsü complete() ile loop'lanır, SADECE son (tool çağrısı içermeyen)
   yanıt streamComplete() ile yayınlanır.
3. MAX_TOOL_TURNS (varsayılan 5) sonsuz döngü koruması ZORUNLU, test edilmeli.
4. tools/MealDataTool.ts ve tools/AnalyticsSummaryTool.ts, nutrition-logging ve
   body-analytics'in public use-case'lerini DOĞRUDAN import eder — o modüllerin
   domain/adapters klasörlerine DOKUNMAZ.
5. trace_id = conversationId (sohbet boyunca sabit), her mesajda ayrıca messageId.
6. Context window: basit "son N mesaj" kırpma (özetleme YOK bu turda).

Repoda bu modüle ait test.todo stub'ları olabilir — tara, SİLİP yeniden yazma, DOLDUR.

Oluşturulacak yapı:

src/modules/chatbot/
  domain/
    Conversation.ts
    Message.ts

  context/
    trimConversationHistory.ts
    trimConversationHistory.test.ts

  use-cases/
    SendMessage.ts
    SendMessage.test.ts
    GetConversationHistory.ts
    GetConversationHistory.test.ts
    tools/
      MealDataTool.ts
      MealDataTool.test.ts
      AnalyticsSummaryTool.ts
      AnalyticsSummaryTool.test.ts

  ports/
    LlmChatPort.ts
    ConversationRepositoryPort.ts

  adapters/
    llm/
      SharedLlmChatAdapter.ts
      SharedLlmChatAdapter.test.ts
    repository/
      PrismaConversationRepository.ts
      PrismaConversationRepository.integration.test.ts

  rateLimiting/
    chatRateLimiter.ts

  test-utils/
    fakes/
      FakeLlmChatPort.ts
      InMemoryConversationRepository.ts

  http/
    ChatController.ts   -> SSE endpoint
    chatRoutes.ts

Prisma şeması (mevcut modelleri BOZMA):

model Conversation {
  id        String    @id @default(uuid())
  userId    String
  createdAt DateTime  @default(now())
  messages  Message[]
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  role           String       // 'system'|'user'|'assistant'|'tool'
  content        String
  createdAt      DateTime     @default(now())
}

Beklentiler:
- Gerçek, çalışan, derlenebilir TypeScript kodu — placeholder/TODO YOK.
- Her hata durumu shared/errors/ taksonomisinden bir sınıf kullanmalı.
- TÜM testleri yaz, ÇALIŞTIR, geçene kadar düzelt.
- SADECE chatbot modülüne dokun, başka hiçbir özellik modülüne dokunma (tools/
  köprülerinin sadece DIŞARIYA import yaptığını, hedef modülleri DEĞİŞTİRMEDİĞİNİ
  unutma).
```

---

## Tamamlama Raporu (Claude Code işin sonunda bunu doldurmalı)

### 1. Ne yapıldı
### 2. Rule dosyasındaki hangi kurallara karşılık geldiği
### 3. Karşılaşılan/düzeltilen sorunlar
### 4. Test sonuçları (özellikle MAX_TOOL_TURNS testi ve tool köprü testleri)
### 5. Rule/Prompt'tan bilinçli sapma var mı
