# Onboarding Plan Modülü (Minimal Kapsam) — Rule

Bu dosya `src/modules/onboarding-plan/` altında kod yazarken uyulması gereken kuralları
listeler. Referans: `backend-architecture.md` §8.2, `shared-rule.md`.

**KAPSAM UYARISI:** Bu, `identity`'deki gibi bilinçli bir HİBRİT/minimal tur. Sadece
`CompleteOnboarding` yazılıyor. `ComputeHealthScore`, `ComputeWeightProjection`,
`ValidateMacroOverride` BU TURDA YAZILMAZ — bunlar ayrı bir "zenginleştirme" turunda
eklenecek. Bu dosyalara ait boş dosya/placeholder da OLUŞTURMAYIN, sadece gerçekten
yazılanı yazın.

---

## Kapsam — ne yapılıyor

- **TEK use-case**: `CompleteOnboarding`.
- Girdi alanları (SADECE bunlar, fazlası eklenmez): `weightKg`, `heightCm`, `age`,
  `gender`, `workoutsPerWeek`, `goal` (`'lose'|'maintain'|'gain'`), `weeklyPaceKg`.
- `shared/domain/PlanCalculationService.ts` (ZATEN VAR, yeniden yazılmaz) çağrılarak
  `dailyCalories`, `proteinG`, `carbsG`, `fatG` hesaplanır.
- Ayrıca bu modül, `nutrition-logging`'in okuyabilmesi için bir **public use-case**
  (`GetActivePlan`) sunar — bkz. "Modüller arası erişim" bölümü.

## Tablo ayrımı — `identity`'nin `User` tablosuna DOKUNULMAZ

- `UserProfile` ve `Plan`, bu modülün KENDİ tabloları, `identity.User`'dan tamamen ayrı
  (sadece `userId` foreign key ile ilişkili).
- Şema:
  ```
  UserProfile: userId (PK, FK->User.id), weightKg, heightCm, age, gender,
               workoutsPerWeek, goal, weeklyPaceKg, createdAt

  Plan: userId (PK, FK->User.id, UNIQUE), dailyCalories, proteinG, carbsG, fatG,
        createdAt, updatedAt
  ```
- `Plan.userId` UNIQUE — kullanıcı başına TEK aktif plan satırı var, geçmiş plan
  değerlerinin tarihçesi TUTULMUYOR bu turda (ileride ayrı `PlanHistory` tablosu
  istenirse eklenir, şimdi eklenmez).

## `CompleteOnboarding` — tekrar çağrılma davranışı

- Kullanıcının zaten bir `UserProfile`/`Plan` kaydı varsa → `ConflictError
  ('ALREADY_ONBOARDED')`. UPSERT davranışı YOK.
- Hedef/kilo değişikliği bu use-case'in işi DEĞİL — o `goal-management/UpdateGoal`'ın
  sorumluluğu (ayrı modül, henüz yazılmadı, ama sınır burada net: `CompleteOnboarding`
  = ilk kurulum, `UpdateGoal` = sonraki değişiklikler).

## Modüller arası erişim — `nutrition-logging` bu modülü nasıl okuyor

- `nutrition-logging`, kendi `DailyTargetsPort`'unu tanımlıyor (kural: kullanan tanımlar).
- Bu modül, `use-cases/GetActivePlan.ts` adında BASİT bir query use-case sunar:
  `execute(userId): Promise<Plan | null>`.
- `nutrition-logging/adapters/targets/OnboardingPlanTargetsAdapter.ts`, bu
  `GetActivePlan` use-case'ini DOĞRUDAN import edip çağırır (modüler monolit içinde
  aynı process, gerçek bir HTTP çağrısı değil) — `nutrition-logging` asla `Plan`
  tablosuna kendi Prisma sorgusuyla erişmez, sadece bu use-case üzerinden.
- **Plan bulunamazsa (`null`) ne olur**: `nutrition-logging` tarafında bu bir HATA
  DEĞİL — kullanıcı henüz onboarding'i tamamlamamış demek. `DailyTargetsPort` adapter'ı
  `null` döner, `nutrition-logging`'in günlük özet hesaplaması bu durumda
  `remaining`/`goal` alanlarını `null` bırakıp sadece `consumed` değerini gösterir
  (hata fırlatıp kullanıcıyı bloklamaz).

## Diğer kurallar (shared/'den miras)

- Hata taksonomisi, DI (manuel/explicit), config (fail-fast env), trace context
  (`AsyncLocalStorage`) — hepsi `shared-rule.md`'deki gibi.
- Test altyapısı: **testcontainers** standardı (identity/food-recognition'da kanıtlanmış
  pattern), "çalışan dev DB'ye bağlan" YAKLAŞIMI YOK.
- `shared/config/env.ts`'in import-zamanı fail-fast davranışı nedeniyle, test dosyalarında
  container bağımlı modüller (`prisma` vb.) `beforeAll` içinde, env set edildikten SONRA
  dinamik `await import(...)` ile yüklenir (identity turunda keşfedilen nüans).

---

## Test Stratejisi

### Unit — `use-cases/`
- `CompleteOnboarding.test.ts` (fake `UserProfileRepositoryPort` + fake `PlanRepositoryPort`):
  - Başarılı akış: `PlanCalculationService`'in doğru çağrıldığı, sonucun doğru
    kaydedildiği.
  - İkinci kez çağrıldığında `ConflictError('ALREADY_ONBOARDED')`.
- `GetActivePlan.test.ts`: plan varsa döner, yoksa `null` döner (hata fırlatmaz).

### Integration — `adapters/` (testcontainers, Postgres)
- `PrismaUserProfileRepository.integration.test.ts`
- `PrismaPlanRepository.integration.test.ts`: `userId` unique constraint'inin gerçekten
  çalıştığı doğrulanır.

### Cross-module entegrasyon testi (ÖNEMLİ)
- `GetActivePlan`'ın `nutrition-logging` tarafında gerçekten doğru şekilde çağrılabildiğini
  doğrulayan bir test — bu, modüller arası public use-case erişiminin gerçekten çalıştığının
  kanıtı. Bu test `nutrition-logging` tarafında yazılacak (bu modülün turunda değil), ama
  bu modülün `GetActivePlan`'ı stabil ve test edilmiş bırakması önkoşuldur.

**Tüm testler yazıldıktan sonra çalıştırılıp geçtiği doğrulanmalı.**
