# Onboarding Plan Modülü — Implementasyon Raporu

`onboarding-plan-prompt.md`, `onboarding-plan-rule.md` ve `shared-rule.md`'nin
istediği minimal kapsam üzerine hazırlanmıştır. Bu tur üç ayrı adımdan oluştu:
(1) bloklayan bir bağımlılığın (`PlanCalculationService`) tamamlanması, (2) repo
geneli bir testcontainer image düzeltmesi, (3) `onboarding-plan` modülünün kendisi.

---

## 1. Ne yapıldı

### 1.1 `shared/domain/PlanCalculationService.ts` (ön koşul, bloklayıcıydı)

Prompt bu dosyanın "zaten var ve çalışıyor" olduğunu varsayıyordu, ama taramada
tamamen implement edilmemiş bir stub olduğu bulundu (`ComputeBMR` vb. hepsi
`throw new Error('Not implemented')`). Rule'un "beklenen imzada değilse önce
bildir" talimatına uyularak durduruldu, kullanıcıdan onaylı formüller alındı,
sonra yazıldı:

- `computeBMR` — Mifflin-St Jeor formülü (cinsiyete göre +5 / -161).
- `computeTDEE` — `workoutsPerWeek`'e göre kademeli aktivite çarpanı (1.2 → 1.9).
- `computeDailyCalorieTarget` — `weeklyPaceKg` önce 1'e klamplenir, 7700 kcal/kg
  varsayımıyla günlük açık/fazla hesaplanır, sonuç asla 1200 kcal altına düşmez.
