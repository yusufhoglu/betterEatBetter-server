# Claude Code Prompt — Özellik-Bazlı LLM Modeli + `food-recognition` Retrofit

Bu prompt iki bağlantılı işi birleştiriyor: (1) `CHATBOT_MODEL`/`FOOD_TEXT_MODEL`
env değişkenlerini eklemek, (2) `food-recognition/adapters/text/LlmTextEstimator.ts`'i
(muhtemelen hâlâ eski/doğrudan sağlayıcı çağrısı yapan haliyle duruyor)
`shared/llm/`'i kullanacak şekilde retrofit etmek. `chatbot`'un adapter'ı da
`CHATBOT_MODEL`'i kullanacak şekilde güncellenecek.

Güncel `shared-rule.md`'nin "Özellik-bazlı model seçimi" notunu aynı klasöre koyup
referans ver.

---

## PROMPT

```
Bu bir TypeScript backend projesi. shared/llm/ (sağlayıcı-agnostik LLM client),
food-recognition/, chatbot/ zaten kurulu ve çalışıyor. Bu turda üç değişiklik
yapacağız, mevcut davranışı BOZMADAN.

1. shared/config/env.ts'e İKİ yeni alan ekle:
   - CHATBOT_MODEL: z.string().optional().default('gpt-4o')
   - FOOD_TEXT_MODEL: z.string().optional().default('gpt-4o-mini')

2. src/modules/food-recognition/adapters/text/LlmTextEstimator.ts dosyasını İNCELE.
   ÖNCE raporla: şu an nasıl implemente edilmiş (doğrudan bir SDK/API çağrısı mı
   yapıyor, yoksa zaten shared/llm/ mi kullanıyor)? Eğer doğrudan bir sağlayıcıya
   bağlıysa, bunu shared/llm/LlmClient + shared/llm/structuredOutput.ts'teki
   requestStructuredOutput() ("zorla tool çağrısı" hilesi) kullanacak şekilde
   YENİDEN YAZ:
   - Girdi: kullanıcının serbest metni
   - Çıktı şeması: FoodEntry'ye karşılık gelen zod şeması (name, calories, proteinG,
     carbsG, fatG, portionGrams, confidence/status alanları — food-recognition-rule.md
     ve mevcut FoodEntry.ts tipine bak, şemayı ona göre kur)
   - model: env.FOOD_TEXT_MODEL, feature: 'food-recognition-text' parametreleriyle
     çağrılmalı (maliyet takibi için feature etiketi ZORUNLU)
   - Bu modül HİÇBİR ZAMAN OpenAI/Anthropic SDK'sını doğrudan import ETMEMELİ artık
     (shared/llm/'in kuralı, food-recognition-rule.md'de zaten TextEstimatorPort
     için bu bekleniyordu)
   - Resilience: ResilientPhotoEstimator'daki pattern'e benzer şekilde,
     shared/resilience policy'sini burada da uygula (eğer zaten yoksa)

3. src/modules/chatbot/adapters/llm/SharedLlmChatAdapter.ts'i güncelle: complete()/
   streamComplete() çağrılarına model: env.CHATBOT_MODEL parametresini ekle (şu an
   muhtemelen model belirtmiyor, sağlayıcı varsayılanına düşüyor — artık açıkça
   CHATBOT_MODEL geçirilmeli).

Mevcut testleri (LlmTextEstimator'ın kendi testleri + onu kullanan
RecognizeFromText.test.ts + food-recognition'ın diğer testleri + chatbot'un
SharedLlmChatAdapter.test.ts) güncelle/yeniden yaz, hepsinin geçtiğini doğrula.
LlmTextEstimator retrofit edildiyse, contract test yaklaşımını (fixture'larla)
food-recognition-rule.md'deki pattern'e uygun tut.

Repo geneli tsc --noEmit temiz olmalı, repo geneli unit test suite (--runInBand)
hâlâ geçmeli.

SADECE shared/config/env.ts, food-recognition/adapters/text/ (ve ilgili testleri),
chatbot/adapters/llm/SharedLlmChatAdapter.ts (ve testi) dosyalarına dokun.
```

---

## Tamamlama Raporu (Claude Code işin sonunda bunu doldurmalı)

### 1. Ne yapıldı (LlmTextEstimator'ın ÖNCEKİ hali neydi — bu ÖNEMLİ, raporla)
### 2. Rule dosyalarındaki hangi kurallara karşılık geldiği
### 3. Karşılaşılan/düzeltilen sorunlar
### 4. Test sonuçları (yeni + mevcut testlerin hâlâ geçtiği, repo geneli tsc)
### 5. Rule/Prompt'tan bilinçli sapma var mı
