# Claude Code Prompt — `src/modules/onboarding-plan/` (Minimal Kapsam)

Aşağıdaki prompt'u olduğu gibi Claude Code'a verebilirsin. `onboarding-plan-rule.md` ve
`shared-rule.md` dosyalarını da aynı klasöre koyup prompt'ta referans ver.

Bu prompt, `src/shared/`, `src/modules/identity/`, `src/modules/food-recognition/`'ın
zaten kurulu ve çalışır olduğunu varsayıyor.

---

## PROMPT

```
Bu bir TypeScript backend projesi (food-tracking mobil uygulaması). src/shared/,
src/modules/identity/, src/modules/food-recognition/ zaten kurulu. Şimdi
src/modules/onboarding-plan/ modülünü kuracağız — ama BİLİNÇLİ OLARAK MİNİMAL bir
kapsamla (identity modülünde uygulanan hibrit yaklaşımın aynısı).

Aynı klasördeki onboarding-plan-rule.md ve shared-rule.md dosyalarını oku, TÜM
kurallarına harfiyen uy. ÖZELLİKLE:

1. SADECE CompleteOnboarding use-case'i yazılacak. ComputeHealthScore,
   ComputeWeightProjection, ValidateMacroOverride YAZILMAYACAK — bunlara ait boş
   dosya/placeholder bile oluşturma, sadece gerçekten kapsamda olanı yaz.
2. shared/domain/PlanCalculationService.ts ZATEN VAR ve ÇALIŞIYOR — yeniden yazma,
   sadece import edip çağır. Eğer beklediğin imzada değilse, onu değiştirmeden ÖNCE
   bana/rapora bildir.
3. UserProfile ve Plan tabloları, identity modülünün User tablosuna HİÇBİR ALAN
   EKLEMEZ — tamamen ayrı tablolar, sadece userId foreign key ile ilişkili.
4. GetActivePlan use-case'i, nutrition-logging modülünün (henüz yazılmadı, ama bu
   modülün bunu public bir şekilde sunması gerekiyor) ileride doğrudan import edip
   çağırabileceği şekilde net ve stabil bir arayüze sahip olmalı: execute(userId):
   Promise<Plan | null> — plan yoksa hata fırlatmaz, null döner.

Test altyapısı: testcontainers (identity/food-recognition'da kanıtlanmış pattern).
shared/config/env.ts'in import-zamanı fail-fast davranışı nedeniyle, container bağımlı
modülleri beforeAll içinde, env set edildikten SONRA dinamik `await import(...)` ile
yükle (identity turunda keşfedilen nüans, bu projede artık standart).

Oluşturulacak yapı:

src/modules/onboarding-plan/
  domain/
    (BU TURDA BOŞ — HealthScore/WeightProjection/MacroOverride sonraya bırakıldı)

  use-cases/
    CompleteOnboarding.ts
    CompleteOnboarding.test.ts
    GetActivePlan.ts
    GetActivePlan.test.ts

  ports/
    UserProfileRepositoryPort.ts
    PlanRepositoryPort.ts

  adapters/
    repository/
      PrismaUserProfileRepository.ts
      PrismaUserProfileRepository.integration.test.ts
      PrismaPlanRepository.ts
      PrismaPlanRepository.integration.test.ts

  test-utils/
    fakes/
      InMemoryUserProfileRepository.ts
      InMemoryPlanRepository.ts

  http/
    OnboardingController.ts        -> POST /onboarding/complete
    onboardingRoutes.ts              -> route + wiring (manuel constructor injection)

Prisma şeması güncellemesi (schema.prisma'ya ekle, mevcut modelleri BOZMA):

model UserProfile {
  userId          String   @id
  user            User     @relation(fields: [userId], references: [id])
  weightKg        Float
  heightCm        Float
  age             Int
  gender          String
  workoutsPerWeek Int
  goal            String   // 'lose' | 'maintain' | 'gain'
  weeklyPaceKg    Float
  createdAt       DateTime @default(now())
}

model Plan {
  userId        String   @id
  user          User     @relation(fields: [userId], references: [id])
  dailyCalories Float
  proteinG      Float
  carbsG        Float
  fatG          Float
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

(User modelindeki mevcut alanlara/ilişkilere DOKUNMA, sadece yukarıdaki iki modeli ekle
ve User'a `userProfile UserProfile?` / `plan Plan?` ters ilişkilerini ekle.)

Beklentiler:
- Gerçek, çalışan, derlenebilir TypeScript kodu — placeholder/TODO YOK (kapsam dışı
  bırakılanlar HARİÇ, onlar zaten hiç oluşturulmuyor).
- Her hata durumu shared/errors/ taksonomisinden bir sınıf kullanmalı (özellikle
  ConflictError('ALREADY_ONBOARDED')).
- TÜM testleri yaz, ÇALIŞTIR, geçene kadar düzelt.
- SADECE onboarding-plan modülüne ve şemaya (User'a yeni ilişki eklemek hariç) dokun,
  başka hiçbir modüle dokunma.
```

---

## Tamamlama Raporu (Claude Code işin sonunda bunu doldurmalı)

### 1. Ne yapıldı
### 2. Rule dosyasındaki hangi kurallara karşılık geldiği
### 3. Karşılaşılan/düzeltilen sorunlar
### 4. Test sonuçları (hangi komut, kaç geçti/kaldı, çalıştırılamayan varsa neden)
### 5. Rule/Prompt'tan bilinçli sapma var mı (varsa neden)
