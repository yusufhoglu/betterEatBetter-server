src/modules/nutrition-logging/ modülü zaten implemente edilmiş ve çalışıyor. Bu turda
SADECE eksik bir parçayı ekleyeceğiz: GetLoggedMealTypesForDateRange adında yeni bir
public query use-case. Mevcut hiçbir dosyayı/davranışı DEĞİŞTİRME — sadece ekleme yap.

Aynı klasördeki güncel nutrition-logging-rule.md dosyasını oku, "GetLoggedMealTypesForDateRange"
bölümünü uygula:

1. use-cases/GetLoggedMealTypesForDateRange.ts oluştur:
   execute(userId: string, startDate: Date, endDate: Date): Promise<Record<string, string[]>>
   Dönüş: anahtar ISO tarih string'i (YYYY-MM-DD), değer o günde loglanmış mealType'ların
   listesi.

2. MealItemRepositoryPort'a (ports/MealItemRepositoryPort.ts) YENİ bir metod ekle:
   findMealTypesInRange(userId, startDate, endDate): Promise<Array<{date: string; mealType: string}>>
   Bu metod, mevcut interface'teki diğer metodları SİLMEDEN/DEĞİŞTİRMEDEN eklenir.

3. PrismaMealItemRepository.ts'e bu yeni metodun implementasyonunu ekle — SADECE date
   ve mealType kolonlarını seçen dar bir Prisma sorgusu (select ile entries JSON'ını
   ÇEKME, gereksiz veri taşıma).

4. test-utils/fakes/InMemoryMealItemRepository.ts'e bu yeni metodun fake implementasyonunu
   ekle (mevcut fake metodları BOZMADAN).

5. use-cases/GetLoggedMealTypesForDateRange.test.ts yaz: birden fazla gün/mealType
   kombinasyonuyla doğru gruplama, boş aralık, tek gün gibi senaryolar.

6. adapters/repository/PrismaMealItemRepository.integration.test.ts'e (mevcut dosyaya,
   silmeden) bu yeni metodun gerçek Postgres'e karşı bir testini EKLE.

Test altyapısı: testcontainers, pgvector/pgvector:pg16 image, beforeAll içinde
env-sonrası dinamik import (repo genelinde artık standart).

Testleri yaz, ÇALIŞTIR, geçene kadar düzelt. Mevcut testlerin hiçbirinin kırılmadığını
da doğrula (tüm nutrition-logging test suite'ini çalıştır).

SADECE src/modules/nutrition-logging/ içine, SADECE bu prompt'ta listelenen dosyalara
dokun. daily-tracking modülüne (henüz kurulmamış olabilir) dokunma.