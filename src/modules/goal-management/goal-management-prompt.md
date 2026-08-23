# Claude Code Promptları — `UpdatePlan` Eki + `goal-management` Modülü

Bu dosya İKİ ardışık prompt içerir. SIRAYLA çalıştırılmalı:
1. Önce `onboarding-plan`'a `UpdatePlan` eklenir (bağımlılık).
2. Sonra `goal-management` modülü kurulur.

Güncel `onboarding-plan-rule.md` (içinde artık "UpdatePlan" bölümü var) ve
`shared-rule.md`'yi aynı klasöre koyup referans ver.

---

## PROMPT 1 — `onboarding-plan`'a `UpdatePlan` Eki

```
src/modules/onboarding-plan/ modülü zaten implemente edilmiş ve çalışıyor. Bu turda
SADECE eksik bir parçayı ekleyeceğiz: UpdatePlan adında yeni bir public yazma
use-case'i. Mevcut hiçbir dosyayı/davranışı DEĞİŞTİRME — sadece ekleme yap.

Güncel onboarding-plan-rule.md'nin "UpdatePlan" bölümünü uygula:

1. use-cases/UpdatePlan.ts oluştur:
   execute(userId, changes: { weightKg?, workoutsPerWeek?, goal?, weeklyPaceKg? }): Promise<Plan>
   - UserProfile yüklenir; YOKSA NotFoundError('NOT_ONBOARDED').
   - Verilen alanlar (sadece tanımlı olanlar) profile merge edilip kaydedilir.
   - PlanCalculationService.computePlan TAM profille (değişmeyen heightCm/age/gender
     profilden) yeniden çağrılır.
   - Mevcut Plan satırı güncellenir (yeni satır AÇILMAZ), güncel Plan döner.
   - heightCm/age/gender bu use-case üzerinden DEĞİŞTİRİLEMEZ — changes tipinde
     bu alanlar YOK.

2. Gerekiyorsa UserProfileRepositoryPort/PlanRepositoryPort'a update metodları ekle
   (mevcut metodları SİLMEDEN/DEĞİŞTİRMEDEN), Prisma implementasyonlarını ve
   InMemory fake'lerini güncelle (yine sadece EKLEME).

3. use-cases/UpdatePlan.test.ts yaz:
   - NOT_ONBOARDED hatası (profil yokken).
   - Kısmi güncelleme: sadece weeklyPaceKg değişince diğer profil alanlarının
     korunduğu ve planın yeni pace ile yeniden hesaplandığı.
   - Plan satırının GÜNCELLENDİĞİ, yeni satır açılmadığı (fake repository'de kayıt
     sayısı kontrolü).

Testleri çalıştır, mevcut onboarding-plan testlerinin de hâlâ geçtiğini doğrula.
SADECE onboarding-plan modülüne dokun.
```

---

## PROMPT 2 — `goal-management` Modülü (Minimal Kapsam)

```
Bu bir TypeScript backend projesi. shared/, identity/, food-recognition/,
onboarding-plan/ (UpdatePlan use-case'i DAHİL — bir önceki turda eklendi),
nutrition-logging/ zaten kurulu. Şimdi src/modules/goal-management/ modülünü
kuracağız — BİLİNÇLİ OLARAK MİNİMAL kapsamla.

KAPSAM UYARISI: SADECE UpdateGoal yazılacak. ComputeWeeksToGoal YAZILMAYACAK —
o, targetWeightKg alanını gerektiriyor ve bu alan henüz onboarding'de toplanmıyor
(zenginleştirme turuna ertelendi, ComputeWeightProjection ile birlikte gelecek).
Boş dosya/placeholder da OLUŞTURMA.

Kurallar:
1. UpdateGoal, UserProfile/Plan tablolarına ASLA kendi Prisma sorgusuyla yazmaz —
   onboarding-plan'ın UpdatePlan public use-case'ine delege eder.
2. Port sahipliği: goal-management kendi PlanUpdaterPort'unu tanımlar (kullanan
   tanımlar); adapters/plan/OnboardingPlanUpdateAdapter.ts bu Port'u, UpdatePlan
   use-case'ini DOĞRUDAN import edip çağırarak implemente eder (in-process,
   GetActivePlan/GetLoggedMealTypesForDateRange ile aynı pattern).
3. UpdateGoal input validasyonu (zod): en az BİR alan verilmeli (hepsi opsiyonel ama
   tamamı boş istek ValidationError), weightKg/weeklyPaceKg pozitif, goal enum
   ('lose'|'maintain'|'gain'), workoutsPerWeek >= 0.
4. NOT_ONBOARDED hatası UpdatePlan'dan geldiği gibi yukarı taşınır (yutulmaz).

Repoda bu modüle ait test.todo stub'ları olabilir — önce tara, SİLİP yeniden yazma,
DOLDUR.

Oluşturulacak yapı:

src/modules/goal-management/
  use-cases/
    UpdateGoal.ts
    UpdateGoal.test.ts        -> fake PlanUpdaterPort ile: başarı akışı, boş istek
                                 ValidationError, NOT_ONBOARDED'ın yutulmadan
                                 yukarı taşındığı
  ports/
    PlanUpdaterPort.ts
  adapters/
    plan/
      OnboardingPlanUpdateAdapter.ts
      OnboardingPlanUpdateAdapter.test.ts   -> cross-module, gerçek UpdatePlan importu
  test-utils/
    fakes/
      FakePlanUpdaterPort.ts
  http/
    GoalManagementController.ts    -> PATCH /goal
    goalManagementRoutes.ts

Bu modülün KENDİ TABLOSU YOK — domain/ klasörü de bu turda BOŞ kalıyor
(ComputeWeeksToGoal ertelendi), oluşturma.

Gerçek, çalışan kod; hata taksonomisi shared/errors/'dan; TÜM testleri yaz, ÇALIŞTIR,
geçene kadar düzelt. SADECE goal-management modülüne dokun.
```

---

## Tamamlama Raporu (her iki prompt için ayrı ayrı doldurulmalı)

### 1. Ne yapıldı
### 2. Rule dosyasındaki hangi kurallara karşılık geldiği
### 3. Karşılaşılan/düzeltilen sorunlar
### 4. Test sonuçları (yeni testler + mevcut testlerin hâlâ geçtiği)
### 5. Rule/Prompt'tan bilinçli sapma var mı (varsa neden)
