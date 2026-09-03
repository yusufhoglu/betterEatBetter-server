# Shared Katmanı — Rule

Bu dosya `src/shared/` altında kod yazarken (ya da yazdıran Claude Code için) uyulması
gereken kuralları, atlanmaması gereken nüansları ve best practice'leri listeler.
Referans: `backend-architecture.md` §3 ve §6.

---

## Hata Taksonomisi (`errors/`)

- `DomainError` base sınıf, HER alt sınıf bir `code: string` alanı taşır (örn. `IMAGE_UNREADABLE`,
  `LOW_CONFIDENCE`) — modül-spesifik detay burada, HTTP status genel sınıfta yaşar.
- Alt sınıflar: `ValidationError`(400), `NotFoundError`(404), `ConflictError`(409),
  `UnauthorizedError`(401), `RateLimitError`(429), `IntegrationError`(502/503).
- `RateLimitError` ayrıca `retryAfterSeconds: number` taşır — `errorMapper` bunu
  `Retry-After` HTTP header'ına otomatik çevirir.
- `IntegrationError` bir `retryable: boolean` flag'i taşır — bu flag'e göre çağıran kod
  (job worker) retry yapıp yapmayacağına karar verir (`UnrecoverableError` ile BullMQ'ya
  bildirilir, retry döngüsüne sokulmaz).
- **Asla** modül kodunda çıplak `throw new Error(...)` kullanılmaz — her zaman taksonomideki
  bir sınıf fırlatılır. `errorMapper`, tanımadığı bir hata görürse 500 + generic mesaj döner
  (detay sızdırmaz).

## Rate Limiting (`rateLimiting/`)

- Tek bir genel fonksiyon: `checkRateLimit(key, limit, windowSeconds)`. Redis sliding-window
  tabanlı, `shared/cache/redisCacheClient.ts`'i kullanır (kuyruk Redis'inden AYRI).
- Modüller kendi `key` formatını belirler (örn. `chat:${userId}`, `signin:${ip}`,
  `photo:${userId}`) — mekanizma modülden habersiz, sadece key/limit/window parametre alır.
- Limit aşıldığında `RateLimitError` fırlatılır, çıplak `429` response yazılmaz.
- **`rateLimiting/dailyQuota.ts` — free-tier günlük kota** (`checkRateLimit`'ten AYRI
  mekanizma): `consumeDailyQuota(key, limit)` / `peekDailyQuota` / `refundDailyQuota`.
  UTC takvim gününe göre fixed-window sayaç (`quota:<key>:<YYYY-MM-DD>`, ertesi UTC gece
  yarısından hemen sonra expire). **Fail-open** (`checkRateLimit`'in aksine — Redis
  düşerse istek GEÇER). Premium bypass ÇAĞIRANIN işi (sadece free kullanıcı için çağrılır).
  Aşıldığında `RateLimitError` `FREE_TIER_DAILY_LIMIT` koduyla fırlar (mobil bunu "upsell
  göster" olarak yorumlar, "yavaşla" değil). Env: `FREE_DAILY_PHOTO_LIMIT` (1),
  `FREE_DAILY_CHAT_LIMIT` (7), `RATE_LIMIT_ENABLED` ile birlikte gate'lenir.

## DI / Wiring

- **Container YOK.** Her `xRoutes.ts` kendi adapter'larını `new` ile kurar, use-case'e
  constructor injection ile geçirir. Bağımlılıklar HER ZAMAN açıkça görünür olmalı.
- Singleton altyapı client'ları (`prisma`, `cacheRedisClient`, `queueRedisConnection`,
  `objectStorageClient`) modül seviyesinde `export const` olarak tanımlanır, her `xRoutes.ts`
  bunları import edip enjekte eder — tekrar `new` edilmez.

## Auth (`auth/`)

