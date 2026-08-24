# Claude Code Prompt — `chatbot`'a Ek: Konuşarak Yemek Loglama (`ProposeMealLogTool`)

`src/modules/chatbot/` zaten implemente edilmiş ve çalışıyor. Bu turda YENİ bir
özellik ekliyoruz: kullanıcı sohbette bir yemek tarif ettiğinde, chatbot bunu
tanıyıp bir "öneri kartı" olarak sunabiliyor — ama chatbot'un kendisi HİÇBİR ZAMAN
yazma işlemi yapmıyor, sadece öneri üretiyor. Onay/kayıt tamamen mobil ↔
nutrition-logging arasında, chatbot'un backend'i bundan haberdar olmuyor.

Güncel `chatbot-rule.md`'nin "Konuşarak yemek loglama" bölümünü aynı klasöre koyup
referans ver.

---

## PROMPT

```
Bu bir TypeScript backend projesi. src/modules/chatbot/ zaten tam implemente
edilmiş ve çalışıyor. Bu turda SADECE yeni bir tool ve SendMessage'ın çıktı tipini
genişleteceğiz. Mevcut davranışı (MealDataTool, AnalyticsSummaryTool, tool-calling
loop mantığı, stream-kesintisi ele alma) BOZMADAN üzerine ekleme yapacağız.

Güncel chatbot-rule.md'nin "Konuşarak yemek loglama" bölümünü HARFİYEN uygula.
ÖZELLİKLE:

1. tools/ProposeMealLogTool.ts, food-recognition/RecognizeFromText'i DOĞRUDAN
   import edip çağırır. food-recognition'ın domain/adapters klasörlerine DOKUNMA.
2. Bu tool YAZMA yapmaz — sadece food-recognition'dan FoodEntry alıp
   MealLogProposal { entries: FoodEntry[]; rawDescription: string } olarak paketler.
   mealType'ı BİLMEZ/İSTEMEZ.
3. SendMessage'ın dönüş tipini AsyncIterable<string>'den
   AsyncIterable<ChatStreamChunk>'a genişlet:
   type ChatStreamChunk = { type: 'text'; delta: string }
                         | { type: 'proposal'; proposal: MealLogProposal };
   ProposeMealLogTool çağrıldığında proposal chunk'ı HEMEN yield edilir, loop devam
   eder, son metin streamFinalReply'den text chunk'ları olarak gelir.
4. Öneri DB'ye KAYDEDİLMEZ — sadece stream'in geçici bir parçası, mevcut
   "tool-turn kalıcılığı" prensibiyle (DB'ye sadece temiz kullanıcı+asistan metni
   yazılır) tutarlı.
5. ChatController.ts'i SSE'de İKİ event tipi (event: text, event: proposal) 
   gönderecek şekilde güncelle — mevcut stream-kesintisi (STREAM_INTERRUPTED) hata
   akışını BOZMADAN.

Bu tool'un LLM'e ne zaman kullanılacağını doğru anlatan bir description yaz (örn.
"kullanıcı yediği bir yemeği tarif ettiğinde ve bunu loglamak istediğinde kullan").

Repoda bu özelliğe ait test.todo stub'ı YOK (yeni bir özellik) — sıfırdan yaz.

Değişecek/eklenecek dosyalar:

src/modules/chatbot/
  use-cases/tools/
    ProposeMealLogTool.ts        -> YENİ
    ProposeMealLogTool.test.ts     -> YENİ, cross-module gerçek RecognizeFromText importuyla
  use-cases/
    SendMessage.ts                  -> GÜNCELLE (dönüş tipi + proposal handling)
    SendMessage.test.ts               -> GÜNCELLE + YENİ testler (proposal akışı,
                                       öneri DB'ye kaydedilmediği)
  domain/
    MealLogProposal.ts                 -> YENİ (tip tanımı)
    ChatStreamChunk.ts                    -> YENİ (tip tanımı)
  http/
    ChatController.ts                       -> GÜNCELLE (iki SSE event tipi)

Testleri çalıştır, TÜM chatbot test suite'inin (mevcut + yeni) geçtiğini doğrula.
tsc --noEmit repo genelinde temiz olmalı.

SADECE chatbot modülüne dokun (food-recognition'a sadece import için erişim,
değişiklik YOK).
```

---

## Tamamlama Raporu (Claude Code işin sonunda bunu doldurmalı)

### 1. Ne yapıldı
### 2. Rule dosyasındaki hangi kurallara karşılık geldiği
### 3. Karşılaşılan/düzeltilen sorunlar
### 4. Test sonuçları (yeni testler + mevcut testlerin hâlâ geçtiği)
### 5. Rule/Prompt'tan bilinçli sapma var mı
