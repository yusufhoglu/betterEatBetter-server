# Activity Modulu — Rule

`src/modules/activity/`: telefonun saglik verisinden (Apple Health / Health Connect)
gelen gunluk adim toplamlari.

- **Kaynak cihazdir**: backend adim SAYMAZ, cihazin gun toplamini saklar. Tablo event log
  degil, `(userId, date)` basina tek satir; ayni gun tekrar gonderildikce UPSERT ile guncellenir.
- `PUT /activity/steps { timeZone, source, days:[{date,steps}] }`: son 31 gun, gelecek gun yok,
  0–100.000 arasi. Mobil uygulama acildiginda/one geldiginde son 7 gunu gonderir (idempotent).
- `GET /activity/steps?from=&to=&timeZone=`: kullanicinin kendi verisi.
- Diger moduller (practice analitigi) SADECE `GetStepsForRange` public use-case'i uzerinden okur.
- Adim hedefi bu modulde DEGIL: `onboarding-plan` (`Plan.stepTarget`, null = otomatik,
  `domain/ComputeActivityTargets.ts`).
- Diyetisyen tarafinda gorunurluk `practice` consent kapsami `steps` ile yonetilir.
