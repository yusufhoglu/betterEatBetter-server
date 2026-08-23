# Claude Code Prompt — `src/modules/nutrition-logging/`

Aşağıdaki prompt'u olduğu gibi Claude Code'a verebilirsin. `nutrition-logging-rule.md`
ve `shared-rule.md`'nin güncel halini (Outbox bölümü eklendi) aynı klasöre koyup
referans ver.

Bu prompt, `shared/`, `identity/`, `food-recognition/`, `onboarding-plan/`'ın zaten
kurulu ve çalışır olduğunu varsayıyor.

---

## PROMPT

```
Bu bir TypeScript backend projesi (food-tracking mobil uygulaması). shared/, identity/,
food-recognition/, onboarding-plan/ zaten kurulu. Şimdi src/modules/nutrition-logging/
modülünü kuracağız.

Aynı klasördeki nutrition-logging-rule.md ve shared-rule.md dosyalarını oku, TÜM
kurallarına harfiyen uy. ÖZELLİKLE:

1. Günlük özet ARTIMLI DEĞİL — GetDaySummary her çağrıldığında o günün tüm
   MealItem'larını SIFIRDAN toplar. LogMealEntries/UpdateMealEntry/DeleteMealEntry
   ayrı bir "özet tablosu" güncellemesi YAPMAZ.
2. MealItem upsert semantiği: (userId, date, mealType) unique. Aynı üçlüye ikinci
   LogMealEntries çağrısı YENİ satır açmaz, mevcut satıra entries EKLER.
3. DailyTargetsPort'un adapter'ı onboarding-plan/use-cases/GetActivePlan.ts'i
   DOĞRUDAN import edip çağırır — Plan tablosuna kendi sorgusunu YAZMA. GetActivePlan
   null dönerse hata fırlatma, remaining/goal alanlarını null bırak.
4. Outbox: LogMealEntries (ve Update/Delete), shared/persistence/outbox.ts'teki
   publishEvent'i, MealItem yazımıyla AYNI transaction'da çağırır.
5. Gram/makro yeniden hesaplaması BACKEND'DE YAPILMAZ — mobilin gönderdiği son
   sayılar olduğu gibi kaydedilir, sadece sanity validasyonu (aralık kontrolü) yapılır.

Repoda bu modüle ait test.todo stub'ları olabilir (genel iskelet kurulumu turundan
kalma) — kod yazmaya başlamadan önce src/modules/nutrition-logging/ altında tara,
SİLİP yeniden yazma, DOLDUR.

Test altyapısı: testcontainers, Postgres için pgvector/pgvector:pg16 image (shared-rule.md
Persistence bölümünde bu artık kalıcı bir kural). shared/config/env.ts'in import-zamanı
fail-fast davranışı nedeniyle, container bağımlı modülleri beforeAll içinde, env set
edildikten SONRA dinamik await import(...) ile yükle.

Oluşturulacak yapı:

src/modules/nutrition-logging/
  domain/
    MealItem.ts
    NutrientTotals.ts
    AggregateMealEntries.ts
    AggregateMealEntries.test.ts
    ComputeDayNutrientProgress.ts
    ComputeDayNutrientProgress.test.ts
    ComputeCaloriesRemaining.ts
    ComputeCaloriesRemaining.test.ts

  use-cases/
    LogMealEntries.ts
    LogMealEntries.test.ts
    GetDaySummary.ts
    GetDaySummary.test.ts
    UpdateMealEntry.ts
    UpdateMealEntry.test.ts
    DeleteMealEntry.ts
    DeleteMealEntry.test.ts

  ports/
    MealItemRepositoryPort.ts
    DailyTargetsPort.ts

  adapters/
    repository/
      PrismaMealItemRepository.ts
      PrismaMealItemRepository.integration.test.ts
    targets/
      OnboardingPlanTargetsAdapter.ts
      OnboardingPlanTargetsAdapter.test.ts   -> cross-module, gerçek GetActivePlan importu

  events/
    publishers/
      MealLoggedEventPublisher.ts
      MealLoggedEventPublisher.integration.test.ts   -> outbox + transaction testi

  test-utils/
    fakes/
      InMemoryMealItemRepository.ts
      FakeDailyTargetsPort.ts

  http/
    NutritionLoggingController.ts
    nutritionLoggingRoutes.ts

Ayrıca shared/persistence/outbox.ts ve OutboxEvent Prisma modeli HENÜZ YOKSA
(shared-rule.md'nin Outbox bölümüne göre) onu da bu turda oluştur:

model OutboxEvent {
  id          String    @id @default(uuid())
  eventType   String
  payload     Json
  createdAt   DateTime  @default(now())
  processedAt DateTime?
}

publishEvent(tx, eventType, payload) fonksiyonu, verilen transaction client'ı ile bu
tabloya yazar.

Prisma şeması güncellemesi (MealItem, mevcut modelleri BOZMA):

model MealItem {
  id        String   @id @default(uuid())
  userId    String
  date      DateTime @db.Date
  mealType  String
  entries   Json     // FoodEntry[] snapshot
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, date, mealType])
}

Beklentiler:
- Gerçek, çalışan, derlenebilir TypeScript kodu — placeholder/TODO YOK.
- Her hata durumu shared/errors/ taksonomisinden bir sınıf kullanmalı.
- TÜM testleri yaz, ÇALIŞTIR, geçene kadar düzelt.
- Eğer shared/persistence/outbox.ts zaten varsa (başka bir modül tarafından
  oluşturulmuşsa), onu YENİDEN YAZMA, sadece kullan — önce kontrol et.
- SADECE nutrition-logging modülüne ve gerekiyorsa shared/persistence/outbox.ts +
  şemaya dokun, başka hiçbir özellik modülüne dokunma.
```

---

## Tamamlama Raporu (Claude Code işin sonunda bunu doldurmalı)

### 1. Ne yapıldı
### 2. Rule dosyasındaki hangi kurallara karşılık geldiği
### 3. Karşılaşılan/düzeltilen sorunlar
### 4. Test sonuçları (hangi komut, kaç geçti/kaldı, çalıştırılamayan varsa neden)
### 5. Rule/Prompt'tan bilinçli sapma var mı (varsa neden)
