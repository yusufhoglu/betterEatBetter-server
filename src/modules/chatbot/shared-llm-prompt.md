# Claude Code Prompt — `shared/llm/` Eki (Sağlayıcı-Agnostik LLM Client)

`src/shared/` zaten kurulu ve çalışıyor. Bu turda SADECE yeni bir alt katman
ekleyeceğiz: `shared/llm/`. Mevcut hiçbir dosyayı DEĞİŞTİRME (dışında
`shared/observability/metrics.ts`'e YENİ bir metrik eklemek — o da sadece ekleme).

Güncel `shared-rule.md`'nin "LLM Client" bölümünü aynı klasöre koyup referans ver.

---

## PROMPT

```
src/shared/ zaten kurulu. Bu turda src/shared/llm/ adında yeni bir alt katman
ekleyeceğiz — sağlayıcı-agnostik (OpenAI/Anthropic/DeepSeek arası kolay geçiş
yapılabilen), birden fazla modülün (chatbot, food-recognition, body-analytics, ileride
başkaları) paylaşacağı bir LLM client'ı.

Güncel shared-rule.md'nin "LLM Client (llm/)" bölümünü HARFİYEN uygula. ÖZELLİKLE:

1. Kanonik mesaj formatı — sağlayıcıya özel tip HİÇBİR YERDE dışarı sızmaz.
2. complete() (tool-calling + yapılandırılmış çıktı için) ve streamComplete()
   (SADECE son metin yanıtı için, tool call İÇERMEZ) ayrı iki metod.
3. Structured output için native JSON mode KULLANMA — "zorla tool çağrısı" hilesini
   uygula (forceToolChoice parametresi, sahte bir "sonucu bildir" tool'u).
4. LLM_PROVIDER env değişkeni ile sağlayıcı seçimi, createLlmClient() factory.
5. Her çağrı shared/resilience/policies.ts'teki cockatiel policy ile sarmalanır.
6. feature parametresi ile token kullanımı etiketlenir, llm_tokens_total metriğine
   yazılır.

Bu turda İKİ sağlayıcı adapter'ı yaz: OpenAI ve Anthropic (DeepSeek İLERİDE, şimdi
yazma — ama tasarım onun kolayca eklenebileceğini garanti etmeli, bunu bir testle
kanıtla: sahte bir üçüncü "mock" provider ekleyip factory'nin onu da çalıştırabildiğini
gösteren bir test).

Oluşturulacak yapı:

src/shared/llm/
  types.ts                  -> LlmMessage, LlmToolDefinition, LlmCompleteRequest,
                                LlmCompleteResponse tipleri (kanonik format)
  LlmClient.ts               -> ana arayüz/sınıf: complete(), streamComplete()
  llmClientFactory.ts          -> createLlmClient(), LLM_PROVIDER'a göre doğru
                                adapter'ı resilience policy'siyle sarıp döner
  providers/
    OpenAiProvider.ts           -> OpenAI Chat Completions API'sine çeviri
    OpenAiProvider.test.ts        -> kanonik format <-> OpenAI format çevirisi
                                (gerçek API çağrısı yok, mock HTTP/SDK response'larıyla)
    AnthropicProvider.ts            -> Anthropic Messages API'sine çeviri
    AnthropicProvider.test.ts         -> aynı, Anthropic formatı için
  structuredOutput.ts                 -> "zorla tool çağrısı" yardımcı fonksiyonu:
                                       verilen bir zod/JSON şemasını sahte tool'a
                                       çevirip forceToolChoice ile complete() çağırır,
                                       sonucu şemaya göre parse edip döner
  structuredOutput.test.ts              -> fake LlmClient ile, tool çağrısı
                                       response'unun doğru parse edildiği
  llmClientFactory.test.ts                -> KRİTİK test: sahte bir üçüncü "mock"
                                       provider'ı factory'ye ekleyip (test içinde,
                                       geçici) LLM_PROVIDER=mock ile seçilebildiğini
                                       kanıtlayan test — genişletilebilirliğin
                                       kanıtı

Ayrıca shared/observability/metrics.ts'e YENİ bir metrik ekle (mevcut metrikleri
SİLMEDEN):

llm_tokens_total = new Counter({
  name: 'llm_tokens_total',
  labelNames: ['provider', 'feature', 'type']  // type: 'input' | 'output'
});

Bağımlılıklar: openai (resmi SDK), @anthropic-ai/sdk (resmi SDK).

Testleri yaz, ÇALIŞTIR, geçene kadar düzelt. Mevcut shared/ testlerinin hâlâ geçtiğini
doğrula (metrics.ts'e sadece ekleme yapıldığı için kırılmamalı).

SADECE shared/llm/ dosyalarına ve shared/observability/metrics.ts'e (sadece ekleme)
dokun.
```

---

## Tamamlama Raporu (Claude Code işin sonunda bunu doldurmalı)

### 1. Ne yapıldı
### 2. Rule dosyasındaki hangi kurallara karşılık geldiği
### 3. Karşılaşılan/düzeltilen sorunlar
### 4. Test sonuçları (özellikle llmClientFactory.test.ts'in genişletilebilirlik
   kanıtı gerçekten geçti mi)
### 5. Rule/Prompt'tan bilinçli sapma var mı
