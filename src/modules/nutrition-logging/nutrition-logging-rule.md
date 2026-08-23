# Nutrition Logging Modülü — Rule

Bu dosya `src/modules/nutrition-logging/` altında kod yazarken uyulması gereken
kuralları listeler. Referans: `backend-architecture.md` §8.5, `shared-rule.md`.

---

## `LogMealEntries` — girdi sözleşmesi

- Mobil, `food-recognition`'dan dönen (ve kullanıcının DÜZENLEDİĞİ — gram, kalori,
  ürün ekleme/çıkarma) SON HALİ gönderir. Backend `food-recognition`'ın hiçbir
  tablosuna GERİ DÖNMEZ, hiçbir Port'una bağımlı DEĞİLDİR.
- Girdi HER ZAMAN bir dizi: `entries: FoodEntry[]`. `barcode`/`text`/`search` tek
  elemanlı dizi gönderir, `photo` çok elemanlı olabilir (kullanıcı kalem
  ekleyip/çıkarmış olabilir).
- Gram değiştiğinde kalori/makro yeniden hesaplaması MOBİLDE yapılır — backend gelen
  sayıları OLDUĞU GİBİ kaydeder, kendi tarafında ORANTI HESABI YAPMAZ.
- **Basit sanity validasyonu backend'de YAPILIR** (zod ile): `calories` 0-5000 aralığında,
  `proteinG`/`carbsG`/`fatG` negatif olamaz ve mantıksız üst sınırları (örn. tek kalemde
  500g protein) aşamaz, `portionGrams` > 0. Bu, "kullanıcı verisini düzeltme" değil,
  "çöp/bozuk veri girişini engelleme" amaçlı — aralık dışı değer `ValidationError`.
- `mealType` (`'breakfast'|'lunch'|'dinner'|'snack'`) ZORUNLU alan. Backend hiçbir
  ÇIKARIM/otomatik atama yapmaz (saate göre tahmin vb. YOK) — kullanıcı her zaman
  kendisi seçer, mobil tarafın önerisi varsa bile backend bunu bilmez.

## Gruplama — `MealItem` upsert semantiği

- Bir `MealItem`, `(userId, date, mealType)` üçlüsüyle temsil edilir — bu üçlü
  BENZERSİZ (Prisma'da unique constraint).
- Aynı üçlüye ikinci bir `LogMealEntries` çağrısı geldiğinde (kullanıcı öğüne başka
  bir kalem daha ekliyor): YENİ bir `MealItem` AÇILMAZ, mevcut satırın `entries`
  alanına (JSON array) yeni kalemler EKLENİR (append, upsert).
- `date`, `shared/domain/resolveUserToday.ts` (ya da eşdeğer bir "kullanıcının
  saat dilimine göre tarih" fonksiyonu) ile belirlenir — asla sunucu saati/UTC
  günü kullanılmaz.

## Günlük özet hesaplama — "her seferinde yeniden topla", ARTIMLI DEĞİL

- **KRİTİK KARAR**: günlük toplam bir "sayaç" olarak tutulup increment/decrement
  EDİLMEZ. `GetDaySummary` çağrıldığında, o günün TÜM `MealItem` kayıtları okunup
  `AggregateMealEntries`/`ComputeDayNutrientProgress` ile SIFIRDAN toplanır.
- `LogMealEntries`/`UpdateMealEntry`/`DeleteMealEntry` use-case'leri AYRICA bir
  "özet tablosu" güncellemesi YAPMAZ — sadece `MealItem` satırını yazar/günceller/siler,
  özet hesaplama sorumluluğu tamamen `GetDaySummary`'de (okuma anında) yaşar.
- Gerekçe: kullanıcı başına günlük kalem sayısı küçük (onlarca), yeniden toplama
  maliyeti ihmal edilebilir; buna karşılık artımlı güncellemenin zamanla
  tutarsızlık biriktirme riski gerçek ve debug etmesi zor.

## `DailyTargetsPort` — `onboarding-plan`'a bağlanma şekli

- Bu modül kendi `DailyTargetsPort`'unu tanımlar (kural: kullanan tanımlar).
- `adapters/targets/OnboardingPlanTargetsAdapter.ts`, `onboarding-plan` modülünün
  `use-cases/GetActivePlan.ts`'ini DOĞRUDAN import edip çağırır (modüler monolit
  içi in-process çağrı, HTTP değil) — `Plan` tablosuna kendi Prisma sorgusuyla
  ASLA erişmez.
- `GetActivePlan` `null` dönerse (kullanıcı onboarding'i tamamlamamış): HATA
  FIRLATILMAZ. `GetDaySummary`'nin döndürdüğü sonuçta `dailyCalorieGoal`/
  `remaining` gibi alanlar `null` bırakılır, sadece `consumed` değerleri
  gösterilir.

## Outbox — `MealLoggedEventPublisher`

- `LogMealEntries` başarıyla `MealItem`'ı kaydettiğinde, AYNI transaction içinde
  (`shared/persistence/transaction.ts` + `shared/persistence/outbox.ts`'teki
  `publishEvent`) bir `OutboxEvent` satırı yazılır: `eventType: 'meal.logged'`,
  `payload: { userId, date, mealType, mealItemId }`.
- Bu event'i kim, ne zaman OKUYUP işleyeceği bu modülün sorumluluğu DEĞİL —
  `body-analytics` modülünün turunda ele alınacak. Bu modül SADECE event'i
  güvenilir şekilde yazmaktan sorumlu.
- `UpdateMealEntry`/`DeleteMealEntry` da kendi event'lerini (`meal.updated`,
  `meal.deleted`) aynı outbox mekanizmasıyla yayınlar — `body-analytics`'in
  read-model'i güncel kalabilsin diye.

## Diğer kurallar (shared/'den miras)

- Hata taksonomisi, DI (manuel/explicit), config (fail-fast env), trace context
  (`AsyncLocalStorage`) — hepsi `shared-rule.md`'deki gibi.
- Test altyapısı: **testcontainers** + **`pgvector/pgvector:pg16`** image (asla düz
  `postgres:16-alpine` değil).
- `shared/config/env.ts`'in import-zamanı fail-fast davranışı nedeniyle, test
  dosyalarında container bağımlı modülleri `beforeAll` içinde, env set edildikten
  SONRA dinamik `await import(...)` ile yükleyin.
- **Repoda bu modüle ait `test.todo` stub'ları olabilir** (genel iskelet kurulumu
  turundan kalma) — kod yazmaya başlamadan önce tarayın, SİLİP yeniden yazmak
  yerine DOLDURUN.

