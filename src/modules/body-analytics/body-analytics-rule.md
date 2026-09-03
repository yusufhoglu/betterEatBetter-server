# Body Analytics Modülü — Rule

Bu dosya `src/modules/body-analytics/` altında kod yazarken uyulması gereken kuralları
listeler. Referans: `backend-analytics-spec.md` (kullanıcı tarafından sağlanan API
kontratı), `backend-architecture.md` §8.7, `shared-rule.md`.

**Bu turun ön koşulu**: `body-analytics-prereqs-prompt.md`'deki İKİ prompt'un ikisi de
tamamlanmış olmalı (nutrition-logging event zenginleştirme + onboarding-plan
GetUserProfile/UpdateProfileMeasurements/targetWeightKg). Değilse DURUN, bu modülü
başlatmayın.

API kontratı `backend-analytics-spec.md`'de TAM olarak tanımlı — endpoint/request/
response şekillerini DEĞİŞTİRMEYİN, sadece implemente edin.

---

## Veri sahipliği — `BodyMeasurement` TEK kaynak

Çevre ölçüleri (`waist`/`neck`/`hip`/`shoulder`) için tek bir source of truth var:
**`BodyMeasurement` tablosu** (`GET/POST/PATCH/DELETE /body-measurements`). Zaman
serisi; her satır bir zaman noktası, trend chart'ını besler.

- **"Güncel değer"** = ilgili metriğin en son `BodyMeasurement` satırı; hiç ölçüm
  yoksa `user_profiles`'a onboarding'de yazılan tohum değere düşer.
- `body_silhouette_profiles` tablosu KALDIRILDI. `GET /analytics/body-profile`
  artık `GetBodySilhouetteProfile` içinde "en son ölçüm ?? onboarding tohumu"
  olarak türetilen bir GÖRÜNÜMDÜR — ayrı bir tablo değil.
- `PATCH /analytics/body-profile` bir ölçüm olayıdır: her düzenlenen bölge için
  `BodyMeasurement` satırı EKLENİR (`source: 'manual'`) VE değer
  `onboarding-plan`'a itilir (plan yeniden hesaplanır). Silüet düzenlemesi ile
  ölçüm geçmişi artık AYNI şeydir — eskiden bilinçli olarak ayrılmışlardı, bu
  karar tersine çevrildi (senkron tek yazım yolu, kopya tablo yok).

## `heightCm`/`gender` + çevre ölçüleri — `onboarding-plan`'a yazılır

- Bu modülün KENDİ tablosunda `heightCm`/`gender`/`weightKg`/`targetWeightKg`/
  `initialWeightKg` alanları YOK.
- `use-cases/GetBodySilhouetteProfile.ts`, `onboarding-plan/GetUserProfile`'ı
  DOĞRUDAN import edip `heightCm`/`gender`'ı ve çevre ölçüsü tohumlarını oradan
  okur; `BodyMeasurement`'tan her bölgenin en son değerini okur; ikisini
  birleştirip response oluşturur.
- `UpdateBodySilhouetteProfile.ts`: `heightCm`/`gender` VE `neckCm`/`shoulderCm`/
  `waistCm`/`hipCm` — hepsi `onboarding-plan/UpdateProfileMeasurements`'a DELEGE
  EDİLİR (bu, plan'ın yeniden hesaplanmasını tetikler — height BMR'ı, çevre
  ölçüleri Navy body-fat'i etkiliyor). Ayrıca her çevre ölçüsü için bir
  `BodyMeasurement` satırı yazılır. İKİ YAZIM da aynı use-case içinde sırayla
  yapılır (atomik transaction ZORUNLU DEĞİL — codebase'in geri kalanındaki
  "sıralı yazım, transaction gerekmez" seviyesinde basitlik kabul edilir).

## Outbox tüketimi — POLLING JOB, senkron tetikleme DEĞİL

- `shared/scheduling/`'teki mekanizmayla, 15 saniyede bir tetiklenen bir job
  (`consumeOutboxEventsJob.ts`), `OutboxEvent` tablosunda `eventType IN
  ('meal.logged','meal.updated','meal.deleted')` VE `processedAt IS NULL` olan
  satırları okur.
- Her event için `payload.entries`'i (nutrition-logging'in zenginleştirdiği veri)
  kullanarak `MealLogReadModel` tablosuna YAZAR/GÜNCELLER/SİLER — bu modül ASLA
  `nutrition-logging`'e senkron bir sorgu ATMAZ, tüm gerekli veri event payload'ında
  zaten var.
