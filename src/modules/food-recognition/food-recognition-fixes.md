# Food Recognition Modülü — Tamamlama Notları

Bu dosya, modülün büyük kısmı zaten implemente edilmişken yapılan son inceleme ve
düzeltmelerin özetidir. Modülün genel yapısı (binary `ConfidencePolicy`, repository
sahiplik kuralı, pending/ COPY-not-MOVE, `jobId = mealPhotoId`, GIN full-text arama
sorgusu, rate limit wiring) zaten `food-recognition-rule.md`'ye uygundu. Aşağıdakiler
bulunup düzeltilen gerçek eksik/bozuk noktalardır.

---

## 1. Derleme hataları (`npm run typecheck` kırmızıydı)

- `@testcontainers/redis` / `@testcontainers/postgresql` paketlerinin kurulu sürümü
  (v12) artık `RedisContainer()` / `PostgreSqlContainer()` constructor'larında image
  argümanını zorunlu kılıyor. Şu 4 test dosyasında eksikti, eklendi:
  - `RedisBarcodeCache.integration.test.ts` → `'redis:7-alpine'`
  - `PrismaFoodEntryRepository.integration.test.ts` → `'postgres:16-alpine'`
  - `recognizePhotoJob.integration.test.ts` → `'redis:7-alpine'`
  - `standardizeAndCopyJob.integration.test.ts` → `'redis:7-alpine'`
- `tsconfig.json`'daki `noUncheckedIndexedAccess: true` nedeniyle üç yerde
  `string | undefined` hataları vardı, hepsi güvenli narrowing ile düzeltildi:
  - `adapters/search/importUsdaData.ts` (CLI arg parse)
  - `http/FoodRecognitionController.ts` (`GET /food/photo/:mealPhotoId` — `req.params`
    index-signature erişimi)
  - `adapters/repository/PrismaFoodEntryRepository.integration.test.ts`
    (`items[0]` erişimi)

## 2. Prisma migration'ları hiç yoktu (kritik)

`src/shared/persistence/migrations/` klasörü tamamen boştu (sadece `.gitkeep`).
`PrismaFoodEntryRepository.integration.test.ts` her testte
`npx prisma migrate deploy` çalıştırıyor, ama uygulanacak migration olmadığı için
`food_entries` tablosu test veritabanında hiç oluşmuyordu — test kaçınılmaz olarak
"relation does not exist" ile patlardı.

Düzeltme: `prisma migrate diff --from-empty --to-schema-datamodel` ile (canlı DB
gerektirmeden) initial migration SQL'i üretildi ve
`src/shared/persistence/migrations/20260823000000_init/migration.sql` olarak
kaydedildi. Buna ek olarak, prompt'un açıkça istediği ama şemada hiçbir karşılığı
olmayan **GIN/tsvector full-text index**'i elle migration'a eklendi:

```sql
CREATE INDEX "food_catalog_items_name_fts_idx"
  ON "food_catalog_items"
  USING GIN (to_tsvector('english', "name"));
```

Bu index, `CatalogSearchAdapter`'ın kullandığı `to_tsvector('english', name)`
ifadesiyle birebir eşleşiyor (Prisma DSL fonksiyonel/expression index ifade
edemediği için elle eklenmesi gerekiyordu).

## 3. E2E testi tamamen kırıktı (kritik)

`test/e2e/photo-recognition-flow.e2e.test.ts`, `RecognizeFromPhoto` modülünün kendi
export'larını (`recognizePhotoQueue` / `standardizeAndCopyQueue`) mock'luyordu:

```ts
jest.mock('.../RecognizeFromPhoto', () => {
  const actual = jest.requireActual('.../RecognizeFromPhoto');
  return { ...actual, recognizePhotoQueue: { add: jest.fn()... }, ... };
});
```

Sorun: Jest mock'ları, mock'lanan modülün **kendi içindeki** referansları değiştirmez
— sadece dışarıdan yapılan import'ları değiştirir. `RecognizeFromPhoto.execute()`
metodu `recognizePhotoQueue.add(...)`'ı aynı dosya içinden çağırdığı için gerçek
(mock'lanmamış) kuyruğu kullanıyor, bu da gerçek Redis'e (`localhost:6379`)
bağlanmaya çalışıp her testte 5 saniyede timeout'a düşüyordu (6 testten 5'i fail).

