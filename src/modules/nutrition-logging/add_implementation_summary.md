# Nutrition Logging Addition Summary

Bu turda `nutrition-logging` modülüne sadece `GetLoggedMealTypesForDateRange` public query use-case'i eklendi.

## Eklenenler

- `use-cases/GetLoggedMealTypesForDateRange.ts`
  - `execute(userId, startDate, endDate): Promise<Record<string, string[]>>`
  - Dönüşte gün bazında `YYYY-MM-DD -> mealType[]` gruplaması yapar.

- `ports/MealItemRepositoryPort.ts`
  - Yeni metod eklendi:
    - `findMealTypesInRange(userId, startDate, endDate): Promise<Array<{ date: string; mealType: string }>>`

- `adapters/repository/PrismaMealItemRepository.ts`
  - Yeni metod implementasyonu eklendi.
  - Sorgu sadece `date` ve `mealType` alanlarını `select` ile çeker.
  - `entries` JSON alanı gereksiz yere okunmaz.

- `test-utils/fakes/InMemoryMealItemRepository.ts`
  - Yeni metodun fake implementasyonu eklendi.

## Testler

- `use-cases/GetLoggedMealTypesForDateRange.test.ts`
  - Çok gün / çok mealType gruplaması
  - Boş aralık
  - Tek gün aralığı

- `adapters/repository/PrismaMealItemRepository.integration.test.ts`
  - Gerçek Postgres üzerinde tarih aralığında mealType okuma testi eklendi.

## Çalıştırılan komutlar

```bash
cmd /c npx jest src/modules/nutrition-logging/use-cases/GetLoggedMealTypesForDateRange.test.ts --runInBand
cmd /c npx jest src/modules/nutrition-logging/adapters/repository/PrismaMealItemRepository.integration.test.ts --runInBand
cmd /c npx jest src/modules/nutrition-logging --runInBand
```

## Sonuç

- `src/modules/nutrition-logging` test suite tamamı geçti.
- Son doğrulama sonucu: `11/11` suite, `29/29` test geçti.
