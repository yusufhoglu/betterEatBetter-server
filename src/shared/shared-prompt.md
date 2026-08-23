# Claude Code Prompt — `src/shared/` Katmanı
## PROMPT

```
Bu bir TypeScript backend projesi (food-tracking mobil uygulaması). Modüler monolit +
Ports & Adapters mimarisi kullanıyoruz. Şu anda SADECE src/shared/ katmanını kuracağız —
bu katman tüm özellik modüllerinin (food-recognition, chatbot, nutrition-logging, vb.)
üzerine bağımlı olacağı ortak altyapı.

Aynı klasördeki shared-rule.md dosyasını oku ve TÜM kurallarına harfiyen uy. O dosyadaki
her madde bilinçli bir mimari kararın sonucu, atlama veya "daha basit" bir alternatifle
değiştirme.

Kurulacak teknoloji seçimleri:
- ORM: Prisma
- Kuyruk: BullMQ + Redis (ioredis)
- Cache: Redis (ioredis, kuyruktan AYRI client/db index)
- Object storage: Cloudflare R2 (@aws-sdk/client-s3, S3-uyumlu)
- Resilience: cockatiel (circuit breaker + retry + timeout)
- Logger: pino
- Metrics: prom-client
- Config validation: zod
- Trace context: Node'un yerleşik AsyncLocalStorage'ı (async_hooks)
- Job dashboard: @bull-board/express

Oluşturulacak dosya/klasör yapısı (shared-rule.md'deki açıklamalara göre gerçek,
çalışan kod yaz — bu katman iş mantığı değil altyapı, o yüzden boş iskelet değil,
tam implementasyon istiyorum):

src/shared/
  observability/
    logger.ts              -> pino kurulumu, module-scoped child logger factory,
                               redact listesi, AsyncLocalStorage'tan traceId enjeksiyonu
    tracer.ts               -> AsyncLocalStorage tanımı, runWithContext, getTraceId,
                               getUserId gibi context erişim fonksiyonları
    metrics.ts                -> prom-client Registry + rule dosyasında listelenen
                               temel metrikler (Histogram/Gauge/Counter tanımları)
    tracingMiddleware.ts         -> Express middleware, x-trace-id header'ını okur/üretir,
                               runWithContext ile context kurar

  resilience/
    policies.ts             -> cockatiel ile circuit breaker + retry + timeout'u
                               kompoze eden, parametrik bir policy builder fonksiyonu
                               (her adapter kendi timeout/threshold değerini geçirebilsin)

  queue/
    redisConnection.ts      -> BullMQ'ya özel ioredis bağlantısı (maxRetriesPerRequest: null)
    queueConnection.ts        -> createQueue() ve createWorker() factory fonksiyonları.
                               createWorker MUTLAKA processor'ı sarmalayıp job.data.traceId'yi
                               okuyup runWithContext ile context kursun (bkz rule dosyası
                               "kritik nüans" kısmı) — bunu HER worker dosyasının elle
                               yapmasına gerek kalmamalı.
    jobTypes.ts                 -> Ortak job payload tipi (en azından { traceId: string }
                               taşıyan bir base interface)
    bullBoardSetup.ts             -> Bull Board Express router kurulumu, auth middleware
                               ile korunmalı, main.ts'te internal bir path'e mount edilecek

  cache/
    redisCacheClient.ts     -> Cache için ayrı ioredis client (farklı db index)

  scheduling/
    cronRunner.ts            -> BullMQ repeatable job kurulumu için yardımcı fonksiyon,
                               sabit jobId zorunluluğunu garanti eden bir imza kullan
    scheduledJobRegistry.ts    -> Job tanımlarının kaydedileceği boş bir registry (henüz
                               gerçek job yok, sadece registry mekanizması)

  storage/
    objectStorageClient.ts   -> R2 S3Client kurulumu (env'den endpoint/credentials)
    presignedUrl.ts             -> pending/{id} için presigned PUT URL üreten,
                               final konuma COPY (move değil) yapan yardımcı fonksiyonlar

  persistence/
    db.ts                    -> Prisma client kurulumu, tek instance export
    transaction.ts             -> prisma.$transaction wrapper'ı, outbox pattern için

  errors/
    DomainError.ts           -> Base sınıf + code alanı
    ValidationError.ts, NotFoundError.ts, ConflictError.ts, UnauthorizedError.ts,
    RateLimitError.ts (retryAfterSeconds alanıyla), IntegrationError.ts (retryable flag'iyle)
    errorMapper.ts              -> Express error handling middleware, her sınıfı doğru HTTP
                               koduna çevirir, RateLimitError için Retry-After header'ı ekler

  rateLimiting/
    rateLimiter.ts            -> Redis sliding-window tabanlı checkRateLimit(key, limit,
                               windowSeconds) fonksiyonu, limit aşılırsa RateLimitError fırlatır

  auth/
    authMiddleware.ts         -> JWT doğrulama (stateless, imza kontrolü), AuthContext'e yazma
    AuthContext.ts              -> Context tipi
    jwt.ts                        -> Access token üretme/doğrulama yardımcıları
    refreshTokenService.ts          -> Refresh token rotation + reuse detection mantığı
                                 (DB'de saklama, eski token'ı geçersiz kılma, reuse
                                 tespit edilirse kullanıcının TÜM refresh token'larını
                                 iptal etme)

  config/
    env.ts                     -> zod şeması, envSchema.parse(process.env) ile fail-fast
                                 validation, tip-güvenli env export'u

Beklentiler:
- Her dosya gerçek, çalışan, derlenebilir TypeScript kodu içersin — placeholder/TODO değil.
- Ortak env değişkenlerini (DATABASE_URL, REDIS_URL, REDIS_CACHE_URL, R2_*, JWT_SECRET,
  RAG_SERVICE_URL vb.) env.ts şemasında tanımla, sonra her dosyada oradan kullan.
- package.json'a gerekli bağımlılıkları (prisma, @prisma/client, bullmq, ioredis, cockatiel,
  pino, prom-client, zod, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, @bull-board/express,
  @bull-board/api, jsonwebtoken) ekle.
- Prisma şemasını (schema.prisma) bu aşamada SADECE bu katmanın ihtiyaç duyduğu minimal
  modellerle başlat (User, RefreshToken) — özellik modüllerinin şemaları ayrı promptlarda
  eklenecek.
- Modül modül iş mantığına GİRME — bu prompt sadece shared/ katmanı için. food-recognition,
  chatbot gibi modüllere hiç dokunma.
- İşin sonunda kısa bir özet ver: hangi dosyayı neden bu şekilde yazdığını, rule dosyasındaki
  hangi kurala karşılık geldiğini listele.
```