---

## Test Stratejisi

### Unit — `domain/`
- `AggregateMealEntries.test.ts`: boş dizi, tek kalem, çoklu kalem toplamı.
- `ComputeDayNutrientProgress.test.ts`: hedef varken/yokken (null hedef) davranış.
- `ComputeCaloriesRemaining.test.ts`: negatif kalmama/sınır durumları.

### Unit — `use-cases/` (fake Port'larla)
- `LogMealEntries.test.ts`:
  - İlk çağrıda yeni `MealItem` oluşturulduğu.
  - Aynı `(userId, date, mealType)` ile İKİNCİ çağrıda YENİ satır AÇILMADIĞI,
    mevcut satıra entries eklendiği (upsert semantiği — kritik test).
  - Sanity validasyonu dışı bir değerle (`calories: -5` gibi) `ValidationError`.
  - Outbox event'inin AYNI transaction'da yazıldığının (fake transaction/publisher
    ile call-order doğrulaması) test edilmesi.
- `GetDaySummary.test.ts`:
  - `DailyTargetsPort` `null` döndüğünde `remaining`/`goal` alanlarının `null`,
    `consumed`'ın yine de dolu döndüğü (KRİTİK — hata fırlatılmadığı).
  - Birden fazla `MealItem`'ın (farklı `mealType`) doğru toplandığı.
- `UpdateMealEntry.test.ts`, `DeleteMealEntry.test.ts`: temel senaryolar.

### Integration — `adapters/` (testcontainers, `pgvector/pgvector:pg16`)
- `PrismaMealItemRepository.integration.test.ts`: `(userId, date, mealType)`
  unique constraint'inin GERÇEKTEN DB seviyesinde çalıştığı doğrulanır.
- Outbox: gerçek bir `LogMealEntries` çağrısı sonrası `OutboxEvent` tablosunda
  gerçekten bir satır oluştuğu, `MealItem` ile AYNI transaction'da yazıldığı
  (ör. yazma sırasında hata enjekte edip her ikisinin de rollback olduğunu
  doğrulayan bir test) kontrol edilir.

### Cross-module
- `OnboardingPlanTargetsAdapter`'ın gerçekten `onboarding-plan/GetActivePlan`'ı
  çağırdığını doğrulayan bir test (fake değil, gerçek modül importu ile).

**Tüm testler yazıldıktan sonra çalıştırılıp geçtiği doğrulanmalı.**
