# Onboarding Plan Modulu Developer Doc

Bu modul kullanicinin ilk profil ve hedef bilgilerini alir, ardindan gunluk plani hesaplayip kaydeder. Modulin cekirdegi `CompleteOnboarding` ve paylasilan `PlanCalculationService` uzerine kuruludur.

## Mimari Ozeti

- `http/OnboardingController.ts` onboarding payload'ini validate eder ve `dateOfBirth -> age` donusumunu yapar.
- `use-cases/` altinda onboarding akisi, plan okuma/guncelleme ve profil guncelleme use-case'leri bulunur.
- `domain/` altinda plan hesaplama ve ilgili kurallar yer alir.
- `adapters/repository/` Prisma tabanli `UserProfile` ve `Plan` repository implementasyonlarini saglar.

## Endpointler

| Method | Path | Aciklama |
| --- | --- | --- |
| `POST` | `/onboarding/complete` | Profil ve hedef verisini kaydeder, aktif plani olusturur |

## Sequence Diagramlari

### `POST /onboarding/complete`

```mermaid
sequenceDiagram
    actor Client
    participant Controller as OnboardingController
    participant UseCase as CompleteOnboarding
    participant ProfileRepo as PrismaUserProfileRepository
    participant PlanRepo as PrismaPlanRepository
    participant Calc as PlanCalculationService

    Client->>Controller: onboarding payload
    Controller->>Controller: validate + age normalize
    Controller->>UseCase: execute(input)
    UseCase->>ProfileRepo: upsert user profile
    UseCase->>Calc: computePlan(profile, goal)
    Calc-->>UseCase: dailyCalories/macros
    UseCase->>PlanRepo: upsert active plan
    UseCase-->>Controller: plan response
    Controller-->>Client: 201 plan
```

## Vucut Kompozisyonu (body-fat -> makro)

- `PlanCalculationService.computeBodyComposition` tek bir `bodyFatPct` uretir: `waistCm` + `neckCm` (kadinlarda ayrica `hipCm`) geldiyse **US-Navy**, gelmediyse **Deurenberg** (BMI tabanli) tahmini. Sonuc `[5, 60]` bandina clamp'lenir.
- `waistCm` / `neckCm` / `hipCm` / `shoulderCm` opsiyoneldir ve `user_profiles` tablosunda nullable tutulur (onboarding adimi atlanabilir). Migration: `20260902120000_add_body_measurements`. `shoulderCm` yag hesabinda kullanilmaz; sadece `shoulderToWaistRatio` icin saklanir (`BuildPlanResponse` icinde `shoulderCm / waistCm`, ikisi de varsa).
- `computePlan` yag orani ile: protein `2.0 g/kg yagsiz kutle` (`1.6-2.2 g/kg vucut agirligi` araligina clamp), yag `max(kcal*0.25/9, 0.8 g/kg)` tabani, karbonhidrat kalanı. BMR yalnizca Navy olcumu varsa Katch-McArdle'a geçer.
- `bodyFatPct` ve `leanBodyMassKg` `Plan` tablosunda saklanmaz; `BuildPlanResponse` her cevapta profilden yeniden hesaplar (projeksiyon/healthScore gibi).

## Gelistirme Rehberi

- Yeni plan kurali ekleyecekseniz once `shared/domain/PlanCalculationService.ts` veya ilgili `domain/` fonksiyonlarina ekleyin; controller seviyesinde hesap yapmayin.
- `UserProfile` ve `Plan` bu modulin sahip oldugu veriler. Diger moduller bu tablolara dogrudan yazmamalidir; `GetActivePlan`, `UpdatePlan`, `UpdateProfileMeasurements` gibi public use-case'ler kullanilmalidir.
- `dateOfBirth`, `age`, `targetWeightKg` gibi alanlar eklendiginde once controller validation sonra repository mapping guncellenmeli; ikisinden birini bos birakmayin.
- Profil guncellemesi ile plan hesaplamasini ayri kavramlar olarak koruyun. Profil tablosuna yazmak planin yeniden hesaplanmasini gerektiriyorsa bunu use-case seviyesinde tetikleyin.

## Ornek Best Practice

Dogru genisletme yaklasimi:

```ts
await updateProfileMeasurements.execute(userId, { heightCm: 182 });
await updatePlan.execute(userId, { weeklyPaceKg: 0.4 });
```

Yanlis yaklasim: baska bir modulden `PrismaPlanRepository` import edip `Plan` satirini dogrudan update etmek.