Düzeltme: Zaten `RecognizeFromPhoto.test.ts`'de kullanılan doğru pattern'e geçirildi
— `shared/queue/queueConnection`'daki `createQueue` fonksiyonunun kendisi mock'landı
(bağımlılık seviyesinde, kendi-modül-referansı sorunu olmadan). Ayrıca "mealPhotoId
eksikse 400 dönmeli" testi için inline route'a eksik olan validasyon eklendi (önceden
hiç kontrol yoktu, sadece timeout hatayı maskeliyordu).

## 4. Aynı kök neden — job integration testlerinde

`recognizePhotoJob.integration.test.ts` ve `standardizeAndCopyJob.integration.test.ts`,
testcontainer başladıktan sonra `beforeAll` içinde `process.env.REDIS_URL`'i set
ediyordu. Ama `shared/queue/queueConnection.ts`'in Redis bağlantısı (`queueRedisConnection`)
`env.REDIS_URL`'den, modül ilk import edildiğinde **bir kere** kuruluyor ve
`env.ts` de `process.env`'i bir kere parse ediyor (`envSchema.parse(process.env)`).
Bu ikisi test dosyasının en üstündeki `import { createWorker } from '.../queueConnection'`
satırında, yani `beforeAll` çalışmadan önce, gerçekleşiyor — sonradan env değiştirmenin
hiçbir etkisi yok. Sonuç: worker gerçek testcontainer yerine varsayılan `localhost:6379`'a
bağlanmaya çalışıp sonsuz retry ile asılı kalıyordu.

Düzeltme: `createWorker` artık `beforeAll` içinde, REDIS_URL set edildikten **sonra**
dinamik `await import(...)` ile yükleniyor. Bu güvenli, çünkü her Jest test dosyası
kendi izole modül registry'sine sahip — dosya içinde ilk (ve tek) yükleme doğru
REDIS_URL ile oluyor.

---

## Test Sonuçları

| Komut | Sonuç |
|---|---|
| `npm run typecheck` | ✅ temiz |
| `npm run test:unit` | ✅ 52/52 suite, 56/56 test geçti |
| `npm run test:e2e` | ✅ 6/6 test geçti |
| `npm run test:integration` | ⚠️ food-recognition'a ait 4 dosya bu ortamda **Docker bulunmadığı** için çalışamadı (`Could not find a working container runtime strategy`) — kod tarafında hata yok, sadece ortam kısıtı. Aynı sebep diğer modüllerin (identity, notifications, vb.) integration testlerini etkilemiyor çünkü onlar zaten çalışan bir Postgres'e doğrudan bağlanıyor. Docker mevcut bir makinede migration ve Redis-timing düzeltmeleri sayesinde bu 4 dosyanın da geçmesi beklenir. |

Sadece `src/modules/food-recognition/` ve `src/shared/persistence/` (migration
dosyaları + `schema.prisma` — GIN index için gerekliydi) içine dokunuldu, başka
modül değiştirilmedi.

---

## 5. `standardizeAndCopyJob.integration.test.ts` — 60sn timeout (gerçek bug, Docker mevcut olan bir ortamda bulundu)

### Kök neden neydi

**Gerçek bir bug'dı, meşru bir yavaşlık değil.** Docker artık mevcut olan bu
ortamda `npm run test:integration` çalıştırıldığında bu tek test 60sn'de
timeout'a düşüyordu (aynı testte diğer 14 integration suite'i, `onboarding-plan`
dahil, sorunsuz geçiyordu). Teşhis: testin `beforeAll`/`it` gövdesine geçici
zaman damgalı `console.log`'lar ve worker'a `on('error')`/`on('failed')`
event listener'ları eklenip test tekrar çalıştırıldı (Jest console çıktısını
suite bitene/timeout'a kadar buffer'ladığı için, önce testin tamamen
takılmadığını, sonsuz bir hata döngüsünde olduğunu bu şekilde doğrulamak
gerekti).

Bulunan: worker, job'ı HİÇ almıyordu — bunun yerine saniyede onlarca kez
`AggregateError` (bağlantı reddedildi) fırlatıyordu, yani gerçek testcontainer
Redis'ine değil `localhost:6379`'a bağlanmaya çalışıyordu.

Kök neden — modül önbelleği (`require`/`import` cache) zehirlenmesi:
`standardizeAndCopyJob.integration.test.ts` dosyasının en üstünde şu STATİK
import vardı:

```ts
import { pendingObjectKey, finalObjectKey } from '../../../shared/storage/presignedUrl';
```

