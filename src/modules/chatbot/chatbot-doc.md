# Chatbot Modulu Developer Doc

Bu modul LLM tabanli konusma deneyimini, tool-calling ile repo icindeki diger modullere baglayarak sunar. Maliyet ve kontrol riskleri nedeniyle en sik guardrail gerektiren modul budur.

## Mimari Ozeti

- `http/ChatController.ts` chat endpointlerini expose eder.
- `use-cases/SendMessage.ts` ana orchestration akisidir; conversation history okur, tool loop yapar ve son cevabi uretir.
- `use-cases/tools/` altindaki kopruler chatbot'un diger modullere hangi sinirdan erisecegini belirler.
- `ports/LlmChatPort.ts` ve `adapters/llm/SharedLlmChatAdapter.ts` provider-agnostic LLM erisimini saglar.
- `adapters/repository/PrismaConversationRepository.ts` mesaj gecmisini ve meal proposal durumunu saklar.

## Endpointler

| Method | Path | Aciklama |
| --- | --- | --- |
| `POST` | `/chat/:conversationId/messages` | Mesaj gonderir, gerekirse tool kullanarak cevap uretir |
| `GET` | `/chat/:conversationId` | Konusma gecmisini getirir; yoksa bos conversation olusturup dondurur |
| `POST` | `/chat/:conversationId/proposals/photo` | Food photo sonucundan meal proposal seed eder |
| `POST` | `/chat/:conversationId/proposals/confirm` | Meal proposal'i nutrition logging'e yazar |

## Sequence Diagramlari

### `POST /chat/:conversationId/messages`

```mermaid
sequenceDiagram
    actor Client
    participant Controller as ChatController
    participant UseCase as SendMessage
    participant Repo as PrismaConversationRepository
    participant LLM as SharedLlmChatAdapter
    participant Tools as MealDataTool / AnalyticsSummaryTool / ProposeMealLogTool

    Client->>Controller: user message
    Controller->>UseCase: execute(conversationId, message)
    UseCase->>Repo: load conversation history
    UseCase->>UseCase: trim context
    loop max tool turns
        UseCase->>LLM: complete(history, tools)
        alt model requests tool
            LLM-->>UseCase: tool call
            UseCase->>Tools: execute requested tool
            Tools-->>UseCase: structured tool result
            UseCase->>Repo: append tool result/messages
        else final response
            LLM-->>UseCase: assistant response
            UseCase->>Repo: persist assistant message
            UseCase-->>Controller: response payload
            Controller-->>Client: 200 response
        end
    end
```

### `GET /chat/:conversationId`

```mermaid
sequenceDiagram
    actor Client
    participant Controller as ChatController
    participant UseCase as GetConversationHistory
    participant Repo as PrismaConversationRepository

    Client->>Controller: history request
    Controller->>UseCase: execute(conversationId)
    UseCase->>Repo: fetch messages
    UseCase-->>Controller: history
    Controller-->>Client: 200 messages
```

### Proposal endpointleri

```mermaid
sequenceDiagram
    actor Client
    participant Controller as ChatController
    participant Seed as SeedPhotoMealProposal
    participant Confirm as ConfirmMealProposal
    participant ConvRepo as PrismaConversationRepository
    participant FoodRepo as PrismaFoodEntryRepository
    participant Nutrition as LogMealEntries / ReplaceMealSlotEntries

    alt POST /chat/:conversationId/proposals/photo
        Client->>Controller: mealPhotoId
        Controller->>Seed: execute(conversationId, mealPhotoId)
        Seed->>FoodRepo: read recognized photo result
        Seed->>ConvRepo: persist proposal message
        Seed-->>Controller: seeded proposal
        Controller-->>Client: 200
    else POST /chat/:conversationId/proposals/confirm
        Client->>Controller: proposal confirmation
        Controller->>Confirm: execute(conversationId, selection)
        Confirm->>ConvRepo: load proposal state
        Confirm->>Nutrition: write confirmed meal log
        Confirm->>ConvRepo: mark proposal confirmed
        Confirm-->>Controller: confirmation result
        Controller-->>Client: 200
    end
```

## Gelistirme Rehberi

- Yeni tool ekleyecekseniz once `use-cases/tools/` altinda net input/output sozlesmesi olan bir bridge yazin; chatbot dosyalarindan diger modullerin repository'lerini direkt import etmeyin.
- `MAX_TOOL_TURNS`, rate limit ve context trimming guardrail'lerini gevsetmeyin. Bu modulde maliyet ve latency kontrolu is mantigi kadar onemli.
- LLM sonucunu her zaman validate edin. Structured output veya tool response parse islemini adapter/use-case sinirinda tutun.

## Ornek Best Practice

Dogru:

```ts
const sendMessage = new SendMessage(llmChatPort, conversationRepo, [toolA, toolB], maxTurns, maxContext);
```

Yanlis: controller icinde LLM client cagirip tool orkestrasyonunu orada yapmak.
