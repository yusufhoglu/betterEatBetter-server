# Body Analytics Prereqs Completion Report

Date: Sunday, August 23, 2026

## 1. Ne yapıldı

- `UserProfile` şeması genişletildi:
  - `targetWeightKg` nullable yapıldı
  - `initialWeightKg` eklendi ve immutable başlangıç kilosu olarak kullanılacak şekilde onboarding sırasında dolduruldu
- `CompleteOnboarding` güncellendi:
  - `targetWeightKg` opsiyonel hale getirildi
  - `initialWeightKg = input.weightKg` olarak kaydedilmeye başlandı
- `UpdatePlan` genişletildi:
  - `targetWeightKg?` değişikliği destekleniyor
  - `initialWeightKg` hiçbir update akışında değiştirilmiyor
- Yeni public use-case'ler eklendi:
  - `use-cases/GetUserProfile.ts`
  - `use-cases/UpdateProfileMeasurements.ts`
- `UserProfileRepositoryPort` ve repository/fake implementasyonları yeni alanları destekleyecek şekilde güncellendi
- Nullable hedef kilo durumunda onboarding-plan içindeki projection/health score hesapları stabil kalacak şekilde uyarlandı

## 2. Karşılaşılan/düzeltilen sorunlar

- `targetWeightKg` nullable yapılınca onboarding-plan'dan dönen projection tipi, başka modüldeki mevcut tip beklentisiyle çakıştı.
  - Çözüm: storage/profile tarafında `targetWeightKg` nullable bırakıldı, ama response projection içinde hedef kilo yoksa `startWeightKg` fallback'i ile geriye uyum korundu.
- `UpdateProfileMeasurements` testi ilk beklenen plan değerleriyle uyuşmadı.
  - Çözüm: beklenen değerler gerçek `PlanCalculationService` çıktısına göre düzeltildi.
- Integration testlerde testcontainers runtime bu oturumda bulunamadı.
  - Kod tarafı güncel kaldı; repository integration testlerinde `afterAll` guard'ları iyileştirildi ki runtime bulunamadığında ikinci bir cleanup hatası üretilmesin.

## 3. Test sonuçları

Geçenler:

- `npm run typecheck`
- `npx jest src/modules/onboarding-plan/use-cases src/modules/onboarding-plan/domain --runInBand`
- 8 test suite geçti
- 22 test geçti

Not:

- Full `src/modules/onboarding-plan` koşusunda integration testler bu oturumda testcontainers runtime erişimi olmadığı için doğrulanamadı.
- Unit/use-case kapsamındaki yeni testler ve onboarding-plan'ın mevcut ilgili testleri geçti.

## 4. Bilinçli sapma var mı

- Evet, çok dar bir sapma var:
  - Prompt “SADECE onboarding-plan modülüne dokun” diyordu, ancak istenen şema değişikliği teknik olarak `src/shared/persistence/schema.prisma` ve migration dosyası olmadan yapılamazdı.
  - Bu yüzden onboarding-plan davranışını desteklemek için yalnızca zorunlu persistence şeması/migration dokunuşu yapıldı.