- İşlendikten sonra `OutboxEvent.processedAt` set edilir. Bir event işlenirken hata
  olursa `processedAt` set EDİLMEZ, bir sonraki pollingde TEKRAR denenir (retry doğal
  olarak polling mekanizmasından gelir, ekstra bir retry kütüphanesi gerekmez).
- **Kullanıcı gözünden gecikme**: en fazla ~15 saniye, SADECE bu modülün (trend,
  top-foods, breakdown, insights) verilerini etkiler. `nutrition-logging/GetDaySummary`
  bu mekanizmadan TAMAMEN BAĞIMSIZ, her zaman anlık — bu ayrımı KARIŞTIRMAYIN.

## Tarih aralığı — iki farklı enum, TEK yardımcı fonksiyon

- `body-measurements/trend`: `1W|1M|3M|6M|1Y|All`
- `meals/*`: `week|month|threeMonths|sixMonths|year|allTime`
- İkisi de `shared/` DEĞİL, bu modülün kendi `domain/resolveDateRange.ts`'inde (pure
  fonksiyon) TEK bir switch/map ile gerçek `{startDate, endDate}`'e çevrilir — enum'lar
  BİRLEŞTİRİLMEZ, API kontratı spec'teki gibi AYNEN kalır, sadece implementasyon paylaşılır.

## `fraction`/`trendValue`/`trendIsGood` — KESİN tanım

- Pencere: **son 7 gün ortalaması vs önceki 7 gün ortalaması** (spec'in belirsiz
  bıraktığı "previous week/month" ifadesi için sabit bir karar).
- `trendValue` = son7GünOrt − önceki7GünOrt.
- `trendIsGood`: metrik türüne göre yön haritası SABİT bir tabloda tutulur
  (`domain/trendDirectionMap.ts`): `weight`/`bodyFat`/`waist` için AZALMA iyi,
  `muscleMass` için ARTMA iyi. `bmi` için AZALMA iyi (varsayım — kullanıcı hedefi
  `lose` ise; `gain` hedefinde bu tersine döner, bkz. aşağıdaki nüans).
- **NÜANS**: `weight`/`bmi` için `trendIsGood` yönü, kullanıcının `onboarding-plan`
  hedefine (`goal: lose|maintain|gain`) göre değişir — `gain` hedefindeki bir kullanıcı
  için kilo ARTIŞI iyi. Bu yüzden `GetBodyStats`, `onboarding-plan/GetUserProfile`'dan
  `goal`'ü okuyup yön haritasını buna göre uyarlar (`weight`/`bmi` özelinde;
  `bodyFat`/`waist`/`muscleMass` için goal'den BAĞIMSIZ, hep aynı yön).
- `fraction` (dial ilerlemesi): `weight`/`bmi` için `ComputeGoalProgress`'teki
  `progressFraction` mantığı (start/current/target arası oran, `initialWeightKg`/
  `targetWeightKg`/güncel `BodyMeasurement` kullanılır). `bodyFat`/`waist` için
  KULLANICI TANIMLI bir hedef YOK — bu ikisi için `fraction` HER ZAMAN `null` döner
  (spec bunu netleştirmiyor, `null` en dürüst cevap — sahte bir hedef uydurmuyoruz).

## Cross-module bağımlılıklar (özet)

