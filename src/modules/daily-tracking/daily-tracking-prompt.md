# Claude Code Prompt — `src/modules/daily-tracking/`

Aşağıdaki prompt'u olduğu gibi Claude Code'a verebilirsin. `daily-tracking-rule.md`
ve `shared-rule.md`'yi aynı klasöre koyup referans ver.

Bu prompt, `shared/`, `identity/`, `food-recognition/`, `onboarding-plan/`,
`nutrition-logging/`'in (özellikle `GetLoggedMealTypesForDateRange` use-case'i dahil)
zaten kurulu ve çalışır olduğunu varsayıyor.

---

## PROMPT

```
Bu bir TypeScript backend projesi (food-tracking mobil uygulaması). shared/, identity/,
food-recognition/, onboarding-plan/, nutrition-logging/ zaten kurulu. Şimdi
src/modules/daily-tracking/ modülünü kuracağız.

Aynı klasördeki daily-tracking-rule.md ve shared-rule.md dosyalarını oku, TÜM
kurallarına harfiyen uy. ÖZELLİKLE:

1. Bu modülün KENDİ TABLOSU/DB'si YOK — tamamen nutrition-logging'in verisi üzerinden
   hesaplama yapıyor. adapters/repository/ klasörü OLUŞTURMA, sadece adapters/dayLogs/.
2. DefineDayCompletion, breakfast+lunch+dinner üçü de loglanmışsa true döner (snack
   opsiyonel) — bu bir POLICY, ComputeStreak algoritmasının İÇİNE gömülmez, ayrı dosya.
3. shared/domain/resolveUserToday.ts ZATEN VAR — kendi "bugün" hesaplamanızı YAZMAYIN.
4. GetWeekProgress ve streak hesaplaması, nutrition-logging'in
   GetLoggedMealTypesForDateRange use-case'ini TEK ÇAĞRIDA kullanmalı — her günü ayrı
   ayrı sorgulamak YASAK, bunu test ediyoruz (DayLogsPort'un sadece bir kez çağrıldığı
   doğrulanacak).
5. Eğer nutrition-logging tarafında GetLoggedMealTypesForDateRange henüz yoksa, BUNU
   KENDİNİZ YAZMAYIN — raporda "bağımlılık eksik, nutrition-logging modülüne dokunulmadı"
   diye açıkça bildirin ve bu modülün geri kalanını (varsa yapılabilecek kısmı)
   tamamlayın ya da durdurup raporlayın, siz karar verin ama nutrition-logging'e
   dokunmayın.

Repoda bu modüle ait test.todo stub'ları olabilir — kod yazmaya başlamadan önce
src/modules/daily-tracking/ altında tara, SİLİP yeniden yazma, DOLDUR.

Oluşturulacak yapı:

src/modules/daily-tracking/
  domain/
    DayCompletion.ts
    DefineDayCompletion.ts
    DefineDayCompletion.test.ts
    ComputeStreak.ts
    ComputeStreak.test.ts

  use-cases/
    GetTodayStatus.ts
    GetTodayStatus.test.ts
    GetWeekProgress.ts
    GetWeekProgress.test.ts

  ports/
    DayLogsPort.ts

  adapters/
    dayLogs/
      NutritionLoggingDayLogsAdapter.ts
      NutritionLoggingDayLogsAdapter.test.ts   -> cross-module, gerçek import ile

  test-utils/
    fakes/
      FakeDayLogsPort.ts

  http/
    DailyTrackingController.ts
    dailyTrackingRoutes.ts

Beklentiler:
- Gerçek, çalışan, derlenebilir TypeScript kodu — placeholder/TODO YOK.
- Her hata durumu shared/errors/ taksonomisinden bir sınıf kullanmalı.
- TÜM testleri yaz, ÇALIŞTIR, geçene kadar düzelt.
- ComputeStreak'te "bugün henüz tamamlanmadıysa currentStreak nasıl davranır" sorusuna
  NET bir karar verip (örn. dünden başlayarak sayılır, bugünün eksikliği currentStreak'i
  sıfırlamaz ama henüz artırmaz da) bunu hem kodda hem testte açıkça göster, raporda
  bu kararı belirt.
- SADECE daily-tracking modülüne dokun, başka hiçbir modüle dokunma (nutrition-logging
  dahil).
```

---

## Tamamlama Raporu (Claude Code işin sonunda bunu doldurmalı)

### 1. Ne yapıldı
### 2. Rule dosyasındaki hangi kurallara karşılık geldiği
### 3. Karşılaşılan/düzeltilen sorunlar (özellikle: GetLoggedMealTypesForDateRange
   bağımlılığı var mıydı, yok muydu)
### 4. Test sonuçları (hangi komut, kaç geçti/kaldı, çalıştırılamayan varsa neden)
### 5. Rule/Prompt'tan bilinçli sapma var mı (varsa neden — özellikle currentStreak
   "bugün eksik" davranış kararı)
