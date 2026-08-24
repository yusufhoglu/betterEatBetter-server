## 1. Ne yapıldı

- `body-analytics` modülü için yeni domain helper'ları eklendi: tarih aralığı çözümü, goal-progress fraction hesabı, trend direction kuralları.
- Yeni use-case'ler implemente edildi:
  - `GetBodyStats`
  - `ListBodyMeasurements`
  - `AddBodyMeasurement`
  - `UpdateBodyMeasurement`
  - `DeleteBodyMeasurement`
  - `GetMeasurementTrend`
  - `GetBodySilhouetteProfile`
  - `UpdateBodySilhouetteProfile`
  - `GetWaistHeightRatio`
  - `GetGoalProgress`
  - `GetMealAverages`
  - `GetWeeklyMealTrend`
  - `GetMealBreakdown`
  - `GetTopFoods`
  - `GetMealInsights`
  - `GetMealCorrelation`
- Prisma tarafında `BodyMeasurement`, `BodySilhouetteProfile`, `MealLogReadModel` modelleri ve `20260824020000_add_body_analytics_tables` migration'ı eklendi.
- Outbox polling consumer `jobs/consumeOutboxEventsJob.ts` yazıldı; `meal.logged`, `meal.updated`, `meal.deleted` event'lerinden `MealLogReadModel` güncelleniyor.
- `OnboardingPlanProfileAdapter` ve `DailyTrackingAdapter` ile cross-module erişim rule'a uygun şekilde doğrudan public use-case'lere bağlandı.
- HTTP katmanı `backend-analytics-spec.md` kontratına göre eklendi:
  - `/analytics/body-stats`
  - `/body-measurements`
  - `/body-measurements/trend`
  - `/analytics/body-profile`
  - `/analytics/waist-height-ratio`
  - `/analytics/goal-progress`
  - `/analytics/meals/*`
- Spec-driven yeni yapı dışında kalan legacy stub dosyaları kaldırıldı; modülde kullanılmayan compatibility wrapper bırakılmadı.

## 2. Rule/spec dosyalarındaki hangi kurallara karşılık geldiği

- `BodyMeasurement` ile `BodySilhouetteProfile` ayrı tutuldu; otomatik senkronizasyon yapılmadı.
- `heightCm` ve `gender` body-analytics tablosuna kopyalanmadı; `GetUserProfile` ve `UpdateProfileMeasurements` üzerinden onboarding-plan'a delege edildi.
- Meal analytics tarafı nutrition-logging'e senkron sorgu atmıyor; sadece outbox tüketimiyle beslenen `MealLogReadModel` okunuyor.
- `weight` ve `bmi` için `trendIsGood`, onboarding goal (`lose|maintain|gain`) bilgisine göre hesaplandı.
- `bodyFat` ve `waist` için `fraction` her zaman `null` döndürülüyor.
- Insights bu turda yalnızca template/rule tabanlı bırakıldı; LLM entegrasyonu eklenmedi.

## 3. Karşılaşılan/düzeltilen sorunlar

- `/body-measurements` endpoint'i `/analytics` altına mount edilemeyeceği için router seviyesinde ayrı route mount edildi.
- Prisma client yeni modelleri görmediği için schema güncellemesinden sonra `prisma generate` çalıştırıldı.
- `fiberAvgG` spec'te response'ta isteniyor, fakat nutrition-logging outbox payload'ında fiber alanı yok. Bu yüzden bu turda `fiberAvgG: null` döndürülüyor; sahte sayısal değer üretilmedi.
- Testcontainers sandbox içinde container runtime stratejisi bulamadı. Integration testler unsandboxed çalıştırılarak doğrulandı.

## 4. Test sonuçları

- `cmd /c npm run typecheck`
  - başarılı
- `cmd /c npx jest src/modules/body-analytics --runInBand`
  - 19 test suite geçti
  - 36 test geçti
- Unsandboxed Docker-backed integration testler ayrıca doğrulandı:
  - `PrismaBodyMeasurementRepository.integration.test.ts`
  - `PrismaMealLogReadModelRepository.integration.test.ts`
  - `consumeOutboxEventsJob.integration.test.ts`

## 5. Rule/Prompt'tan bilinçli sapma var mı

- Küçük bir wiring sapması var: `backend-analytics-spec.md` gereği `/body-measurements` kök route olduğu için `src/http/router.ts` içinde ayrıca mount edildi. Bu, kontratı doğru karşılamak için gerekliydi.
- `fiberAvgG` alanı için mevcut veri kaynağında gerçek veri olmadığı için `null` döndürülmesi bilinçli yorumdur.
