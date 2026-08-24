# Goal Management Modulu - UpdateGoal Tamamlama Raporu

Bu rapor, `goal-management` modulu icin istenen minimal `UpdateGoal` turunun tamamlanma kaydidir.

## 1. Ne yapildi

- `use-cases/UpdateGoal.ts` dolduruldu.
- `UpdateGoal` icine zod tabanli input validasyonu eklendi:
  - en az bir alan zorunlu,
  - `weightKg` pozitif,
  - `weeklyPaceKg` pozitif,
  - `goal` enum: `'lose' | 'maintain' | 'gain'`,
  - `workoutsPerWeek >= 0`.
- `ports/PlanUpdaterPort.ts` olusturuldu.
- `adapters/plan/OnboardingPlanUpdateAdapter.ts` yazildi:
  - onboarding-plan modulu icindeki public `UpdatePlan` use-case'ini dogrudan import edip cagriyor.
- `test-utils/fakes/FakePlanUpdaterPort.ts` eklendi.
- `use-cases/UpdateGoal.test.ts` icindeki `test.todo` dolduruldu.
- `adapters/plan/OnboardingPlanUpdateAdapter.test.ts` yazildi:
  - cross-module olarak gercek `UpdatePlan` import edilip onboarding-plan fake repository'leriyle test edildi.
- `http/GoalManagementController.ts` ve `http/goalManagementRoutes.ts` gercek wiring ile dolduruldu:
  - `PATCH /goal`
  - `authMiddleware`
  - Prisma onboarding-plan repository'leri
  - `UpdatePlan` -> adapter -> `UpdateGoal` zinciri
- Placeholder ve kurala aykiri yapilar temizlendi:
  - `ports/PlanRepositoryPort.ts` kaldirildi,
  - `adapters/repository/OnboardingPlanAdapter.ts` kaldirildi,
  - ertelenmis `ComputeWeeksToGoal` placeholder dosyalari kaldirildi.

## 2. Rule dosyasindaki hangi kurallara karsilik geldigi

- `UpdateGoal` kendi Prisma yazimini yapmiyor:
  - yazma islemi onboarding-plan `UpdatePlan` use-case'ine delege edildi.
- "kullanan tanimlar" kurali uygulandi:
  - `goal-management` kendi `PlanUpdaterPort` sozlesmesini tanimladi.
- adapter, `UpdatePlan` use-case'ini dogrudan import edip in-process kullandi:
  - `GetActivePlan` ve benzeri modul-arasi use-case erisimi desenine uyuldu.
- zod validasyonu kurallari tam uygulandi:
  - bos istek reddedildi,
  - sayisal alanlar ve enum alanlari sinirlandi.
- `NOT_ONBOARDED` hatasi yutulmadi:
  - delegated hata aynen yukari tasindi.
- test.todo stub'i silinmeden dolduruldu:
  - `use-cases/UpdateGoal.test.ts` gercek testlerle tamamlandi.
- bu turda domain klasoru bos kalmali kurali uygulandi:
  - `ComputeWeeksToGoal` placeholder'i tutulmadi.

## 3. Karsilasilan/duzeltilen sorunlar

- Modulde daha once iskelet olarak birakilmis ama rule ile uyumsuz dosyalar vardi:
  - yanlis isimli port (`PlanRepositoryPort`),
  - yanlis yerde adapter (`adapters/repository/OnboardingPlanAdapter.ts`),
  - bu turda olmamasi gereken `ComputeWeeksToGoal` placeholder dosyalari.
- Bunlar, sadece `goal-management` modulu icinde, istenen yapıya cevrildi.
- `UpdateGoal` ve HTTP katmani tamamen placeholder durumundaydi; gercek davranisla dolduruldu.

## 4. Test sonuclari

- Yeni/yeniden doldurulan testler:
  - `src/modules/goal-management/use-cases/UpdateGoal.test.ts` gecti.
  - `src/modules/goal-management/adapters/plan/OnboardingPlanUpdateAdapter.test.ts` gecti.
- Calistirilan komutlar:
  - `cmd /c npx jest src/modules/goal-management --runInBand` -> `2/2` suite gecti, `4/4` test gecti.
  - `cmd /c npx tsc -p tsconfig.json --noEmit` -> gecti.
- Sonuc:
  - yeni testler gecti,
  - `goal-management` modulu derleme acisindan temiz.

## 5. Rule/Prompt'tan bilincli sapma var mi

- Kucuk ama bilincli bir duzeltme var:
  - prompt "test.todo stub'lari olabilir - silip yeniden yazma, doldur" diyordu.
  - `UpdateGoal.test.ts` stub'i gercekten dolduruldu.
  - ama modulde buna ek olarak rule ile celisen placeholder dosyalar da vardi; bunlar korunursa promptun "ComputeWeeksToGoal YAZILMAYACAK" ve "olusturulacak yapi" kurallari ihlal edilmeye devam edecekti.
  - bu nedenle sadece `goal-management` icinde, rule'a aykiri placeholder dosyalari kaldirildi ve dogru dosya yapisi kuruldu.
- Bunun disinda sapma yok:
  - sadece `goal-management` modulu degistirildi,
  - yazma onboarding-plan `UpdatePlan` use-case'ine delege edildi,
  - modula ait yeni tablo veya domain hesaplamasi eklenmedi.