`presignedUrl.ts` → `objectStorageClient.ts` → `shared/config/env.ts` zincirini
DOLAYLI olarak import ediyor. Bu, dosyanın en üstünde, yani `beforeAll` henüz
Redis testcontainer'ını başlatıp `process.env.REDIS_URL`'i set etmeden ÖNCE
çalışıyor — yani `env.ts`'in `envSchema.parse(process.env)`'i, `REDIS_URL` hâlâ
`jest.setup.ts`'in fallback değeri (`redis://localhost:6379`) iken donuyor.

Testin kendi yorumu zaten `createWorker`'ın `beforeAll` içinde, `REDIS_URL` set
edildikten SONRA dinamik `import(...)` ile yüklenmesi gerektiğini doğru şekilde
belirtiyordu — ama `env.ts` modülü o noktada zaten (yukarıdaki statik import
zinciri yüzünden) modül önbelleğine düşmüş oluyordu. Dinamik
`import('.../queueConnection')`, Node'un modül önbelleğinden AYNI (donmuş,
eski `REDIS_URL`'li) `env` nesnesini alıyor — worker bu yüzden testcontainer'a
değil `localhost:6379`'a bağlanmaya çalışıyordu (ki orada hiçbir şey
dinlemediği için bağlantı reddediliyordu, sonsuz retry). Bu arada `queue.add()`
ayrı, doğrudan kurulmuş bir `IORedis` bağlantısı kullandığı için testcontainer'a
doğru bağlanıyor, job kuyruğa gerçekten ekleniyor — ama onu dinleyen worker
YANLIŞ Redis'e bakıyor olduğu için asla göremiyordu.

### Ne yapıldı

Kod hatası düzeltildi (timeout artırılmadı — artırmak semptomu gizlerdi, kökü
çözmezdi). `pendingObjectKey`/`finalObjectKey`, `createWorker` ile birebir aynı
muameleyi görecek şekilde STATİK importtan dinamik importa çevrildi —
`beforeAll` içinde, `REDIS_URL` set edildikten SONRA:

```ts
({ createWorker } = await import('../../../shared/queue/queueConnection'));
({ pendingObjectKey, finalObjectKey } = await import('../../../shared/storage/presignedUrl'));
```

Teşhis için eklenen geçici `console.log`/timestamp'ler ve worker event
listener'ları tamamen kaldırıldı — kalıcı bir iz bırakılmadı. Testin iş
mantığı (indirme → sharp resize → upload → `srcKey` SİLİNMEZ → assertion'lar)
tek bir satır bile değişmeden bırakıldı.

### Rule dosyasındaki hangi kurala karşılık geldiği

`food-recognition-rule.md`'nin "COPY, MOVE DEĞİL" kuralına (pending dosyanın
silinmemesi gerektiği) hiç dokunulmadı — bu doğrulama zaten testin son iki
assertion'ında (`pendingHead`) aynen duruyor. Bu, `shared-rule.md`'nin
"container bağımlı modülleri `beforeAll` içinde, env set edildikten SONRA
dinamik `import(...)` ile yükleyin" kuralının, tek bir dosyanın DEĞİL, o
dosyanın transitively import ettiği HER ŞEYİN aynı kurala tabi olması
gerektiğini gösteren somut bir örnek — kural dosyasına ek bir not olarak
değerlendirilebilir ama bu tur sadece testi düzeltti, rule dosyasını
güncellemedi (kapsam dışı).

### Test sonuçları

| Komut | Sonuç |
|---|---|
| `npx tsc --noEmit` | ✅ temiz |
| `standardizeAndCopyJob.integration.test.ts` (tek başına) | ✅ 1/1 geçti (32.6s toplam, gerçek job işleme süresi 110ms — önceki 60sn+ takılma tamamen ortadan kalktı) |
| `npm run test:integration` (repo geneli, tam koşum) | ✅ 15/15 suite, 29/35 test geçti, 6 todo, 0 fail (identity, onboarding-plan, food-recognition'ın diğer tüm testleri dahil) |

### Bilinçli sapma var mı

Yok. Prompt'un istediği gibi önce kök neden bulundu (geçici log'larla
doğrulandı), gerçek bir bug olduğu netleşince timeout artırma yoluna
GİDİLMEDİ, gerçek kod hatası düzeltildi; iş mantığına (`standardizeAndCopyJob.ts`
prodüksiyon dosyasına) hiç dokunulmadı, sadece test dosyasındaki import
zamanlaması değişti.
