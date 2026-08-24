# Claude Code Promptları — `body-analytics` Ön Koşulları

Bu dosya İKİ ardışık, birbirinden BAĞIMSIZ prompt içerir (istenilen sırada veya paralel
çalıştırılabilir, ikisi de farklı modülleri hedefliyor). `body-analytics`'in kendisi
İKİSİ de bitmeden başlatılmamalı.

---

## PROMPT 1 — `nutrition-logging` Outbox Event Zenginleştirme

```
src/modules/nutrition-logging/ modülü zaten implemente edilmiş ve çalışıyor. Bu turda
SADECE outbox event payload'ını zenginleştireceğiz. Mevcut hiçbir davranışı DEĞİŞTİRME
(MealItem yazımı, upsert semantiği, sanity validasyonu vb. AYNEN kalır) — sadece
MealLoggedEventPublisher'ın (ve varsa meal.updated/meal.deleted event'lerinin)
payload'ına veri ekle.

Şu an 'meal.logged' event payload'ı sadece { userId, date, mealType, mealItemId }
taşıyor. body-analytics modülü bu event'ten SONRADAN nutrition-logging'e geri
okuma yapmadan (senkron cross-module bağımlılık olmadan) çalışabilmeli — bu yüzden
payload'a gerçek yemek verisini GÖM:

meal.logged payload'ı şuna genişlesin:
{
  userId, date, mealType, mealItemId,
  entries: [
    { name: string, source: string, portionGrams: number, calories: number,
      proteinG: number, carbsG: number, fatG: number }
  ]
}
(entries, LogMealEntries'e gelen/kaydedilen dizinin AYNISI — MealItem.entries JSON
kolonundan aynen kopyalanır.)

meal.updated ve meal.deleted event'leri de (varsa) aynı entries alanını taşısın
(updated: yeni hal; deleted: silinmeden önceki hal, body-analytics'in read-model'inden
düşebilmesi için).

Değişecek dosyalar: events/publishers/MealLoggedEventPublisher.ts (ve varsa
UpdateMealEntry.ts/DeleteMealEntry.ts'in event yayınlama kısımları). Mevcut testleri
buna göre güncelle (payload şekli değişti), YENİ bir test ekle: payload'ın gerçekten
entries içerdiğini doğrulayan.

Testleri çalıştır, TÜM nutrition-logging test suite'inin hâlâ geçtiğini doğrula.
SADECE nutrition-logging modülüne dokun.
```

---

## PROMPT 2 — `onboarding-plan`'a Hedef/Başlangıç Kilo + Yeni Public Use-case'ler

```
src/modules/onboarding-plan/ modülü zaten implemente edilmiş ve çalışıyor. Bu turda
ÜÇ ekleme yapacağız, mevcut hiçbir davranışı DEĞİŞTİRMEDEN.

1. Şema: UserProfile'a İKİ yeni alan ekle:
   - targetWeightKg (Float, NULLABLE — onboarding sırasında zorunlu değil, sonradan
     goal-management üzerinden set edilebilir)
   - initialWeightKg (Float, NOT NULL) — CompleteOnboarding çalıştığında weightKg'nin
     O ANKİ değeriyle DOLDURULUR, bir daha ASLA değişmez (hiçbir update use-case'i
     bu alana dokunmaz — "başlangıç" kavramının bütünlüğü için).
   CompleteOnboarding.ts'i güncelle: initialWeightKg = input.weightKg olarak kaydet.
   targetWeightKg, CompleteOnboarding'in girdisine OPSİYONEL bir alan olarak eklenebilir
   (verilmezse null kalır).

2. use-cases/GetUserProfile.ts (YENİ, public read use-case):
   execute(userId): Promise<UserProfile | null>
   Tüm UserProfile alanlarını (heightCm, gender, weightKg, targetWeightKg,
   initialWeightKg, workoutsPerWeek, goal, weeklyPaceKg dahil) döner. Bulunamazsa
   null (hata fırlatmaz) — GetActivePlan ile aynı davranış prensibi.

3. use-cases/UpdateProfileMeasurements.ts (YENİ, public write use-case):
   execute(userId, changes: { heightCm?, gender? }): Promise<UserProfile>
   - UserProfile yoksa NotFoundError('NOT_ONBOARDED').
   - Verilen alanlar merge edilip kaydedilir.
   - heightCm değiştiği için PlanCalculationService.computePlan TAM profille YENİDEN
     çağrılır (BMR formülü height'a bağlı) — Plan satırı güncellenir (UpdatePlan'daki
     ile AYNI güncelleme mantığı, ayrı bir use-case ama aynı deseni kullanır).
   - Bu use-case weightKg/workoutsPerWeek/goal/weeklyPaceKg'a DOKUNMAZ (o UpdatePlan'ın
     işi) — sadece heightCm/gender.

4. AYRICA: use-cases/UpdatePlan.ts'in changes tipine targetWeightKg? ekle (opsiyonel) —
   hedef kilo değişikliği de "hedef" kapsamına girdiği için UpdatePlan üzerinden
   güncellenebilsin (goal-management'ın UpdateGoal'ı ileride bunu iletebilir).
   initialWeightKg bu use-case'te DE değiştirilemez.

Her yeni use-case için test yaz (fake repository'lerle + mevcut testlerin hâlâ geçtiği
doğrulanarak). Testleri çalıştır, geçene kadar düzelt.

SADECE onboarding-plan modülüne dokun.
```

---

## Tamamlama Raporu (her iki prompt için ayrı ayrı doldurulmalı)

### 1. Ne yapıldı
### 2. Karşılaşılan/düzeltilen sorunlar
### 3. Test sonuçları (yeni testler + mevcut testlerin hâlâ geçtiği)
### 4. Bilinçli sapma var mı
