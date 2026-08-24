# Claude Code Prompt — `shared/llm/` Env Okuma Düzeltmesi

`shared/llm/` zaten implemente edilmiş ve çalışıyor, ama `llmClientFactory.ts` env
değişkenlerini (`LLM_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`,
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`) `shared/config/env.ts` yerine kendi yerel
zod şemasıyla okuyor. Bu, `shared-rule.md`'nin "modüller `process.env` okumaz,
sadece `env.ts` üzerinden" kuralını ihlal ediyor VE daha önemlisi, fail-fast
garantisini kırıyor — eksik bir `OPENAI_API_KEY` artık uygulama başlarken değil,
ilk LLM çağrısında patlıyor.

---

## PROMPT

```
src/shared/llm/llmClientFactory.ts şu an LLM_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL,
ANTHROPIC_API_KEY, ANTHROPIC_MODEL değişkenlerini kendi yerel bir zod şemasıyla
okuyor. Bunu düzelt:

1. src/shared/config/env.ts'teki ANA envSchema'ya bu 5 alanı ekle:
   - LLM_PROVIDER: z.enum(['openai', 'anthropic']) (mock/test provider'lar env
     şemasına eklenmez, sadece test dosyalarında registerLlmProvider ile kullanılır)
   - OPENAI_API_KEY: z.string().optional() (LLM_PROVIDER='openai' değilse gerekmeyebilir)
   - OPENAI_MODEL: z.string().optional().default('gpt-4o')
   - ANTHROPIC_API_KEY: z.string().optional()
   - ANTHROPIC_MODEL: z.string().optional().default('claude-sonnet-4-6')
   NOT: envSchema.parse() zaten uygulama başlangıcında (fail-fast) çalışıyor —
   eksikse burada yakalanacak. Ama LLM_PROVIDER='openai' iken OPENAI_API_KEY boşsa
   bunu YAKALA (zod'un .superRefine() veya .refine() ile koşullu zorunluluk ekle) —
   aksi halde "provider seçili ama key yok" durumu yine geç fark edilir.

2. llmClientFactory.ts'i, kendi yerel şemasını SİLİP, shared/config/env.ts'teki
   merkezi `env` objesini import edip kullanacak şekilde güncelle.

3. .env.example dosyasına (varsa, yoksa oluştur) yeni 5 değişkeni örnek değerlerle
   ekle.

4. Mevcut shared/llm/ testlerinin (özellikle llmClientFactory.test.ts'teki
   MockLlmClient genişletilebilirlik testi) hâlâ geçtiğini doğrula — test
   dosyalarında env'i mock'lama şekli değişmiş olabilir, gerekiyorsa güncelle
   ama TEST MANTIĞINI değiştirme, sadece env erişim şeklini.

Testleri çalıştır, geçene kadar düzelt. Repo genelinde tsc --noEmit'in temiz
kaldığını doğrula (env.ts'e alan eklemek başka dosyaları etkilememeli, ama
kontrol et).

SADECE shared/config/env.ts, shared/llm/llmClientFactory.ts, ilgili test dosyaları
ve .env.example'a dokun. Başka hiçbir dosyaya dokunma.
```

---

## Tamamlama Raporu (Claude Code işin sonunda bunu doldurmalı)

### 1. Ne yapıldı
### 2. Karşılaşılan/düzeltilen sorunlar
### 3. Test sonuçları (yeni + mevcut testlerin hâlâ geçtiği, repo geneli tsc)
### 4. Bilinçli sapma var mı
