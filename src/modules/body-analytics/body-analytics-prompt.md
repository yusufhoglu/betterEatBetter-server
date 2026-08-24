# Claude Code Prompt — `src/modules/body-analytics/`

Aşağıdaki prompt'u olduğu gibi Claude Code'a verebilirsin. `body-analytics-rule.md`,
`backend-analytics-spec.md` ve `shared-rule.md`'yi aynı klasöre koyup referans ver.

**ÖN KOŞUL**: `body-analytics-prereqs-prompt.md`'deki İKİ prompt tamamlanmış olmalı.
Değilse bu prompt'u ÇALIŞTIRMAYIN.

---

## PROMPT

```
Bu bir TypeScript backend projesi (food-tracking mobil uygulaması). shared/, identity/,
food-recognition/, onboarding-plan/ (GetUserProfile, UpdateProfileMeasurements,
targetWeightKg/initialWeightKg DAHİL), goal-management/, nutrition-logging/
(zenginleştirilmiş outbox event'leri DAHİL), daily-tracking/ zaten kurulu. Şimdi
src/modules/body-analytics/ modülünü kuracağız.

Aynı klasördeki body-analytics-rule.md, backend-analytics-spec.md ve shared-rule.md
dosyalarını oku. backend-analytics-spec.md API kontratının KENDİSİ — endpoint/request/
response şekillerini DEĞİŞTİRME, birebir implemente et. body-analytics-rule.md
implementasyon kurallarını (veri sahipliği, outbox tüketimi, cross-module erişim,
fraction/trend tanımları) veriyor, HARFİYEN uy.

ÖZELLİKLE:
1. BodyMeasurement (geçmiş log) ile BodySilhouetteProfile (anlık görüntü) İKİ AYRI
   tablo/kavram — birbirini otomatik güncellemez.
2. heightCm/gender bu modülde YOK — onboarding-plan/GetUserProfile'dan okunur,
   onboarding-plan/UpdateProfileMeasurements'a yazılır.
3. Öğün verisi (top-foods, breakdown, averages, correlation) ASLA nutrition-logging'e
   senkron sorgu atmaz — sadece outbox event'lerinden (15sn polling job ile) beslenen
   kendi MealLogReadModel'inden okunur.
4. weight/bmi için trendIsGood yönü onboarding-plan'daki goal'e göre değişir
   (lose/gain), diğer metrikler (bodyFat/waist/muscleMass) için sabit.
5. bodyFat/waist için fraction HER ZAMAN null (kullanıcı tanımlı hedef yok, sahte
   hedef uydurma).
6. Insights bu turda kural-tabanlı/template (2-3 basit kural), LLM YOK.

Repoda bu modüle ait test.todo stub'ları olabilir — tara, SİLİP yeniden yazma, DOLDUR.

Oluşturulacak yapı:

src/modules/body-analytics/
  domain/
    resolveDateRange.ts
    resolveDateRange.test.ts
    trendDirectionMap.ts
    trendDirectionMap.test.ts
    computeGoalProgressFraction.ts
    computeGoalProgressFraction.test.ts

  use-cases/
    GetBodyStats.ts
    GetBodyStats.test.ts
    ListBodyMeasurements.ts
    AddBodyMeasurement.ts
    UpdateBodyMeasurement.ts
    DeleteBodyMeasurement.ts
    (bunların test dosyaları)
    GetMeasurementTrend.ts
    GetMeasurementTrend.test.ts
    GetBodySilhouetteProfile.ts
    UpdateBodySilhouetteProfile.ts
    UpdateBodySilhouetteProfile.test.ts
    GetWaistHeightRatio.ts
    GetWaistHeightRatio.test.ts
    GetGoalProgress.ts
    GetGoalProgress.test.ts
    GetMealAverages.ts
    GetWeeklyMealTrend.ts
    GetMealBreakdown.ts
    GetTopFoods.ts
    GetMealInsights.ts
    GetMealCorrelation.ts
    (meal analytics use-case'lerinin test dosyaları)

  ports/
    BodyMeasurementRepositoryPort.ts
    BodySilhouetteProfileRepositoryPort.ts
    MealLogReadModelPort.ts
    InsightGeneratorPort.ts

  adapters/
    repository/
      PrismaBodyMeasurementRepository.ts
      PrismaBodyMeasurementRepository.integration.test.ts
      PrismaBodySilhouetteProfileRepository.ts
      PrismaMealLogReadModelRepository.ts
      PrismaMealLogReadModelRepository.integration.test.ts
    profile/
      OnboardingPlanProfileAdapter.ts   -> GetUserProfile/UpdateProfileMeasurements
                                          çağıran köprü
    tracking/
      DailyTrackingAdapter.ts             -> GetTodayStatus çağıran köprü
    insights/
      TemplateInsightGenerator.ts

  jobs/
    consumeOutboxEventsJob.ts
    consumeOutboxEventsJob.integration.test.ts

  test-utils/
    fakes/
      InMemoryBodyMeasurementRepository.ts
      InMemoryMealLogReadModel.ts
      FakeOnboardingPlanProfilePort.ts
      FakeDailyTrackingPort.ts

  http/
    BodyAnalyticsController.ts   -> backend-analytics-spec.md'deki TÜM endpoint'ler
    bodyAnalyticsRoutes.ts

Prisma şeması (mevcut modelleri BOZMA):

model BodyMeasurement {
  id        String   @id @default(uuid())
  userId    String
  metric    String   // weight|bodyFat|waist|neck|hip|muscleMass
  value     Float
  unit      String
  date      DateTime
  source    String   // manual|synced|edited
  createdAt DateTime @default(now())
}

model BodySilhouetteProfile {
  userId      String  @id
  neckCm      Float?
  shoulderCm  Float?
  waistCm     Float?
  hipCm       Float?
  updatedAt   DateTime @updatedAt
}

model MealLogReadModel {
  id        String   @id @default(uuid())
  userId    String
  date      DateTime @db.Date
  mealType  String
  entries   Json     // outbox event payload'ından kopyalanan entries
  loggedAt  DateTime @default(now())

  @@unique([userId, date, mealType])
}

Beklentiler:
- Gerçek, çalışan, derlenebilir TypeScript kodu — placeholder/TODO YOK.
- Her hata durumu shared/errors/ taksonomisinden bir sınıf kullanmalı.
- TÜM testleri yaz, ÇALIŞTIR, geçene kadar düzelt.
- backend-analytics-spec.md'deki HER endpoint'i implemente et, hiçbirini atlama.
- SADECE body-analytics modülüne dokun, başka hiçbir özellik modülüne dokunma.
```

---

## Tamamlama Raporu (Claude Code işin sonunda bunu doldurmalı)

### 1. Ne yapıldı
### 2. Rule/spec dosyalarındaki hangi kurallara karşılık geldiği
### 3. Karşılaşılan/düzeltilen sorunlar (spec'te belirsiz kalan bir nokta yorumlandıysa
   AÇIKÇA belirt)
### 4. Test sonuçları (hangi komut, kaç geçti/kaldı, çalıştırılamayan varsa neden)
### 5. Rule/Prompt'tan bilinçli sapma var mı (varsa neden)
