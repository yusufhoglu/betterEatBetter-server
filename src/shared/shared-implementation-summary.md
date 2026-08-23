# Shared Katmanı — Implementasyon Özeti

`src/shared/` katmanı `shared-rule.md`'deki tüm kurallara göre gerçek, çalışan kodla
kuruldu (placeholder/TODO değil). Bu doküman hangi dosyanın hangi kurala karşılık
geldiğini özetler.

**Doğrulama durumu:** `tsc --noEmit` → 0 hata. `npm run test:unit` → 45 suite yeşil.
Ayrıca tüm yeni dosyalar offline bir smoke test'te gerçekten çalıştırıldı (JWT
round-trip, AsyncLocalStorage trace enjeksiyonu, presigned URL üretimi, Queue/Worker/
BullBoard kurulumu, error taksonomisi — hepsi doğru davrandı). Bu ortamda canlı
Postgres/Redis olmadığı için o kısımlar sadece bağlantı kurulumu seviyesinde
doğrulandı, gerçek sorgu/komut çalıştırılmadı.

---

## Dosya → Kural Eşlemesi

| Dosya | Rule'daki karşılığı |
|---|---|
| `errors/DomainError.ts` + 5 alt sınıf (`ValidationError`, `NotFoundError`, `ConflictError`, `UnauthorizedError`, `RateLimitError`) | "Hata Taksonomisi" — her alt sınıf `code`, sabit `httpStatus`; `RateLimitError.retryAfterSeconds`, `IntegrationError.retryable` |
| `errors/errorMapper.ts` | DomainError → HTTP status, `RateLimitError` → `Retry-After` header, tanınmayan hata → generic 500 (detay sızdırmaz) |
| `rateLimiting/rateLimiter.ts` | Tek `checkRateLimit(key, limit, windowSeconds)`, Redis sliding-window (sorted set), cache client'ı kullanır (kuyruktan ayrı), limit aşılırsa `RateLimitError` fırlatır |
| `auth/jwt.ts` | Stateless access token (imza kontrolü, DB'ye gitmez), kısa ömür (`JWT_ACCESS_TOKEN_TTL_SECONDS`, default 1800s) |
| `auth/refreshTokenService.ts` | Opak, DB'de saklanan token (JWT değil — sadece hash'i saklanır); rotation zorunlu; reuse detection: zaten iptal edilmiş bir token tekrar sunulursa kullanıcının TÜM refresh token'ları iptal edilir |
| `auth/authMiddleware.ts` | JWT'yi tek yerde çözer, doğrulanmış `userId`'yi `AuthContext`'e (`req.auth`) yazar — controller'lar elle parse etmez |
| `config/env.ts` | `envSchema.parse(process.env)` modül yüklenirken (import-time) çalışır → fail-fast; Node'un senkron import çözümlemesi sayesinde `app.listen()`'a hiç ulaşmadan patlar |
| `resilience/policies.ts` | cockatiel: `wrap(retry, circuitBreaker, timeout)` tek composed policy; retry SADECE `retryable: true` olan `IntegrationError`'larda devreye girer; circuit breaker `ConsecutiveBreaker(5)` + 30sn half-open (varsayılan), her failure'da (retryable olmasa da) tetiklenir |
| `observability/tracer.ts` | `AsyncLocalStorage` mekanizması, `runWithContext` / `getTraceId` / `getUserId` / `setUserId` / `setMessageId` — chatbot istisnası için `messageId` alanı ayrı taşınır |
| `observability/tracingMiddleware.ts` | `x-trace-id` header'ını okur (yoksa üretir), `runWithContext` ile context'i kurar |
| `observability/logger.ts` | pino `mixin()` ile trace context OTOMATİK enjekte edilir (elle geçirilmez), global `redact` listesi bir kere tanımlı, `createModuleLogger()` ile module-scoped child logger |
| `observability/metrics.ts` | prom-client, rule'da listelenen 6 temel metrik (`http_request_duration_seconds`, `queue_job_duration_seconds`, `queue_depth`, `integration_call_duration_seconds`, `circuit_breaker_state`, `nutrition_low_confidence_total`) birebir tanımlı |
| `queue/queueConnection.ts` | **Kritik nüans**: `createWorker`, processor'ı sarıp `job.data.traceId`'den `runWithContext` kurar — her worker dosyasının bunu elle yapmasına gerek yok. Ayrıca non-retryable `IntegrationError`'ı BullMQ `UnrecoverableError`'a çevirir (retry döngüsüne sokmaz) |
| `queue/redisConnection.ts` | `maxRetriesPerRequest: null` (BullMQ zorunluluğu), cache client'tan tamamen ayrı bağlantı |
| `queue/bullBoardSetup.ts` | Router `authMiddleware` ile korunuyor, `main.ts` internal bir path'e mount edecek (herkese açık değil) |
| `queue/jobTypes.ts` | `BaseJobPayload { traceId: string }` — tüm job payload'larının taşıması gereken ortak taban |
| `scheduling/cronRunner.ts` | `ScheduledJobDefinition.jobId` **zorunlu** alan (opsiyonel değil) — sabit jobId garantisi imza seviyesinde sağlanır |
| `scheduling/scheduledJobRegistry.ts` | Gerçek, çalışan registry mekanizması; henüz gerçek job kaydı yok |
| `storage/objectStorageClient.ts` | R2 S3Client kurulumu, endpoint `R2_ACCOUNT_ID`'den türetilir |
| `storage/presignedUrl.ts` | `pending/{id}` için presigned PUT URL; final konuma **COPY** (MOVE/delete YOK — worker'ın job'ı ne zaman işleyeceği garanti değil); key formatı `users/{userId}/meals/{id}.jpg` (hiyerarşik, hesap silmede prefix ile toplu işlem) |
| `cache/redisCacheClient.ts` | Cache için ayrı ioredis client, farklı `REDIS_CACHE_URL` — kuyruk Redis'inden izole |
| `persistence/db.ts` | Tek `PrismaClient` instance'ı, tüm uygulama paylaşır |
| `persistence/transaction.ts` | `withTransaction()` → `prisma.$transaction`, outbox pattern için; repository'ler opsiyonel `tx` parametresi alacak şekilde tasarlanabilir |
| `schema.prisma` | Bu aşamada sadece `User` + `RefreshToken` (minimal) — özellik modüllerinin şemaları ayrı promptlarda eklenecek; pgvector extension'ı hazır (`postgresqlExtensions` preview feature) |

---

## Dokümandan Sapma Yok — Ama Netleştirilen Bir Karar

`shared-rule.md` "Refresh token: DB'de saklanır" diyordu ama JWT mi opak token mı
olacağını açıkça belirtmiyordu. Reuse detection'ın güvenilir çalışması için **opak,
hash'lenmiş DB token** seçildi (JWT ile de yapılabilirdi ama o zaman "kullanıcının
tüm token'larını iptal etme" için ayrıca bir denylist mekanizması gerekirdi — gereksiz
karmaşıklık). Bu yüzden `.env.example` ve `package.json` buna göre: `JWT_SECRET`
tekil ve sadece access token imzalamak için kullanılıyor.

## Kapsam Dışı

`food-recognition`, `chatbot` gibi özellik modüllerine bu promptta hiç dokunulmadı —
sadece `src/shared/` katmanı kuruldu.
