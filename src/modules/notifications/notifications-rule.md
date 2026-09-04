# Notifications Modulu — Rule

`src/modules/notifications/` altinda kod yazarken uyulacak kurallar. Referans:
`shared-rule.md` (§Scheduling, §Queue, §Trace Context, §Resilience),
`me-doc.md` (notification preferences sahibi), `daily-tracking` + `body-analytics`
public use-case'leri.

---

## Cihaz token'i tek dogruluk kaynagi — `device_tokens`

- Bir satir = bir (cihaz, push token). `token` UNIQUE; ayni token farkli
  kullaniciya tasinabilir (ortak cihaz) — `upsertByToken` her zaman
  `userId/platform/timezone/locale/lastSeenAt` alanlarini tazeler.
- **Timezone cihazdan gelir.** Mobil her `POST /notifications/device-token`
  cagrisinda kendi IANA saat dilimini yollar. Job'lar `resolveLocalWallClock`
  ile bu saat dilimine gore karar verir — SUNUCU saati ASLA kullanilmaz.
- `locale` da token'da tutulur (job'larin urettigi kopya bu dilde yazilir).
  Yoksa `Accept-Language` header'indan (`getLocale`) turetilir.
- Cozulemeyen saat dilimi job'i DUSURMEZ — `resolveLocalWallClock` UTC'ye
  duser (`fellBackToUtc: true`) ve `logger.warn` atar.

## Push gonderimi — `PushSenderPort` arkasinda

- Provider kodu (FCM HTTP v1, APNs HTTP/2) `adapters/push/` disina SIZMAZ.
  Use-case'ler ve job'lar `PlatformRoutingPushSender`'a bagimlidir, somut
  adapter'lara degil.
- Yeni SDK EKLENMEZ: FCM `google-auth-library` (JWT) + `fetch`, APNs
  `node:http2` + `jsonwebtoken` (ES256). `GoogleReceiptAdapter` /
  `GooglePubSubVerifier` ile ayni desen.
- Her adapter kendi `buildResiliencePolicy` instance'ini bir kere kurar
  (circuit breaker paylasilmali). Retry SADECE `retryable: true` olan
  `IntegrationError`'da.
- `PushSendResult` uc durum: `sent` | `invalid_token` | `error{retryable}`.
  `invalid_token` gelince cagiran (`SendPushToUser`) satiri SILER — olu
  token'lar bir daha denenmez.
- APNs/FCM kimlik env'leri (`FCM_SERVICE_ACCOUNT_JSON`, `APNS_*`) sadece
  `NOTIFICATIONS_ENABLED` iken zorunludur (`env.ts` superRefine), tipki
  `LOKI_*` gibi.

## Zamanlanmis job'lar — tek cron, "su an kimler uygun"

- `shared-rule.md` §Scheduling: kullanici basina repeatable job ACILMAZ. Uc
  sabit cron var (`notificationScheduler.ts`):
  - `meal-reminders` — `*/15 * * * *`
  - `streak-saver` — `*/30 * * * *`
  - `weekly-report` — `0 * * * *`
- Her job TUM cihaz token'larini `listPage` ile sayfalar, her cihaz icin
  yerel duvar saatini hesaplar ve kosulu kontrol eder.
- **Dedupe: Redis guard zorunlu.** `SendGuardPort.claim(key, ttl)` bir anahtari
  TTL penceresinde en fazla bir kez `true` doner (`SET NX EX`). Anahtarlar:
  `meal:<userId>:<dateKey>:<meal>`, `streak:<userId>:<dateKey>`,
  `weekly:<userId>:<isoWeekKey>`. Guard fail-OPEN (Redis dusükse gonderim
  gecer — sessiz kayip yerine olasi cift bildirim).
- `MemoizingSendGuard` her job kosusunda YENIDEN kurulur (in-run set birikmesin).
- Tercihler run basina bir kez cekilir (`PreferenceCache`) — ayni kullanicinin
  birden cok cihazi tek sorgu.
- Job bir kullaniciya gonderirken `SendPushToUser` o kullanicinin TUM
  cihazlarina yollar; guard anahtari kullanici bazli oldugu icin ayni tur
  ikinci cihaz taramasinda atlanir.
- Trace: `createWorker` job.data.traceId'yi kurar; dispatch ayrica her fire icin
  taze `runWithContext({ traceId })` acar (repeatable payload sabittir).

## Moduller arasi okuma — DOGRUDAN erisim YASAK

- Tercihler: `NotificationPreferencesPort` -> `me` `PrismaMePreferencesRepository`.
  Kendi preference kopyanizi olusturmayin.
- Gun tamamlanma / streak: `DayCompletionPort` -> `daily-tracking` `GetTodayStatus`.
- Haftalik ozet: `WeeklySummaryPort` -> `daily-tracking` `GetWeekProgress` +
  `body-analytics` `GetMealAverages`.
- `notification_preferences` / `meal_items` / tracking tablolarina bu modul
  DOGRUDAN sorgu ATMAZ.

## Kopya (copy) — `domain/NotificationCopy.ts`

- Tum kullanici-yuzu metin `Record<Locale, ...>` tablosunda, `en` + `tr`
  (`TemplateInsightGenerator` deseni). Job icinde string birlestirme YAPILMAZ.

---

## Test Stratejisi

### Unit — `domain/` (saf, mock yok)
- `localWallClock.test.ts`: tz donusumu, gece yarisi tarih donusu, ISO hafta, UTF fallback.
- `matchReminderSlot.test.ts`: yarim-acik `[target, target+width)` penceresi, bozuk HH:MM.
- `NotificationCopy.test.ts`: `en`/`tr` lokalize, olgu enjeksiyonu.

### Unit — `use-cases/` (el yazimi fake, `jest.mock()` degil)
- `RegisterDeviceToken.test.ts`: upsert payload, locale fallback, token sahip degisimi, tz/platform validasyonu.
- `SendPushToUser.test.ts`: tum cihazlara gonderim, `invalid_token` -> satir silinir, `error` -> silinmez.

### Unit — `jobs/` (fake port + enjekte `now` + `FakeSendGuard`)
- `MealReminderScheduler.test.ts` / `StreakSaverAlertJob.test.ts` / `WeeklyReportJob.test.ts`:
  kimin bildirim aldigi, guard ikinci kosuyu engeller, master/slot/pref kapaliysa sessiz,
  slot/hafta gunu/saat disinda tetiklenmez.

### Adapter
- `adapters/push/FcmPushAdapter.test.ts` (`fetch` stub): durum eslemesi.
- `adapters/repository/PrismaDeviceTokenRepository.integration.test.ts`:
  testcontainers `pgvector/pgvector:pg16`; token-bazli upsert, cursor sayfalama, idempotent delete.
- APNs adapter (http2) staging'de elle dogrulanir.

**Tum testler yazildiktan sonra calistirilip gectigi dogrulanmali.**