| İhtiyaç | Kaynak | Yöntem |
|---|---|---|
| `heightCm`, `gender`, `goal`, `targetWeightKg`, `initialWeightKg`, çevre ölçüsü tohumları | `onboarding-plan` | `GetUserProfile` (doğrudan import) |
| `heightCm`/`gender`/`waistCm`/`neckCm`/`hipCm`/`shoulderCm` güncelleme (+ plan recalc) | `onboarding-plan` | `UpdateProfileMeasurements` (doğrudan import) |
| `streakDays` (goal-progress) | `daily-tracking` | `GetTodayStatus` (doğrudan import) |
| Öğün verisi (top-foods, breakdown, averages, correlation, weekly trend) | `nutrition-logging` | ASLA doğrudan değil — sadece outbox event'lerinden beslenen kendi `MealLogReadModel`'i |

## Insights — kural tabanlı, LLM YOK bu turda

- `GenerateMealInsights`, `shared-rule.md`'nin öngördüğü gibi TEMPLATE tabanlı başlar
  (`InsightGeneratorPort` + `TemplateInsightGenerator`, `LlmInsightGenerator` İLERİDE).
- Bu turda 2-3 basit kural yeterli (örn. "protein hedefinin X gün üstünde/altında",
  "en yüksek kalorili gün" gibi) — kapsamlı bir kural motoru YAZILMAZ, spec'in verdiği
  örnek formatı (`title`+`body`) karşılayan basit if/else yeterli.

## Diğer kurallar (shared/'den miras)

- Hata taksonomisi, DI, config, trace context — `shared-rule.md`'deki gibi.
- Test altyapısı: testcontainers + `pgvector/pgvector:pg16`, `beforeAll` içinde
  env-sonrası dinamik import.
- **Repoda bu modüle ait `test.todo` stub'ları olabilir** — tarayın, SİLİP yeniden
  yazmak yerine DOLDURUN.

---

## Test Stratejisi

### Unit — `domain/`
- `resolveDateRange.test.ts`: her iki enum ailesinin (body-measurement + meals) tüm
  değerleri için doğru tarih aralığı.
- `trendDirectionMap.test.ts`: `weight`/`bmi` için `goal`'e göre yön DEĞİŞTİĞİ,
  diğerleri için değişmediği.
- `ComputeGoalProgress` benzeri fraction hesaplaması: `initialWeightKg`=`targetWeightKg`
  ise (bölme hatası riski) davranış NET tanımlanıp test edilir.

### Unit — `use-cases/` (fake Port'larla)
- `GetBodyStats.test.ts`: `bodyFat`/`waist` için `fraction: null` döndüğü, `weight`
  için `goal`'e göre `trendIsGood` yönünün değiştiği (KRİTİK test).
- `AddBodyMeasurement`/`UpdateBodyMeasurement` (source: `edited` otomatik set edildiği)/
  `DeleteBodyMeasurement`.
- `UpdateBodySilhouetteProfile.test.ts`: `heightCm`/çevre ölçüsü gönderildiğinde
  `onboarding-plan/UpdateProfileMeasurements`'ın çağrıldığı (fake ile call
  doğrulaması) VE her çevre ölçüsü için bir `BodyMeasurement` satırı eklendiği.
- `GetGoalProgress.test.ts`: `daily-tracking/GetTodayStatus`'un çağrıldığı, `streakDays`
  değerinin doğru taşındığı.

### Outbox tüketici testi (KRİTİK)
- `consumeOutboxEventsJob.integration.test.ts`: gerçek bir `OutboxEvent` satırı
  (payload'ı `entries` içeren) yazılıp job çalıştırıldığında, `MealLogReadModel`'in
  gerçekten güncellendiği VE `processedAt`'in set edildiği doğrulanır. Ayrıca: işleme
  sırasında hata enjekte edilirse `processedAt`'in set EDİLMEDİĞİ (bir sonraki
  pollingde tekrar deneneceği) doğrulanır.

### Integration — `adapters/` (testcontainers)
- `PrismaBodyMeasurementRepository.integration.test.ts`
- `PrismaMealLogReadModelRepository.integration.test.ts`: top-foods/breakdown/averages
  sorgularının gerçek Postgres'e karşı doğru agregasyon yaptığı.

**Tüm testler yazıldıktan sonra çalıştırılıp geçtiği doğrulanmalı.**
