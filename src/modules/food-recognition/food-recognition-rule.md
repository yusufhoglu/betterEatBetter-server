# Food Recognition Modülü — Rule

Bu dosya `src/modules/food-recognition/` altında kod (ve test) yazarken uyulması gereken
kuralları listeler. Referans: `backend-architecture.md` §8.4, `shared-rule.md`.

Bu, sistemin EN KRİTİK modülü — hem en çok dış entegrasyon taşıyor hem de asenkron akışı
en karmaşık olan modül. Kurallara harfiyen uyulmalı, kısaltma yapılmamalı.

---

## Kapsam ve akış özeti

Dört giriş yöntemi var, DÖRDÜ DE aynı `FoodEntry` çıktısını üretir ama akışları kökten farklı:

- `photo` → ASENKRON (kuyruğa düşer, 202 döner, sonuç sonradan gelir)
- `barcode` → SENKRON (cache-aside, 200 döner)
- `text` → SENKRON (LLM çağrısı, 200 döner)
- `search` → SENKRON (kendi lokal DB'nizde arama, 200 döner)

## Domain (`domain/`)

- `FoodEntry.ts`: ortak çıktı entity'si — `source` alanı (`'photo'|'barcode'|'text'|'search'`)
  hangi yöntemden geldiğini taşır.
- `policies/ConfidencePolicy.ts`: **BİNARY** karar verir, numerik threshold KULLANMAZ.
  Python'dan gelen `status: 'sufficient' | 'insufficient_data'` alanını yorumlar:
  `needsUserAction = (status === 'insufficient_data')`. Eski "env'den threshold okuma"
  tasarımı TERK EDİLDİ, kullanılmayacak.

## Ports (`ports/`) — sahiplik netliği

- `PhotoEstimatorPort`, `BarcodeLookupPort`, `BarcodeCachePort`, `TextEstimatorPort`,
  `FoodCatalogSearchPort`: dördü de bu modülde tanımlı, bu modül kullanıyor.
- `FoodEntryRepositoryPort`: **SADECE `RecognizeFromPhoto` kullanır.** `RecognizeFromBarcode`,
  `RecognizeFromText`, `SearchFoodCatalog` bu Port'u KULLANMAZ — üçü de senkron, sonuç
  doğrudan response'ta döner, backend'de kalıcı kayıt YOK. Bu kural mimari dokümanındaki
  eski "dört use-case paylaşır" ifadesini geçersiz kılar.

## Adapters (`adapters/`)

### `photo/`
- `RagHttpEstimator.ts`: Python'a HTTP isteği, `x-trace-id` header'ını forward eder
  (gelen `AsyncLocalStorage` context'inden `getTraceId()` ile okunur).
- `ResilientPhotoEstimator.ts`: `RagHttpEstimator`'ı `shared/resilience/policies.ts`'teki
  cockatiel policy ile sarar — circuit breaker (5 ardışık hata → açık, 30sn half-open) +
  retry (SADECE `retryable: true` hatalarda) + timeout (60 saniye, RAG'ın 15-30sn sürebildiği
  göz önüne alınarak generous tutulur).

### `barcode/`
- **SADECE `OpenFoodFactsAdapter.ts`** yazılır — internal katalog/composite fallback bu
  turda YOK (kendi katalog olmadığı için).
- `RedisBarcodeCache.ts`: pozitif cache 7 gün TTL, negatif cache (`'NOT_FOUND'` sentinel
  değeri) 1 saat TTL. `get()` dönüş tipi üç durumu ayırt etmeli: `Product | null |
  'NOT_FOUND'` (`null` = hiç sorgulanmamış, `'NOT_FOUND'` = sorgulandı ve yok).

### `text/`
- `LlmTextEstimator.ts`: LLM'e serbest metni gönderip yapılandırılmış `FoodEntry` çıkarır.
  LLM'den de `status: 'sufficient'|'insufficient_data'` beklenir — aynı `ConfidencePolicy`
  hem photo hem text için kullanılabilsin diye response şekli tutarlı olmalı.

### `search/`
- `CatalogSearchAdapter.ts`: **CANLI USDA API çağrısı YAPMAZ.** USDA FoodData Central
  verisi (CSV/SQLite) önceden import edilmiş kendi Postgres tablonuzda (`food_catalog`
  gibi) full-text search yapılır. Import script'i ayrı bir CLI/script olarak yazılır,
  runtime akışının parçası değildir.

### `repository/`
- `PrismaFoodEntryRepository.ts`: SADECE `food_entries` tablosu (photo akışı için) —
  aşağıdaki şemaya bakın.

## Job (`jobs/recognizePhotoJob.ts`)

- `jobId = mealPhotoId` (deterministik, idempotency için — kullanıcı bilinçli yeni fotoğraf
  çektiğinde yeni `mealPhotoId` üretilir, bu durumda idempotency devreye GİRMEZ, sadece
  network-retry senaryosunda aynı id tekrar kullanılır).
- Worker, `shared/queue/queueConnection.ts`'teki `createWorker` üzerinden kurulur — bu
  fonksiyon `job.data.traceId`'yi otomatik olarak `runWithContext` ile context'e kurar,
  bu job dosyasında elle context kurmaya GEREK YOKTUR (ama context'in gerçekten kurulduğunu
  bir integration testle doğrulayın, bkz. Test bölümü).
- Worker concurrency, Python servisinin kapasitesine göre sınırlı tutulur (env'den
  `PHOTO_WORKER_CONCURRENCY`, varsayılan 2).
- Job başarısız olup retry'lar tükendiğinde: `food_entries` tablosunda `status: 'failed'`
  + `errorCode` güncellenir, push bildirimi `RECOGNITION_FAILED` kodu ile gönderilir
  (mesaj metni backend'de YOK, mobil kendi lokalizasyonundan seçer).

## `food_entries` Tablosu (Prisma şeması)

```
model FoodEntry {
  id          String   @id  // = mealPhotoId
  userId      String
  status      String   // 'processing' | 'completed' | 'insufficient_data' | 'failed'
  resultJson  Json?    // Python'dan gelen ham sonuç (items, macros, confidence)
  errorCode   String?
  createdAt   DateTime @default(now())
}
```
- TTL: 7 gün sonra, henüz `nutrition-logging` tarafından loglanmamış kayıtlar bir
  scheduled cleanup job'ıyla silinir (bu job `notifications` ya da `shared/scheduling`
  altında ayrı ele alınacak, bu turda sadece tabloyu tanımlayın).

## Görsel Validasyon ve Storage Akışı

```
1. Mobil → R2'ye direkt PUT → pending/{mealPhotoId}.jpg
2. Mobil → POST /food/photo { mealPhotoId } (JSON, dosya yok)
3. Backend SENKRON validasyon yapar (pending/ objesine karşı):
   a. Dosya boyutu ≤ 10MB (env: MAX_PHOTO_SIZE_BYTES)
   b. Gerçek dosya imzası (magic bytes) JPEG/PNG/WebP ile eşleşiyor mu (MIME spoofing
      koruması — Content-Type header'ına GÜVENİLMEZ, dosyanın kendisi kontrol edilir)
   c. Çözünürlük üst sınırı (decompression bomb koruması — örn. max 8000x8000px)
   d. Herhangi biri başarısızsa → ValidationError, job'a HİÇ girmez
4. Validasyon geçerse, İKİ PARALEL iş tetiklenir:
   a. recognizePhotoJob (analiz, pending URL'i Python'a gönderir)
   b. standardizeAndCopyJob (sharp ile resize/recompress + R2 COPY — MOVE DEĞİL —
      users/{userId}/meals/{mealPhotoId}.jpg konumuna)
5. pending/ prefix'i R2 lifecycle rule ile 24 saat sonra otomatik silinir.
```
- **KRİTİK NÜANS**: adım 4b bir COPY'dir, pending/ dosyası SİLİNMEZ. Worker'lar meşgulse
  4a'nın çalışması 4b'den geç olabilir; silme yapılırsa 4a'nın 404 alma riski oluşur.

## HTTP (`http/`)

- 4 endpoint: `POST /food/photo` (202), `POST /food/barcode` (200), `POST /food/text` (200),
  `GET /food/search` (200).
- Ek endpoint: `GET /food/photo/:mealPhotoId` — job durumu/sonucu polling için (push
  bildirimi gelmezse/gecikirse mobilin fallback'i).
- Rate limit (hepsi `shared/rateLimiting/checkRateLimit`, key formatı `{source}:${userId}`):
  `photo` 5/dk, `barcode` 10/dk, `text` 10/dk, `search` LİMİTSİZ.
- Hata response'ları SADECE `code` taşır, İngilizce/Türkçe sabit mesaj metni YOK — mobil
  kendi lokalizasyonunu yapar.

---

## Test Stratejisi — ATLANMAYACAK

`shared-rule.md`'deki genel test piramidine göre, bu modülde EN AZ şunlar yazılmalı:

### Unit — `domain/`
- `ConfidencePolicy.test.ts`: `sufficient`/`insufficient_data` için doğru boolean dönüyor mu.

### Unit — `use-cases/` (fake Port'larla, `test-utils/fakes/` altında paylaşılan fake'ler)
- `RecognizeFromPhoto.test.ts`: job'ın doğru payload ile (trace_id dahil) kuyruğa
  eklendiğini doğrular (gerçek Redis'e gerek yok, fake queue).
- `RecognizeFromBarcode.test.ts`: cache hit / cache miss / negative cache senaryolarının
  ÜÇÜNÜ de ayrı test eder — negative cache'in gerçekten harici lookup'ı atladığını
  (fake lookup'ın hiç çağrılmadığını) doğrulamak ÖZELLİKLE ÖNEMLİ.
- `RecognizeFromText.test.ts`: `insufficient_data` durumunda `needsUserAction: true`
  döndüğünü doğrular.
- `SearchFoodCatalog.test.ts`: temel arama senaryosu.

### Integration — `adapters/` (Testcontainers / MinIO)
- `RedisBarcodeCache.integration.test.ts`: gerçek Redis'e karşı TTL davranışı
  (pozitif 7 gün, negatif 1 saat — gerçek süre yerine test'te kısa TTL kullanılabilir).
- `PrismaFoodEntryRepository.integration.test.ts`: gerçek Postgres'e karşı CRUD.
- `presignedUrl`/storage akışı: MinIO'ya karşı, "copy sonrası pending/ dosyasının HÂLÂ
  orada olduğunu" (silinmediğini) doğrulayan bir test — bu, race condition'ı önleyen
  kritik davranış, mutlaka test edilmeli.

### Contract — Python sınırı
- `RagHttpEstimator.contract.test.ts`: sabit bir fixture (`rag-response-sample.json`)
  kullanarak Python'un beklenen response şemasına (zod ile) uyduğunu doğrular. Hem
  `sufficient` hem `insufficient_data` hem hata durumları için AYRI fixture'lar olmalı.

### Resilience
- `ResilientPhotoEstimator.test.ts`: fake bir "hep başarısız olan" estimator ile, 5 ardışık
  hatadan sonra circuit breaker'ın gerçekten AÇILDIĞINI ve 6. çağrının Python'a HİÇ
  gitmediğini (fake'in çağrı sayacının artmadığını) doğrular.

### Worker context testi
- `recognizePhotoJob.integration.test.ts`: gerçek bir job kuyruğa eklenip işlendiğinde,
  worker içindeki bir log/işlemin gerçekten `job.data.traceId`'yi taşıdığını doğrular
  (shared'deki `AsyncLocalStorage` otomasyonunun BU modülde de çalıştığının kanıtı).

### E2E
- `photo-recognition-flow.e2e.test.ts`: fake Python estimator ile, upload bildirimi →
  job → sonuç → `food_entries` güncellemesi uçtan uca akışının çalıştığını doğrular.

**Bütün testler yazıldıktan sonra ÇALIŞTIRILIP geçtiği doğrulanmalı** — yazıp bırakmak
yeterli değil. Test dosyaları kaynak dosyanın yanında durur (`X.ts` + `X.test.ts`),
`npm run test:unit` ve `npm run test:integration` olarak ayrı komutlarla çalışır.
