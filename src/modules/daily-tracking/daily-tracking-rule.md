# Daily Tracking Modülü — Rule

Bu dosya `src/modules/daily-tracking/` altında kod yazarken uyulması gereken kuralları
listeler. Referans: `backend-architecture.md` §8.6, `shared-rule.md`.

---

## Gün tamamlanma kuralı — POLICY, algoritmadan AYRI

- `domain/DefineDayCompletion.ts`: **VARSAYIM (kolayca değiştirilebilir)** —
  `breakfast`, `lunch`, `dinner`'ın ÜÇÜ DE loglanmışsa gün "tamamlanmış" sayılır.
  `snack` OPSİYONEL, tamamlanma kararını etkilemez.
- Bu bir POLICY fonksiyonu, `ComputeStreak`'in (algoritma) İÇİNE gömülmez — ayrı
  dosyada durur çünkü kural değişebilir (örn. ileride "kalori hedefine ulaşıldıysa"
  gibi bir kurala geçilebilir), algoritma değişmez.
- İmza: `defineDayCompletion(loggedMealTypes: string[]): boolean` — pure, I/O yok.

## `ComputeStreak` — saf algoritma

- `domain/ComputeStreak.ts`: bugünden geriye doğru, art arda "tamamlanmış" (yukarıdaki
  policy'e göre) günleri sayar. Girdi: tarihe göre sıralı bir `boolean[]` (ya da
  `Map<date, boolean>`) — HANGİ günün tamamlandığı bilgisi zaten `Application`
  katmanında (`GetTodayStatus` use-case'i) hazırlanmış olarak gelir, bu fonksiyon
  sadece diziyi işler.
- Dönüş: `{ currentStreak: number; longestStreak: number }`.

## `resolveUserToday` — TEKRAR YAZILMAZ

- `shared/domain/resolveUserToday.ts` ZATEN VAR — bu modül onu import edip kullanır,
  kendi "bugün" hesaplamasını YAPMAZ. Kullanıcının saat dilimine göre gün sınırı
  HER YERDE bu fonksiyondan gelir.

## `DayLogsPort` — `nutrition-logging`'e bağlanma şekli

- Bu modül kendi `DayLogsPort`'unu tanımlar (kural: kullanan tanımlar).
- `adapters/dayLogs/NutritionLoggingDayLogsAdapter.ts`, `nutrition-logging` modülünün
  `use-cases/GetLoggedMealTypesForDateRange.ts`'ini (nutrition-logging-rule.md'de
  bu modülün ihtiyacı için EKLENMİŞ bir public use-case) DOĞRUDAN import edip çağırır.
- **VERİMLİLİK KURALI**: `GetWeekProgress`/streak hesaplaması için HER GÜNÜ TEK TEK
  sorgulamak YASAK — bir tarih aralığını TEK ÇAĞRIDA alıp (`GetLoggedMealTypesForDateRange`)
  sonra `Application` katmanında günlere bölerek işleyin.
- Eğer `nutrition-logging` tarafında bu use-case henüz yoksa (paralel geliştirme
  sırasında sıralama farklı olabilir), bunu KENDİNİZ YAZMAYIN — raporda "bağımlılık
  eksik" diye bildirin, `nutrition-logging` modülüne dokunmayın.

## Use-case'ler

- `GetTodayStatus.ts`: `resolveUserToday` ile bugünü belirler, `DayLogsPort`'tan son
  N gün (streak hesaplamak için yeterli bir pencere, örn. son 60 gün — sonsuza kadar
  geriye gitmez) için loglanmış `mealType`'ları çeker, her günü `DefineDayCompletion`'a
  sokup `ComputeStreak`'e verir.
- `GetWeekProgress.ts`: verilen hafta başlangıcından 7 günlük bir `Map<date, boolean>`
  döner (tek `DayLogsPort` çağrısıyla, gün gün değil).

## Diğer kurallar (shared/'den miras)

- Hata taksonomisi, DI (manuel/explicit), config (fail-fast env), trace context
  (`AsyncLocalStorage`) — hepsi `shared-rule.md`'deki gibi.
- Bu modülün KENDİ tablosu YOK — tamamen `nutrition-logging`'in verisi üzerinden
  hesaplama yapan, salt-okunur bir modül. Bu yüzden bu modülde
  `adapters/repository/` YOK, sadece `adapters/dayLogs/` var.
- Test altyapısı: testcontainers gerektiren bir şey YOK bu modülde (kendi DB'si yok),
  sadece unit test + cross-module entegrasyon testi.
- **Repoda bu modüle ait `test.todo` stub'ları olabilir** — kod yazmaya başlamadan
  önce tarayın, SİLİP yeniden yazmak yerine DOLDURUN.

---

## Test Stratejisi

### Unit — `domain/`
- `DefineDayCompletion.test.ts`: üç ana öğün + snack kombinasyonlarının hepsi
  (sadece breakfast+lunch+dinner varsa true, snack eksik farketmez, biri eksikse false).
- `ComputeStreak.test.ts`: boş dizi, tek gün, ardışık tamamlanmış günler, arada boşluk
  olan diziler (streak'in doğru yerde kesildiği) — ZORUNLU edge-case: bugün henüz
  tamamlanmamışsa (`false` ile bitiyorsa) `currentStreak`'in nasıl davrandığı NET
  tanımlanmalı (dünden başlayarak mı sayılır, yoksa 0 mı döner — bunu implementasyonda
  netleştirip testle sabitleyin).

### Unit — `use-cases/` (fake `DayLogsPort` ile)
- `GetTodayStatus.test.ts`: fake'in döndürdüğü veri üzerinden streak'in doğru
  hesaplandığı.
- `GetWeekProgress.test.ts`: `DayLogsPort`'un SADECE BİR KEZ çağrıldığının (7 kez
  değil) doğrulanması — verimlilik kuralının gerçekten uygulandığının kanıtı.

### Cross-module entegrasyon testi
- `NutritionLoggingDayLogsAdapter.test.ts`: gerçek `nutrition-logging/
  GetLoggedMealTypesForDateRange` importu ile (fake değil) çağrının doğru çalıştığı
  doğrulanır.

**Tüm testler yazıldıktan sonra çalıştırılıp geçtiği doğrulanmalı.**