- Access token: stateless JWT doğrulama (imza kontrolü, DB'ye gitmez). Kısa ömürlü (15-30dk).
- Refresh token: DB'de saklanır, **rotation zorunlu** — her `RefreshSession` çağrısında eski
  refresh token geçersiz kılınır, yenisi üretilir.
- **Reuse detection zorunlu**: zaten geçersiz kılınmış bir refresh token tekrar kullanılmaya
  çalışılırsa, o kullanıcının TÜM aktif refresh token'ları iptal edilir (çalıntı token sinyali).
- `authMiddleware.ts`, doğrulanmış `userId`'yi `AuthContext`'e yazar — controller'lar bunu
  oradan okur, hiçbir yerde JWT'yi elle parse etmez.

## Config (`config/env.ts`)

- **Fail-fast zorunlu**: `envSchema.parse(process.env)` uygulama başlangıcında (ilk satırlarda,
  başka hiçbir modül import edilmeden önce) çalışır. Eksik/hatalı env varsa uygulama
  **hiç başlamaz**.
- Modüller `process.env.X` okumaz — her zaman `import { env } from 'shared/config/env'`
  üzerinden, tip-güvenli erişim.

## Resilience (`resilience/`)

- Kütüphane: **cockatiel**. Circuit breaker + retry + timeout composable policy olarak
  tanımlanır, üç ayrı kütüphane kullanılmaz.
- Varsayılan circuit breaker parametreleri: 5 ardışık hata → açık, 30 saniye sonra half-open.
- Her dış entegrasyon adapter'ı (Python RAG, LLM, barkod API) kendi policy instance'ını
  `shared/resilience/`'daki builder'dan türetir, kendi timeout/limit değerlerini geçer.
- Retry SADECE `retryable: true` olan `IntegrationError`'larda devreye girer — timeout ve
  model hatası gibi durumlar genelde retryable DEĞİLDİR (kaynak israfı olur).

## Trace Context (`observability/tracer.ts`)

- Mekanizma: **`AsyncLocalStorage`**. Header parametre olarak fonksiyonlara taşınmaz.
- HTTP request middleware'i, gelen `x-trace-id` header'ını okur (yoksa üretir),
  `runWithContext` ile context'i kurar.
- **KRİTİK NÜANS — asla unutulmamalı**: orijinal HTTP request zincirinin DIŞINDA başlayan
  HER yeni async context (BullMQ job worker, cron/scheduled job, event handler) context'i
  OTOMATİK miras almaz. Bu noktaların HER BİRİ, işlemeye başlamadan önce elle
  `runWithContext({ traceId: job.data.traceId }, () => {...})` çağırmak ZORUNDADIR.
  Atlanırsa o context'teki TÜM loglar trace_id'siz kalır, sessizce.
- Bunu tekrar tekrar elle yazmamak için: `shared/queue/queueConnection.ts`'teki
  `createWorker` fonksiyonu, processor'ı sarmalayıp context kurulumunu OTOMATİK yapmalı —
  her job dosyası bunu elle yapmak zorunda kalmamalı.
- Chatbot istisnası: trace_id = `conversationId` (mesaj başına değil, konuşma boyunca sabit).
  Ayrıca her mesaj isteğinde ayrı bir `messageId` de taşınır ve loglara eklenir.

## Queue (`queue/`)

- BullMQ Redis bağlantısı `maxRetriesPerRequest: null` ile kurulur (BullMQ zorunluluğu),
  cache Redis client'ından TAMAMEN ayrı.
- **`jobId` her zaman deterministik olmalı** (örn. `mealPhotoId`), rastgele/otomatik ID
  kullanılmaz. Bu, aynı işin (ağ retry'ı, çift tıklama) iki kez kuyruğa girmesini
  BullMQ'nun kendi mekanizmasıyla otomatik engeller.
- Kullanıcı bilinçli olarak yeni bir fotoğraf/işlem başlattığında YENİ bir id üretilir
  (yeni `mealPhotoId`) — idempotency sadece aynı id'nin tekrarında devreye girer.
- Bull Board mount edilir, sadece auth'lu/internal route olarak (herkese açık olmaz).
- Worker concurrency, bağlı olduğu dış servisin (örn. Python RAG) kapasitesini AŞMAYACAK
  şekilde sınırlanır — aksi halde dış servis kendi trafiğinizle boğulur.

## Scheduling (`scheduling/`)

- Kullanıcıya özel zamanlı hatırlatmalar (örn. öğün saati) için kullanıcı başına ayrı
  repeatable job AÇILMAZ. Tek bir job (örn. her 15 dakikada bir) çalışıp "şu an tetiklenmesi
  gereken kullanıcılar" için DB sorgusu yapar.
- Zaman hesaplamaları HER ZAMAN `shared/domain/resolveUserToday.ts` (veya eşdeğeri) ile
  kullanıcının kendi saat diliminde yapılır, sunucu saatinde değil.
- Her scheduled job tanımı SABİT bir `jobId`/`repeat` konfigürasyonu kullanır — yatay
  ölçeklemede (birden fazla Node instance'ı) aynı job'ın birden fazla kez tetiklenmesini
  BullMQ'nun kendi dedup mekanizması bu sayede engeller.

## Storage (`storage/`)

- **Direct upload zorunlu**: mobil, fotoğrafı doğrudan R2'ye yükler (presigned PUT URL ile).
  Node hiçbir zaman binary görsel veriyi kendi üzerinden taşımaz.
- Akış: `pending/{mealPhotoId}.jpg`'ye yüklenir → backend hızlı senkron validasyon yapar
  (bu URL üzerinden) → başarılıysa hem analiz job'ı hem "final konuma kopyalama" job'ı
  PARALEL tetiklenir.
- **KRİTİK NÜANS**: final konuma taşıma işlemi **COPY**'dir, **MOVE (silme) DEĞİLDİR**.
  `pending/` içindeki orijinal dosya silinmez — worker'ın job'ı ne zaman işleyeceği
  garanti olmadığı için (kuyrukta bekleyebilir), silme yapılırsa analiz job'ı çalıştığında
  404 alma riski oluşur.
- `pending/` prefix'i, bucket'ın kendi **lifecycle rule**'u ile 24 saat sonra otomatik
  silinir — elle cleanup job'ı yazılmaz.
- Key formatı: `users/{userId}/meals/{mealPhotoId}.jpg` — hiyerarşik, hesap silme
  taleplerinde prefix ile toplu işlem yapılabilir olmalı.

## Logger (`observability/logger.ts`)

- Kütüphane: **pino**, JSON structured output.
- Her modül kendi **module-scoped child logger**'ını oluşturur
  (`createModuleLogger('food-recognition')`) — `module` alanı elle her log çağrısında
  yazılmaz, child logger'a bir kere gömülür.
- `traceId`, `AsyncLocalStorage`'tan otomatik enjekte edilir — elle geçirilmez.
- Seviye kuralları: `debug` (sadece dev), `info` (normal akış), `warn` (circuit breaker açıldı,
  rate limit tetiklendi, low confidence), `error` (gerçek, müdahale gerektiren hata).
- **Zorunlu redaction**: `password`, `accessToken`, `refreshToken`, `Authorization` header
  gibi alanlar `pino`'nun `redact` seçeneğiyle GLOBAL olarak, `logger.ts`'in içinde bir kere
  tanımlanır. Hiçbir modülün bunu hatırlamasına güvenilmez.

## Metrics (`observability/metrics.ts`)

- Kütüphane: **prom-client**.
- Baştan tanımlanması gereken temel metrikler: `http_request_duration_seconds`,
  `queue_job_duration_seconds`, `queue_depth`, `integration_call_duration_seconds`,
  `circuit_breaker_state`, `nutrition_low_confidence_total`.
- `GET /metrics` endpoint'i public DEĞİLDİR — internal network'e kapalı ya da auth'lu olmalı.

## LLM Client (`llm/`) — sağlayıcı-agnostik, çok amaçlı

- Bu, sadece `chatbot`'un değil, birden fazla modülün (food-recognition'ın text
  tahmini, body-analytics'in insight üretimi, ileride başka özellikler) paylaştığı
  bir ALTYAPI client'ı — `prisma`/`cacheRedisClient` ile aynı katman, `shared/`'de
  yaşaması bilinçli (YAGNI kuralı burada uygulanmaz, tıpkı outbox gibi).
- **Kanonik mesaj formatı**: `LlmMessage: { role: 'system'|'user'|'assistant'|'tool';
  content: string; toolCallId?: string; toolCalls?: {id, name, input}[] }`. Her
  sağlayıcı adapter'ı KENDİ formatına bu kanonik formattan ÇEVİRİR — modüller hiçbir
  zaman sağlayıcıya özel bir tip görmez.
- **İki metod**: `complete(request): Promise<LlmCompleteResponse>` (tool-calling
  turları ve tek seferlik/yapılandırılmış istekler için) ve
  `streamComplete(request): AsyncIterable<string>` (SADECE son, araç çağrısı
  içermeyen metin yanıtı için — chatbot akışı: tool-calling turları `complete()` ile
  loop'lanır, tool çağrısı kalmayınca SON turda `streamComplete()`'e geçilir).
- **Structured output — "zorla tool çağrısı" hilesi**: native JSON mode KULLANILMAZ
  (sağlayıcılar arası garanti farklı). Bunun yerine, yapılandırılmış çıktı isteyen her
  çağrı, sahte bir "sonucu bildir" tool'u tanımlar ve `forceToolChoice` ile modelin
  BUNU çağırmasını zorunlu kılar — bu teknik TÜM sağlayıcılarda güvenilir çalışır,
  sağlayıcı değişince kod değişmez.
- **Sağlayıcı seçimi**: `LLM_PROVIDER` env değişkeni (`openai|anthropic|deepseek`),
  `createLlmClient()` factory fonksiyonu doğru adapter'ı döner. Yeni sağlayıcı eklemek
  = yeni bir `providers/xProvider.ts` dosyası, başka hiçbir yer DEĞİŞMEZ.
- Her çağrı `shared/resilience/policies.ts`'teki cockatiel policy ile sarmalanır
  (circuit breaker + retry + timeout) — LLM çağrıları da bir "dış entegrasyon".
- **Maliyet takibi**: her `complete()`/`streamComplete()` çağrısı opsiyonel bir
  `feature: string` alanı alır (`'chatbot'`, `'food-recognition-text'` gibi) —
  `llm_tokens_total{provider, feature, type}` (Counter, `shared/observability/
  metrics.ts`) bu etikete göre artırılır, hangi özelliğin ne kadar token yaktığı
  ayrı ayrı görünür olur.
- Modüller `LlmClient`'ı DOĞRUDAN kullanmaz — her modül kendi dar Port'unu tanımlar
  (`chatbot/LlmChatPort`, `food-recognition/TextEstimatorPort` gibi), o Port'un
  adapter'ı bu shared client'ı çağırır (kural: kullanan tanımlar, `objectStorageClient`
  ↔ `ImageStoragePort` ayrımıyla birebir aynı desen).
- **Özellik-bazlı model seçimi**: `OPENAI_MODEL`/`ANTHROPIC_MODEL` sadece sağlayıcı
  seviyesinde bir VARSAYILAN'dır. Her tüketici modül, kendi `complete()`/
  `streamComplete()` çağrısında `model` parametresini KENDİ özellik-bazlı env
  değişkeninden geçirir — sağlayıcıdan BAĞIMSIZ isimlendirilir (`OPENAI_`/`ANTHROPIC_`
  öneki YOK), çünkü sağlayıcı değişse bile bu değişkenin anlamı aynı kalmalı:
  - `CHATBOT_MODEL` (varsayılan `gpt-5-mini`) — kullanıcıyla doğrudan sohbet, kalite öncelikli
  - `FOOD_TEXT_MODEL` (varsayılan `gpt-5-mini`) — yapılandırılmış/basit metin
    tahmini (`food-recognition/RecognizeFromText`), maliyet öncelikli
  Yeni bir LLM-tüketen özellik eklendiğinde, aynı desenle kendi
  `{ÖZELLİK}_MODEL` değişkenini tanımlar — `shared/config/env.ts`'e eklenir.



- ORM: **Prisma**. Tek `prisma` client instance'ı, tüm modüller paylaşır.
- Repository metodları OPSİYONEL bir transaction client parametresi kabul eder — outbox
  pattern gereken yerlerde (kayıt + event aynı transaction) bu kullanılır, verilmezse
  repository kendi bağlantısını kullanır.
- **Outbox tablosu — genel/paylaşılan** (`shared/persistence/outbox.ts` + Prisma modeli):
  ```
  OutboxEvent: id, eventType (string), payload (Json), createdAt, processedAt (DateTime?)
  ```
  `publishEvent(tx, eventType, payload)` yardımcı fonksiyonu, verilen transaction client'ı
  ile aynı transaction içinde bir `OutboxEvent` satırı yazar. Bu tablo `shared/`'de çünkü
  birden fazla modülün (yayıncı + dinleyici farklı modüller) kullanacağı bir mekanizma —
  domain'e özel pure logic değil, altyapısal bir pattern, YAGNI kuralı burada uygulanmaz.
  Event'lerin İŞLENMESİ (okunup ilgili modüle dağıtılması) ayrı bir mekanizma/worker
  gerektirir — bu, event'i ilk tüketen modülün turunda (örn. `body-analytics`) detaylandırılır.
- **KRİTİK — Postgres testcontainer image'ı**: `schema.prisma`'nın migration'ı
  `CREATE EXTENSION IF NOT EXISTS "vector"` (pgvector) içeriyor. Bu yüzden HERHANGİ bir
  integration testte `PostgreSqlContainer` kullanılırken düz `postgres:16-alpine` image'ı
  KULLANILMAZ — migration adımı bu extension'ı bulamayıp patlar. Her zaman
  **`pgvector/pgvector:pg16`** (resmi pgvector image'ı, postgres:16 ile birebir uyumlu)
  kullanılır. Bu kural TÜM modüllerin Postgres testcontainer'larına uygulanır, sadece
  food-recognition'a özgü değil.
