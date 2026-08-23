# Claude Code Prompt — `src/modules/food-recognition/`

Aşağıdaki prompt'u olduğu gibi Claude Code'a verebilirsin. `food-recognition-rule.md`
ve `shared-rule.md` dosyalarını da aynı klasöre koyup prompt'ta referans ver.

Bu prompt, `src/shared/` ve `src/modules/identity/`'nin ZATEN kurulu ve çalışır olduğunu
varsayıyor.

---

## PROMPT

```
Bu bir TypeScript backend projesi (food-tracking mobil uygulaması). src/shared/ ve
src/modules/identity/ zaten kurulu. Şimdi src/modules/food-recognition/ modülünü
kuracağız — bu, sistemin EN KRİTİK ve en kapsamlı modülü.

Aynı klasördeki food-recognition-rule.md ve shared-rule.md dosyalarını oku, TÜM
kurallarına harfiyen uy. Özellikle şu noktalar ATLANMAMALI:
1. ConfidencePolicy BİNARY çalışır (Python'un 'status' alanını yorumlar), numerik
   threshold YOK.
2. FoodEntryRepositoryPort SADECE RecognizeFromPhoto tarafından kullanılır — barcode/
   text/search senkron akışlar bu Port'u kullanmaz, backend'de kalıcı kayıt yapmaz.
3. Storage'da pending/ dosyası COPY edilir, asla MOVE/silme yapılmaz (race condition
   riski, rule dosyasında detaylı açıklanmış).
4. jobId = mealPhotoId (deterministik, idempotency için).
5. Job worker'lar shared/queue/queueConnection.ts'teki createWorker'ı kullanmalı (trace
   context otomasyonu için) — kendi worker kurulumunu elle yazma.
6. SearchFoodCatalog CANLI USDA API çağrısı YAPMAZ, önceden import edilmiş lokal
   Postgres tablosunda arar.

TEST YAZIMI ZORUNLU VE BU PROMPT'UN AYRILMAZ PARÇASI — "sonra yazarım" diye atlama.
food-recognition-rule.md'nin "Test Stratejisi" bölümünde listelenen TÜM testleri yaz.
Yazdıktan sonra ÇALIŞTIR (npm run test:unit, npm run test:integration — integration
testler için gerekiyorsa docker-compose ile testcontainers/MinIO ayağa kaldır), başarısız
olan varsa DÜZELT, hepsi geçene kadar devam et. Bu testler ileride başka bir geliştiricinin
(ya da senin) bu modülde değişiklik yaparken bir şeyi kırıp kırmadığını anlaması için —
bu yüzden gerçek davranışı doğrulayan, sahte/anlamsız assertion'lar İÇERMEYEN testler
olmalı.

Kurulacak teknoloji seçimleri (shared/'de zaten mevcut olanlar hariç):
- Görsel işleme: sharp
- USDA veri importu: basit bir Node script (CSV parse + Prisma ile toplu insert)
- Test: vitest (ya da projede zaten kullanılan test framework neyse onu kullan),
  testcontainers (Postgres + Redis), MinIO (S3-uyumlu, storage testleri için)

Oluşturulacak yapı:

src/modules/food-recognition/
  domain/
    FoodEntry.ts
    RecognitionSource.ts
    policies/
      ConfidencePolicy.ts
      ConfidencePolicy.test.ts

  use-cases/
    RecognizeFromPhoto.ts
    RecognizeFromPhoto.test.ts
    RecognizeFromBarcode.ts
    RecognizeFromBarcode.test.ts        -> cache hit/miss/negative üç ayrı senaryo
    RecognizeFromText.ts
    RecognizeFromText.test.ts
    SearchFoodCatalog.ts
    SearchFoodCatalog.test.ts

  ports/
    PhotoEstimatorPort.ts
    BarcodeLookupPort.ts
    BarcodeCachePort.ts
    TextEstimatorPort.ts
    FoodCatalogSearchPort.ts
    FoodEntryRepositoryPort.ts

  adapters/
    photo/
      RagHttpEstimator.ts
      RagHttpEstimator.contract.test.ts    -> fixture'lara karşı şema doğrulama
      ResilientPhotoEstimator.ts
      ResilientPhotoEstimator.test.ts        -> circuit breaker açılma testi
      fixtures/
        rag-response-sufficient.json
        rag-response-insufficient.json
        rag-response-error.json
    barcode/
      OpenFoodFactsAdapter.ts
      RedisBarcodeCache.ts
      RedisBarcodeCache.integration.test.ts
    text/
      LlmTextEstimator.ts
    search/
      CatalogSearchAdapter.ts
      importUsdaData.ts                        -> CLI script, runtime akışının parçası
                                            DEĞİL, ayrı çalıştırılır (npm run import:usda)
    repository/
      PrismaFoodEntryRepository.ts
      PrismaFoodEntryRepository.integration.test.ts

  jobs/
    recognizePhotoJob.ts
    recognizePhotoJob.integration.test.ts      -> worker'ın trace context'i gerçekten
                                            kurduğunu doğrulayan test
    standardizeAndCopyJob.ts                     -> sharp ile resize/recompress + R2 COPY
                                            (move değil)
    standardizeAndCopyJob.integration.test.ts      -> MinIO'ya karşı, pending/ dosyasının
                                            copy sonrası HÂLÂ orada olduğunu doğrular

  test-utils/
    fakes/
      InMemoryFoodEntryRepository.ts
      FakePhotoEstimator.ts
      FakeBarcodeCache.ts
      FakeBarcodeLookup.ts

  http/
    FoodRecognitionController.ts
    foodRecognitionRoutes.ts                     -> rate limit wiring: photo 5/dk,
                                            barcode 10/dk, text 10/dk, search limitsiz

test/e2e/
  photo-recognition-flow.e2e.test.ts             -> fake Python estimator ile uçtan uca

Prisma şeması güncellemesi (schema.prisma'ya ekle, mevcut modelleri BOZMA):

model FoodEntry {
  id          String   @id
  userId      String
  status      String
  resultJson  Json?
  errorCode   String?
  createdAt   DateTime @default(now())
}

model FoodCatalogItem {
  id        String  @id @default(uuid())
  name      String
  caloriesPer100g Float
  proteinPer100g  Float
  carbsPer100g    Float
  fatPer100g      Float
  // full-text search için gerekli index'leri ekle (Postgres GIN/tsvector)
}

Bağımlılıklar: sharp, vitest (veya mevcut test framework), testcontainers,
@testcontainers/postgresql, @testcontainers/redis, csv-parse (USDA import için).

Beklentiler:
- Gerçek, çalışan, derlenebilir TypeScript kodu — placeholder/TODO YOK.
- Her hata durumu shared/errors/ taksonomisinden bir sınıf kullanmalı.
- TÜM testleri yaz, ÇALIŞTIR, geçene kadar düzelt — bu adımı atlama.
- İşin sonunda kısa bir özet ver: hangi dosyayı neden bu şekilde yazdığın, hangi testlerin
  hangi kritik davranışı doğruladığı, ve test çalıştırma sonucunun (kaç test geçti/kaç
  test var) özetini.
- SADECE food-recognition modülüne dokun, başka hiçbir modüle dokunma.
```
