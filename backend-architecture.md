# Backend Mimarisi — Genel Referans

Bu doküman, food-tracking mobil uygulamasının TypeScript backend'i için varılan tüm mimari
kararları tek yerde toplar. Amaç: Claude Code'un genel klasör/dosya iskeletini kurması,
ardından modül modül yazılacak "rule" dosyalarının bu belgeye referans vermesi.

Bu belge SADECE iskeleti ve kararları tanımlar — iş mantığının implementasyonu
(use-case içerikleri, gerçek sorgular vb.) modül bazlı rule'larda ayrıca yazılacak.

---

## 0. Mimari Kararlar Özeti

- **Stil**: Modüler monolit (tek TypeScript codebase, net modül sınırları) + Ports & Adapters
  (Hexagonal). Ağır Clean Architecture ritüeli (View Model, Presenter, ayrı Boundary interface'leri)
  bilerek çıkarıldı — backend saf JSON API, use-case'ler `Promise<Output>` doğrudan döner.
- **Tek gerçek ayrı servis**: Python RAG servisi (farklı runtime olduğu için mecburen ayrı).
  Geri kalan her şey (food-recognition, nutrition-logging, chatbot, body-analytics, vb.)
  tek Node codebase içinde, modül sınırlarıyla izole.
- **Modüller arası iletişim**: Sadece public Port/use-case üzerinden. Bir modül başka bir
  modülün `domain/` veya `adapters/` klasörüne asla dokunmaz.
- **Port sahipliği kuralı**: Port'u her zaman KULLANAN modül tanımlar, sağlayan değil.
  İmplementasyon (adapter) sağlayıcı tarafta durur.
- **Node ↔ Python iletişimi**: Doğrudan HTTP (REST), generous timeout (60sn+) + circuit breaker.
  Görsel asla request body'de taşınmaz — sadece presigned URL.
- **Asenkron sınır**: Sadece gerçekten yavaş olan akışlar (fotoğraf → RAG, 15-30sn) kuyruğa
  (BullMQ) düşer. Barcode/text/search gibi hızlı akışlar senkron kalır.

---

## 1. Teknoloji Seçimleri

| Alan | Seçim | Not |
|---|---|---|
| Runtime/dil | Node.js + TypeScript | — |
| Web framework | Express | — |
| ORM | **Prisma** | Tip güvenliği + migration tooling; transaction/outbox `prisma.$transaction` ile |
| Kuyruk | **BullMQ + Redis** | Sadece food-recognition/photo ve notifications/scheduled job'lar için |
| Cache | **Redis** (ayrı client/db index, kuyruktan izole) | Barcode lookup (pozitif + negatif cache) |
| Object storage | **Cloudflare R2** (S3-uyumlu SDK) | Egress ücreti sıfır; erişim paterni okuma-ağırlıklı olduğu için avantajlı |
| Veritabanı | PostgreSQL | + pgvector (RAG embedding, gerekirse ileride ayrı vector DB'ye geçiş) |
| Mobil hata takibi | **Sentry (Flutter)** | trace_id custom tag olarak eklenir |
| Log/trace toplama | **Grafana Cloud veya Axiom** | Node + Python JSON structured log gönderir; self-hosted ELK/Loki'den kaçınıldı (operasyonel yük) |
| Tracing standardı | `x-trace-id` header (W3C benzeri custom propagation) | Tam OpenTelemetry şimdilik gerekli değil, küçük ekip için pragmatik başlangıç |
| Python serving | FastAPI + gunicorn/uvicorn | `/health` endpoint, model yüklenene kadar 503 |

---

## 2. Kök Yapı

```
src/
  shared/          → tüm modüllerin bağımlı olduğu ortak katman
  modules/         → her biri kendi domain'ine sahip, birbirinden izole özellik modülleri
  http/
    router.ts        → tüm modül route'larını tek Express Router'da birleştirir
  main.ts          → tüm modülleri wiring eder, sunucuyu başlatır

test/
  e2e/             → kritik akışlar için uçtan uca testler (az sayıda, altın yollar)
```

---

## 3. `src/shared/` — Ortak Katman

```
shared/
  observability/
    logger.ts                → JSON structured logger (pino); her satıra requestId/userId/trace_id ekler
    tracer.ts                  → trace_id yakalama/üretme/yayma mantığı (bkz. §6 Observability)
    metrics.ts                   → Prometheus metrik tanımları (latency, error rate sayaçları)

  resilience/
    circuitBreaker.ts         → Dış servis çağrılarını saran genel circuit breaker wrapper'ı
    retry.ts                    → Exponential backoff'lu retry yardımcı fonksiyonu (retryable/non-retryable ayrımı)
    timeout.ts                    → Promise'lara timeout ekleyen yardımcı

  queue/
    redisConnection.ts        → BullMQ'ya özel Redis bağlantısı (maxRetriesPerRequest: null zorunlu ayarla)
    queueConnection.ts          → Queue/Worker factory fonksiyonları
    jobTypes.ts                   → Kuyruk job'larının ortak tip tanımları (trace_id alanı dahil, bkz §6)

  cache/
    redisCacheClient.ts        → Cache için AYRI Redis client (farklı db index veya instance — kuyruktan izole)

  scheduling/
    scheduledJobRegistry.ts   → Tüm cron/zamanlanmış job'ların tek yerden tanımlandığı registry
    cronRunner.ts                → BullMQ repeatable job kurulumu (queue/redisConnection.ts'i paylaşır)

  storage/
    objectStorageClient.ts    → R2 (S3-uyumlu SDK) client kurulumu

  persistence/
    db.ts                      → Prisma client kurulumu (tek instance, tüm uygulama paylaşır)
    migrations/                  → Prisma migration dosyaları
    transaction.ts                 → `prisma.$transaction` wrapper'ı (outbox pattern için kritik)

  errors/
    DomainError.ts            → Temel hata sınıfı, tüm domain hatalarının atası
    IntegrationError.ts         → 3. parti servis hatalarını sarmalayan hata tipi (retryable flag'i taşır)
    errorMapper.ts                → Hata sınıflarını HTTP status koduna çeviren merkezi mapper

  auth/
    authMiddleware.ts         → Request'ten kullanıcıyı çözümleyip context'e ekleyen middleware
    AuthContext.ts               → İstek boyunca taşınan kullanıcı kimliği tipi

  config/
    env.ts                     → Ortam değişkenlerini okuyup doğrulayan (zod ile) tek nokta

  domain/                    → SADECE birden fazla modülün paylaştığı SAF (I/O'suz) hesaplamalar
    PlanCalculationService.ts  → ComputeBMR + ComputeTDEE + ComputeDailyCalorieTarget + ComputeMacroSplit
                                  (onboarding-plan VE goal-management tarafından kullanılır)
    resolveUserToday.ts          → Kullanıcı saat dilimine göre "bugün" (daily-tracking, nutrition-logging,
                                  body-analytics'in hepsi aynı tanımı kullanmalı — cross-cutting)
```

> **Not (YAGNI):** `shared/domain/` içine "belki başka modül de kullanır" varsayımıyla erken taşıma
> yapılmaz. Gerçekten ikinci bir kullanıcı çıktığında taşınır. Tek modül kullanan pure logic,
> o modülün kendi `domain/` klasöründe kalır.

---

## 4. Routing ve Kompozisyon

```typescript
// src/http/router.ts — sadece modül route'larını toplar, iş mantığı içermez
router.use('/auth', identityRoutes());
router.use('/onboarding', onboardingRoutes());
router.use('/goal', goalManagementRoutes());
router.use('/food', foodRecognitionRoutes());
router.use('/nutrition-logs', nutritionLoggingRoutes());
router.use('/tracking', dailyTrackingRoutes());
router.use('/analytics', bodyAnalyticsRoutes());
router.use('/chat', chatRoutes());
router.use('/notifications', notificationsRoutes());
router.use('/subscription', subscriptionRoutes());
```

Her modülün kendi `http/xRoutes.ts` dosyası hem route tanımlarını hem de o modüle özel
adapter/use-case wiring'ini (DI) barındırır. `router.ts` bu detaylara karışmaz, sadece mount eder.

---

## 5. Veritabanı ve Bağlantı Stratejisi

- **Tek paylaşılan Prisma client** (`shared/persistence/db.ts`) — her modülün repository'si
  kendi bağlantısını açmaz, bu client'ı DI ile alır. Connection pool kontrolsüz büyümez.
- **Repository metodları opsiyonel bir transaction client parametresi alır** — outbox pattern
  gereken yerlerde (örn. `nutrition-logging`'de kayıt + event aynı transaction'da) bu kullanılır.
- **pgvector**, RAG embedding/benzer yemek aramasında başlangıç çözümü; trafik büyüdükçe
  ayrı bir vector DB'ye (Qdrant/Pinecone) geçiş `NutritionEstimatorPort` soyutlaması sayesinde
  kolay olacak.

---

## 6. Observability ve Trace ID Stratejisi

**Amaç:** Flutter mobil app, Node backend ve Python RAG servisi arasında tek bir `trace_id` ile
uçtan uca izlenebilirlik.

### Trace ID yaşam döngüsü

- **Kaynak: Flutter.** Kullanıcının başlattığı her mantıksal eylem için (foto yükleme, barkod
  tarama, chatbot mesajı) bir `trace_id` (UUID v4) üretilir.
  - **Chatbot istisnası:** trace_id, mesaj başına değil **tüm konuşma (`conversationId`)
    boyunca sabit** tutulur. Ayrıca her mesaj isteğinde ayrı bir `messageId` (UUID) de
    gönderilir — loglarda `trace_id` ile konuşmayı, `messageId` ile tek bir isteği filtrelemek
    mümkün olur.
  - Diğer akışlarda (foto, barkod, arama) trace_id = tek bir eylem, session/kullanıcı id'si DEĞİL.
- **Taşıma:** `x-trace-id` HTTP header'ı — Flutter → Node → Python zincirinde aynı isimle taşınır
  (önceki `x-request-id` ismi terk edildi, tek isim kullanılıyor: `x-trace-id`).
- **Kritik incelik — asenkron kırılma noktası:** HTTP header sadece senkron request/response'ta
  işe yarar. `food-recognition/photo` akışı kuyruğa düştüğü an orijinal request biter. Bu yüzden
  trace_id, BullMQ job'ının **payload'ının bir alanı** olarak taşınmalı (header değil, veri).
  Worker job'ı işlerken bu alanı okuyup hem kendi loglarına hem Python'a giden isteğe ekler.
- **Node tarafı:** `shared/observability/tracer.ts`, gelen `x-trace-id`'yi yakalar (yoksa üretir),
  request boyunca child logger'a otomatik enjekte eder — her use-case'in elle trace_id yazması
  gerekmez.
- **Python tarafı:** Gelen `x-trace-id`'yi aynı isimle okuyup kendi JSON loglarına ekler
  (structlog veya benzeri).

### Araç seçimi

- **Mobil hata/crash:** Sentry (Flutter SDK) — her hata/breadcrumb'a `trace_id` custom tag
  olarak eklenir.
- **Backend + Python logları:** Grafana Cloud (Loki) veya Axiom — JSON structured log, her
  satırda `trace_id` alanı zorunlu.
- **Korelasyon:** İki panel arasında `trace_id` ile manuel arama — self-hosted tek panel
  (Datadog vb.) şimdilik gerekli değil, küçük ekip için gereksiz operasyonel/maliyet yükü.

### Mobil tarafta yapılacaklar (özet)

1. `uuid` paketiyle eylem bazlı trace_id üretimi (session değil).
2. Dio/HTTP interceptor ile her isteğe otomatik `x-trace-id` header'ı.
3. Çok adımlı akışlarda (upload → polling/push) aynı trace_id'nin state'te taşınması.
4. `sentry_flutter` kurulumu, `trace_id` scope tag'i olarak eklenmesi.
5. Kilit yaşam döngüsü olaylarının Sentry breadcrumb olarak işaretlenmesi.
6. Backend'in push bildirim payload'ına trace_id eklemesi (bildirim gecikme/kayıp debug'ı için).

---

## 7. Test Stratejisi

Katmana göre farklı test yaklaşımı — aynı tekniği her yere uygulamak yanlış güven verir.

| Katman | Test türü | Araç/yöntem | Yoğunluk |
|---|---|---|---|
| `domain/` | Unit | Mock yok, saf input/output | Çok yüksek (%90+ coverage hedefi mantıklı) |
| `use-cases/` | Unit | Port'ların **fake** (in-memory) implementasyonları — `jest.mock()` değil | Yüksek |
| `adapters/` | Integration | Testcontainers (gerçek Postgres/Redis, Docker) | Az, ayrı CI aşaması |
| Python sınırı | Contract | Ortak fixture'a karşı şema doğrulama (zod / Pydantic) | Orta |
| `jobs/` (worker) | — | Worker ince tutulur, asıl mantık zaten use-case testinde kapsanır | Minimal |
| Kritik akışlar | E2E | Gerçek server + supertest | Çok az, sadece altın yollar |

### Dosya konumu kuralı

Test dosyaları kaynak dosyanın **yanında** (`X.ts` + `X.test.ts` aynı klasörde), ayrı bir
`__tests__/` ağacında değil — modül taşındığında testler otomatik onunla gider.

```
modules/nutrition-logging/
  domain/
    AggregateMealEntries.ts
    AggregateMealEntries.test.ts          → unit, mock yok
  use-cases/
    LogMealEntries.ts
    LogMealEntries.test.ts                  → unit, fake port'larla
  adapters/
    repository/
      PostgresMealItemRepository.ts
      PostgresMealItemRepository.integration.test.ts   → testcontainers
  test-utils/
    fakes/
      InMemoryMealItemRepository.ts         → paylaşılan fake, birden fazla test dosyasında kullanılır
```

`integration.test.ts` dosyaları `npm run test:unit` değil ayrı bir `npm run test:integration`
komutuyla çalışır (Docker gerektirir) — CI'da ayrı, daha az sık tetiklenen bir aşama.

---

## 8. Modül Yapıları

Her modül aynı iskeleti tekrarlar: `domain/ → use-cases/ → ports/ → adapters/ → http/`
(+ ihtiyaca göre `jobs/` veya `events/`). Bağımlılık yönü her zaman içe doğru.

### 8.1 `src/modules/identity/`

```
identity/
  domain/
    UserSession.ts              → Session/token entity'si

  use-cases/
    SignInWithProvider.ts       → Apple/Google/email token'ını doğrular, kullanıcıyı bulur/oluşturur, session verir
    RefreshSession.ts             → refreshToken'ı yeni accessToken'a çevirir
                                    (mobil app için gerekli: kısa ömürlü access token + uzun ömürlü
                                    refresh token, sık login zorlamadan güvenliği dengeler)

  ports/
    IdentityProviderPort.ts     → Apple/Google SDK doğrulama sözleşmesi
    UserRepositoryPort.ts         → Kullanıcı kayıtlarının okuma/yazma sözleşmesi
    SessionTokenPort.ts             → Access/refresh token üretme-doğrulama sözleşmesi

  adapters/
    provider/
      AppleSignInAdapter.ts        → IdentityProviderPort'un Apple implementasyonu
      GoogleSignInAdapter.ts         → IdentityProviderPort'un Google implementasyonu
    repository/
      PrismaUserRepository.ts         → UserRepositoryPort implementasyonu
    token/
      JwtSessionTokenAdapter.ts         → SessionTokenPort'un JWT implementasyonu

  http/
    IdentityController.ts        → /sign-in, /refresh endpoint'leri
    identityRoutes.ts              → Route tanımları + wiring
```

### 8.2 `src/modules/onboarding-plan/`

```
onboarding-plan/
  domain/
    ComputeHealthScore.ts        → Heuristic sağlık skoru (1-100) — en olası genişleme noktası
    ComputeWeightProjection.ts     → Başlangıç/hedef kilo + hız → tahmini hedef tarihi ve eğri
    ValidateMacroOverride.ts         → Kullanıcı manuel makro girince min/max sağlık sınırı kontrolü

  use-cases/
    CompleteOnboarding.ts        → Anket cevaplarından ilk planı üretir
                                    (shared/domain/PlanCalculationService.ts'i çağırır)

  ports/
    UserProfileRepositoryPort.ts → Kullanıcı profil/anket verisinin yazımı
    PlanRepositoryPort.ts          → Üretilen planın kaydı

  adapters/
    repository/
      PrismaUserProfileRepository.ts → UserProfileRepositoryPort implementasyonu
      PrismaPlanRepository.ts          → PlanRepositoryPort implementasyonu

  http/
    OnboardingController.ts      → /onboarding/complete endpoint'i
    onboardingRoutes.ts            → Route tanımları + wiring
```

### 8.3 `src/modules/goal-management/`

```
goal-management/
  domain/
    ComputeWeeksToGoal.ts        → |target − current| / haftalık hız (pure)

  use-cases/
    UpdateGoal.ts                → Hedef/kilo/hız değişince günlük kaloriyi YENİDEN hesaplar
                                    (shared/domain/PlanCalculationService.ts'i çağırır)

  ports/
    PlanRepositoryPort.ts        → Planı okuma/güncelleme (onboarding-plan'ın kaydettiği veriye erişim
                                    — Port burada tanımlı, "kullanan tanımlar" kuralı)

  adapters/
    repository/
      OnboardingPlanAdapter.ts   → PlanRepositoryPort'un onboarding-plan modülüne bağlanan implementasyonu

  http/
    GoalManagementController.ts  → /goal/update endpoint'i
    goalManagementRoutes.ts        → Route tanımları + wiring
```

### 8.4 `src/modules/food-recognition/`

```
food-recognition/
  domain/
    FoodEntry.ts                     → Ortak çıktı entity'si (name, calories, macros, confidence, source)
    RecognitionSource.ts               → 'photo' | 'barcode' | 'text' | 'search' enum/type
    policies/
      ConfidencePolicy.ts                → Düşük confidence'ta kullanıcı aksiyonu gerekir mi
                                            (eşik değeri env'den okunur, A/B test edilebilir)

  use-cases/
    RecognizeFromPhoto.ts              → Fotoğraf akışı: kuyruğa iş bırakır (async, 202 döner)
    RecognizeFromBarcode.ts              → Barkod akışı: cache-aside, senkron
    RecognizeFromText.ts                  → Serbest metin akışı: LLM'e sorar, senkron
    SearchFoodCatalog.ts                    → Katalog araması: senkron, kendi arama indexiniz

  ports/
    PhotoEstimatorPort.ts               → Python RAG servisine bağlanan sözleşme
    BarcodeLookupPort.ts                  → Barkod arama sözleşmesi
    BarcodeCachePort.ts                     → Barkod cache sözleşmesi (pozitif + negatif)
    TextEstimatorPort.ts                     → Serbest metin → besin tahmini sözleşmesi
    FoodCatalogSearchPort.ts                   → Katalog arama sözleşmesi
    FoodEntryRepositoryPort.ts                   → Sonuçların kaydı (dört use-case de paylaşır)

  adapters/
    photo/
      RagHttpEstimator.ts                 → PhotoEstimatorPort'un Python servisine HTTP implementasyonu
                                              (x-trace-id header'ını Python'a forward eder)
      ResilientPhotoEstimator.ts            → Circuit breaker + retry decorator
    barcode/
      OpenFoodFactsAdapter.ts               → BarcodeLookupPort'un harici implementasyonu
      InternalCatalogAdapter.ts               → Kendi ürün DB'niz (varsa)
      CompositeBarcodeLookup.ts                 → İkisini sırayla deneyen fallback zinciri (Strategy)
      RedisBarcodeCache.ts                        → BarcodeCachePort implementasyonu
                                                    (pozitif: 7 gün TTL, negatif "NOT_FOUND": 1 saat TTL)
    text/
      LlmTextEstimator.ts                   → TextEstimatorPort'un LLM implementasyonu
    search/
      CatalogSearchAdapter.ts                 → FoodCatalogSearchPort implementasyonu
    repository/
      PrismaFoodEntryRepository.ts              → FoodEntryRepositoryPort implementasyonu

  jobs/
    recognizePhotoJob.ts                  → BullMQ worker; job payload'ında trace_id taşınır (bkz §6);
                                              concurrency Python servisinin kapasitesine göre sınırlı

  http/
    FoodRecognitionController.ts           → 4 endpoint: /photo (202+job), /barcode, /text, /search (senkron 200)
    foodRecognitionRoutes.ts                 → Route tanımları + wiring
```

### 8.5 `src/modules/nutrition-logging/`

```
nutrition-logging/
  domain/
    MealItem.ts                     → Bir öğüne loglanmış kalemler bütünü (mealId, date, entries[])
    NutrientTotals.ts                 → {kcal, carbsG, proteinG, fatG} value object
    AggregateMealEntries.ts             → FoodEntry[] → NutrientTotals (pure fonksiyon)
    ComputeDayNutrientProgress.ts         → entries[] + dailyTargets → NutrientProgress[]
    ComputeCaloriesRemaining.ts             → goal − consumed (pure, trivial ama merkezi)

  use-cases/
    LogMealEntries.ts                   → food-recognition'dan gelen FoodEntry'leri bir öğüne kaydeder
                                            (kayıt + event aynı transaction'da — shared/persistence/transaction.ts)
    GetDaySummary.ts                      → Günün tüm loglarından özet döner
    UpdateMealEntry.ts                      → Tek bir kalemi düzenler
    DeleteMealEntry.ts                        → Bir kalemi siler, günün özetini yeniden hesaplar

  ports/
    MealItemRepositoryPort.ts             → Öğün/kalem kayıtlarının okuma/yazma sözleşmesi
    DailyTargetsPort.ts                     → Kullanıcının günlük hedeflerini okuma sözleşmesi

  adapters/
    repository/
      PrismaMealItemRepository.ts           → MealItemRepositoryPort implementasyonu
    targets/
      OnboardingPlanTargetsAdapter.ts          → DailyTargetsPort'un onboarding-plan modülüne bağlanan implementasyonu

  events/
    publishers/
      MealLoggedEventPublisher.ts             → Kayıt sonrası "meal logged" event'i yayınlar (outbox pattern;
                                                  body-analytics bu event'i dinler)

  http/
    NutritionLoggingController.ts             → Log/güncelle/sil/günlük-özet endpoint'leri
    nutritionLoggingRoutes.ts                   → Route tanımları + wiring
```

### 8.6 `src/modules/daily-tracking/`

```
daily-tracking/
  domain/
    DayCompletion.ts                  → Bir günün tamamlanma durumu value object
    DefineDayCompletion.ts              → day → bool (POLICY, pure — kural sık değişebilir, ayrı tutulmalı)
    ComputeStreak.ts                      → geçmiş günlerin tamamlanma dizisi → {currentStreak, longestStreak}

  use-cases/
    GetTodayStatus.ts                   → Bugünün streak + tamamlanma durumunu döner
    GetWeekProgress.ts                    → 7 günlük tamamlanma haritası

  ports/
    DayLogsPort.ts                        → Bir günün loglanmış verisini okuma sözleşmesi

  adapters/
    dayLogs/
      NutritionLoggingDayLogsAdapter.ts     → DayLogsPort'un nutrition-logging modülüne bağlanan implementasyonu

  http/
    DailyTrackingController.ts              → streak/week-progress endpoint'leri
    dailyTrackingRoutes.ts                    → Route tanımları + wiring
```

### 8.7 `src/modules/body-analytics/`

```
body-analytics/
  domain/
    ComputeBMI.ts                       → weight/height² (pure)
    ComputeWaistHeightRatio.ts            → oran + klinik sınıflandırma (eşikler config/versiyonlanabilir)
    ComputeTrendSeries.ts                   → geçmiş ölçümlerden downsample edilmiş seri + delta + yön
    ComputeGoalProgress.ts                    → current/goal/start kilo → yüzde ve kalan
    ComputeBodyStatDisplay.ts                   → her stat kartı için hedefe göre yüzde + trend deltası
    ComputeMealAverages.ts                        → beslenme geçmişinden aralık bazlı istatistik
    ComputeTopFoods.ts                              → en çok tüketilen yemekler
    ComputeCorrelation.ts                             → iki metrik arası korelasyon

  use-cases/
    GetDailySummary.ts                  → Belirli bir günün özetini getirir (read-model üzerinden)
    GetWeeklyTrend.ts                     → Haftalık trend verisini getirir
    GenerateMealInsights.ts                 → Metinsel içgörüler (kural tabanlı template ile başlar,
                                              ileride LLM'e taşınabilir)

  ports/
    AnalyticsReadPort.ts                   → Özet verisini okuma sözleşmesi (optimize read-model)
    DailySummaryUpdaterPort.ts               → Event geldiğinde özet tabloyu güncelleme sözleşmesi
    InsightGeneratorPort.ts                    → İçgörü üretme sözleşmesi

  adapters/
    repository/
      PrismaAnalyticsReadAdapter.ts            → AnalyticsReadPort implementasyonu (ayrı, optimize view/tablo)
      PrismaDailySummaryUpdater.ts               → DailySummaryUpdaterPort implementasyonu
    insights/
      TemplateInsightGenerator.ts                → InsightGeneratorPort'un kural-tabanlı ilk implementasyonu
      LlmInsightGenerator.ts                       → İleride: InsightGeneratorPort'un LLM implementasyonu

  events/
    MealLoggedEventHandler.ts               → nutrition-logging'ten gelen event'i dinler,
                                                daily_summary read-model'ini günceller (CQRS'in hafif hali)

  http/
    BodyAnalyticsController.ts                → summary/trend/insights endpoint'leri
    bodyAnalyticsRoutes.ts                      → Route tanımları + wiring
```

### 8.8 `src/modules/chatbot/`

```
chatbot/
  domain/
    Conversation.ts                → Konuşma entity'si (id, userId, messages)
    Message.ts                       → Tek mesaj entity'si (role, content, timestamp)

  use-cases/
    SendMessage.ts                    → Mesaj gönderip streaming yanıt üreten ana use-case (AsyncIterable döner)
                                        (trace_id = conversationId, ayrıca her istekte messageId — bkz §6)
    GetConversationHistory.ts           → Geçmiş konuşmayı getirir
    tools/
      MealDataTool.ts                     → nutrition-logging'in public use-case'ini "araç" olarak çağıran köprü
      AnalyticsSummaryTool.ts               → body-analytics'in public use-case'ine bağlanan köprü
                                              (chatbot diğer modüllerin İÇİNE değil, SADECE bu köprüler
                                              üzerinden erişir)

  ports/
    LlmChatPort.ts                      → LLM'e streaming mesaj gönderme sözleşmesi
    ConversationRepositoryPort.ts          → Konuşma geçmişini kaydetme/okuma sözleşmesi

  adapters/
    llm/
      OpenAiChatAdapter.ts                  → LlmChatPort'un LLM sağlayıcısına bağlanan implementasyonu
    repository/
      PrismaConversationRepository.ts         → ConversationRepositoryPort implementasyonu

  rateLimiting/
    chatRateLimiter.ts                        → Kullanıcı bazlı mesaj/dakika sınırlaması (maliyet kontrolü)

  http/
    ChatController.ts                        → SSE/WebSocket endpoint'i
    chatRoutes.ts                              → Route tanımları + wiring
```

### 8.9 `src/modules/notifications/`

```
notifications/
  domain/
    DeviceToken.ts                    → Push token entity'si

  use-cases/
    RegisterDeviceToken.ts            → Push token'ı kaydeder

  ports/
    PushSenderPort.ts                 → Push bildirim gönderme sözleşmesi
    DeviceTokenRepositoryPort.ts        → Token kayıtlarının okuma/yazma sözleşmesi

  adapters/
    push/
      FcmPushAdapter.ts                 → PushSenderPort'un FCM implementasyonu
      ApnsPushAdapter.ts                  → PushSenderPort'un APNs implementasyonu
    repository/
      PrismaDeviceTokenRepository.ts        → DeviceTokenRepositoryPort implementasyonu

  jobs/
    MealReminderScheduler.ts            → Kullanıcının seçtiği saatte push tetikler (Scheduled/Background)
    StreakSaverAlertJob.ts                → Gün bitmeden N saat önce, gün tamamlanmadıysa uyarır
                                            (daily-tracking'in DefineDayCompletion'ını köprü üzerinden kullanır)
    WeeklyReportJob.ts                      → Haftalık özet üretir ve gönderir
                                            (body-analytics + nutrition-logging'den köprü üzerinden veri okur)

  http/
    NotificationsController.ts            → /device-token endpoint'i
    notificationsRoutes.ts                  → Route tanımları + wiring
```

### 8.10 `src/modules/subscription/`

```
subscription/
  domain/
    DetermineEntitlement.ts           → Geçerli makbuz + expiresAt → premium mu (pure)

  use-cases/
    PurchaseSubscription.ts           → Satın alma akışını yönetir
    ValidateReceipt.ts                  → Apple/Google makbuzunu doğrular use-case'i

  ports/
    ReceiptValidatorPort.ts            → Makbuz doğrulama sözleşmesi
    SubscriptionRepositoryPort.ts        → Abonelik kayıtlarının okuma/yazma sözleşmesi

  adapters/
    billing/
      AppleReceiptAdapter.ts             → ReceiptValidatorPort'un Apple implementasyonu
      GoogleReceiptAdapter.ts              → ReceiptValidatorPort'un Google implementasyonu
    repository/
      PrismaSubscriptionRepository.ts        → SubscriptionRepositoryPort implementasyonu

  http/
    SubscriptionController.ts            → /subscription/purchase, /subscription/status endpoint'leri
    subscriptionRoutes.ts                  → Route tanımları + wiring
```

---

## 9. Genel İsimlendirme ve Sınır Kuralları (özet)

- **Port'u her zaman kullanan modül tanımlar**, sağlayan değil.
- **`domain/` klasöründeki her dosya I/O içermez** — framework'ten, DB'den, HTTP'den bağımsız.
- **`adapters/` alt klasörleri bağlandıkları dış sisteme göre isimlendirilir** (`photo/`,
  `barcode/`, `llm/`, `push/`), akışa göre değil.
- **`events/` klasörü modüller arası asenkron iletişim için** — bir adapter değil, HTTP yerine
  event ile tetiklenen bir use-case gibi düşünülmeli.
- **`jobs/` klasörü sadece gerçekten asenkron/zamanlanmış akışlar için açılır.**
- **Test dosyaları kaynağın yanında** (`X.ts` + `X.test.ts`), ayrı `__tests__/` ağacında değil.
- **Yeni modül eklerken aynı iskelet kopyalanır** — mevcut hiçbir modül bu ekten etkilenmez.

---

## 10. Sıradaki Adımlar

1. Bu doküman referans alınarak Claude Code ile genel klasör/dosya iskeleti oluşturulacak
   (boş dosyalar + temel export'lar, iş mantığı yok).
2. Modül modül "rule" dosyaları yazılacak (her modülün use-case detayları, DB şeması,
   endpoint sözleşmeleri) ve ilgili modül klasörlerine yerleştirilecek.
3. Rule'lara göre Claude Code'a promptlar yazılıp backend tamamlanacak.
4. Observability (Sentry, Grafana/Axiom kurulumu), R2, Prisma migration'ları gibi somut
   altyapı kurulumlarına geçilecek.