- `computeMacroSplit` — protein = 2g/kg, kalan kalori karbonhidrat/yağ arasında
  %50/%50 bölünür (negatife düşmez, 0'a klamplenir).
- `computePlan` — dördünü sırayla çağıran, `CompleteOnboarding`'in kullandığı
  birleşik fonksiyon.

Co-located `PlanCalculationService.test.ts`: BMR için erkek/kadın referans
değeri, TDEE için her aktivite kademesinin sınır değeri (0/1/3/5/7/10), calorie
target için üç kritik edge-case (1200 altı klamp, pace>1 klamp, maintain'de
klampsız TDEE), macro split için normal + protein-kalorisi-taşması durumu,
`computePlan` için uçtan uca tutarlılık.

### 1.2 Postgres testcontainer image düzeltmesi (repo geneli, `fix-postgres-image-prompt.md`)

Repo genelinde `PostgreSqlContainer(` çağrıları tarandı (4 dosya bulundu).
Sadece **`food-recognition/adapters/repository/PrismaFoodEntryRepository.integration.test.ts`**
hâlâ düz `postgres:16-alpine` kullanıyordu → `pgvector/pgvector:pg16` ile
değiştirildi (schema'nın `CREATE EXTENSION IF NOT EXISTS "vector"` migration
adımı bu image'da patlıyordu). Diğer 3 dosya zaten doğruydu, dokunulmadı.
Detaylı rapor `fix-postgres-image-prompt.md`'nin sonuna eklendi.

### 1.3 `onboarding-plan` modülünün kendisi

Repoda modül için önceden "genel iskelet kurulumu" turundan kalma `TODO`/
`test.todo` stub dosyaları vardı — hepsi silinip yeniden yazılmak yerine
**dolduruldu**:

| Katman | Dosya | Durum |
|---|---|---|
| ports | `UserProfileRepositoryPort.ts`, `PlanRepositoryPort.ts` | stub dolduruldu |
| use-cases | `CompleteOnboarding.ts` | stub dolduruldu |
| use-cases | `CompleteOnboarding.test.ts` | `test.todo` gerçek testlerle dolduruldu |
| use-cases | `GetActivePlan.ts`, `GetActivePlan.test.ts` | **yeni** (stub yoktu) |
| adapters | `PrismaUserProfileRepository.ts`, `PrismaPlanRepository.ts` | stub dolduruldu |
| adapters | ilgili `.integration.test.ts` dosyaları | `test.todo` gerçek testlerle dolduruldu |
| test-utils | `InMemoryUserProfileRepository.ts`, `InMemoryPlanRepository.ts` | **yeni** (stub yoktu) |
| http | `OnboardingController.ts`, `onboardingRoutes.ts` | stub dolduruldu |
| şema | `schema.prisma` | `UserProfile`/`Plan` modelleri + `User`'a ters ilişki eklendi |
| migration | `20260824000000_add_onboarding_plan_tables/migration.sql` | **yeni** |

**`CompleteOnboarding`**: `userId` için mevcut `UserProfile` var mı kontrol
eder → varsa `ConflictError('ALREADY_ONBOARDED')` (upsert yok). Yoksa profili
kaydeder, `PlanCalculationService.computePlan(...)`'ı çağırır, sonucu `Plan`
olarak kaydedip döner.

**`GetActivePlan`**: `execute(userId): Promise<Plan | null>` — plan yoksa hata
fırlatmaz, `null` döner. `nutrition-logging`'in ileride doğrudan import edip
çağırması için stabil bırakıldı (bkz. `onboarding-plan-doc.md` §3).

**Şema**: `UserProfile` ve `Plan`, `identity.User`'a hiçbir alan eklemeden,
sadece `userId` FK (`onDelete: Cascade`) ile ilişkili ayrı tablolar
(`user_profiles`, `plans`). `Plan.userId` `@id` olduğu için doğal olarak unique
— kullanıcı başına tek plan satırı. Migration, canlı DB gerektirmeden
`prisma migrate diff --from-schema-datamodel <eski şema> --to-schema-datamodel
<yeni şema> --script` ile üretildi.

**HTTP**: `POST /onboarding/complete`, `authMiddleware` arkasında, zod ile
body validasyonu (`weightKg`/`heightCm`/`age` pozitif, `gender`/`goal` enum,
`workoutsPerWeek` ≥ 0). `router.ts`'de mount noktası zaten vardı, değişmedi.

---

## 2. Rule dosyasındaki hangi kurallara karşılık geldiği

| Yapılan | `onboarding-plan-rule.md` referansı |
|---|---|
| Sadece `CompleteOnboarding` + `GetActivePlan` yazıldı | "Kapsam — ne yapılıyor" |
| `ComputeHealthScore`/`ComputeWeightProjection`/`ValidateMacroOverride`'a dokunulmadı | "KAPSAM UYARISI" |
| `UserProfile`/`Plan` ayrı tablo, `User`'a alan eklenmedi | "Tablo ayrımı" |
| `ALREADY_ONBOARDED` conflict, upsert yok | "tekrar çağrılma davranışı" |
| `GetActivePlan` stabil `execute(userId): Promise<Plan\|null>` | "Modüller arası erişim" |
| testcontainers + `pgvector/pgvector:pg16` + `beforeAll` içinde dinamik import | "Diğer kurallar" + `shared-rule.md` Persistence |

---

## 3. Karşılaşılan/düzeltilen sorunlar

- **`PlanCalculationService` prompttaki iddianın aksine hiç implement edilmemişti**
  (bkz. §1.1) — koda dokunmadan önce durduruldu, kullanıcıdan onaylı formüller
  alındı, sonra yazıldı. İş mantığı kodunda bunun dışında bug bulunmadı.
- Modülün geri kalanındaki (`CompleteOnboarding.ts`, ports, adapters, http)
  stub'lar beklenen şekildeydi — hepsi "genel iskelet kurulumu" turundan kalma
  `TODO`/`throw new Error('Not implemented')` placeholder'lardı, sürpriz yoktu.
- `food-recognition`'daki postgres image sorunu ayrı bir prompt (`fix-postgres-image-prompt.md`)
  ile ele alındı, bu modülün kendi kapsamına karışmadı.

---

## 4. Test sonuçları

| Komut | Sonuç |
|---|---|
| `npx tsc --noEmit` | ✅ temiz (repo geneli) |
| `npm run test:unit` (repo geneli) | ✅ 53/53 suite, 77/113 test geçti, 36 todo (diğer, henüz yazılmamış modüllere ait — bu tura ait değil) |
| `PlanCalculationService.test.ts` | ✅ 14/14 |
| `CompleteOnboarding.test.ts` + `GetActivePlan.test.ts` | ✅ 6/6 |
| `PrismaUserProfileRepository.integration.test.ts` / `PrismaPlanRepository.integration.test.ts` | ⚠️ Docker bu ortamda yok (`docker info` başarısız) — çalıştırılamadı, sadece `tsc` ile derleme doğrulandı. Docker'lı bir makinede identity/food-recognition'da kanıtlanmış aynı pattern (testcontainers + `pgvector/pgvector:pg16` + `beforeAll` içinde dinamik import) izlendiği için geçmesi beklenir. |

---

## 5. Rule/Prompt'tan bilinçli sapma var mı

- **`PlanCalculationService`**: prompt "zaten var ve çalışıyor, sadece çağır"
  diyordu; gerçekte stub olduğu için kullanıcıyla onaylanan formüllerle
  implement edildi — bu, rule'un kendisinin öngördüğü "beklenmedik imza →
  önce bildir" prosedürüne göre yapılan bilinçli (ve onaylı) bir sapma.
- Başka sapma yok: `CompleteOnboarding`/`GetActivePlan` transaction'sız,
  sıralı iki repository yazımı olarak bırakıldı (identity'deki `SignUp`'ın
  kullanıcı+refresh-token yazım sırasıyla aynı seviyede sadelik) — rule
  atomiklik istemiyor, `shared-rule.md`'deki opsiyonel `tx` parametresi
  sadece outbox pattern'i için öneriliyor, burada zorunlu değil.
