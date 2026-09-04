# Notifications Modulu — Developer Doc

Push bildirim altyapisi: cihaz token kaydi, saglayici-agnostik push gonderimi
ve kullanicinin yerel saatine gore calisan zamanlanmis bildirim job'lari.

Kurallar ve nuanslar icin `notifications-rule.md`.

## Mimari Ozeti

```
domain/
  DeviceToken.ts        — DevicePlatform + DeviceToken tipi
  localWallClock.ts     — instant + IANA tz -> {hour, minute, weekday, dateKey, isoWeekKey}
  matchReminderSlot.ts  — "HH:MM" hedefi 15 dk'lik yarim-acik slota giriyor mu
  NotificationCopy.ts   — en/tr lokalize {title, body} builder'lari

ports/
  DeviceTokenRepositoryPort   — upsertByToken / deleteByToken / listByUserId / listPage
  PushSenderPort              — send(PushMessage) -> sent | invalid_token | error
  NotificationPreferencesPort — me modulune kopru (read-only)
  DayCompletionPort           — daily-tracking'e kopru (streak saver)
  WeeklySummaryPort           — daily-tracking + body-analytics'e kopru (weekly report)

adapters/
  repository/PrismaDeviceTokenRepository
  push/FcmPushAdapter            — FCM HTTP v1 (google-auth-library + fetch)
  push/ApnsPushAdapter           — APNs HTTP/2 (node:http2 + jsonwebtoken ES256)
  push/PlatformRoutingPushSender — platform'a gore FCM/APNs secer
  preferences/MeNotificationPreferencesAdapter
  tracking/DailyTrackingCompletionAdapter
  summary/WeeklySummaryAdapter

use-cases/
  RegisterDeviceToken     — POST /notifications/device-token
  UnregisterDeviceToken   — DELETE /notifications/device-token
  SendPushToUser          — (internal) kullanicinin tum cihazlarina gonderir, olu token'lari budar

jobs/
  notificationScheduler   — 'notifications-scheduled' queue + worker + registerNotificationSchedules()
  MealReminderScheduler   — export class MealReminderJob   (her 15 dk)
  StreakSaverAlertJob     — export class StreakSaverAlertJob (her 30 dk)
  WeeklyReportJob         — export class WeeklyReportJob     (saat basi)
  SendGuard               — RedisSendGuard (SET NX EX) + MemoizingSendGuard
  deviceIteration         — paginateDevices() + PreferenceCache
```

## Endpointler

Ikisi de `authMiddleware` arkasinda; `userId` = `req.auth.userId`.

### `POST /notifications/device-token`

```jsonc
// request
{
  "token": "fcm-or-apns-token",
  "platform": "ios" | "android",
  "timezone": "Europe/Istanbul",   // IANA — dogrulanir
  "locale": "en" | "tr"            // opsiyonel; yoksa Accept-Language
}
// response 200
{ "id": "<device token row id>" }
```

Ayni `token` ile tekrar cagirmak satiri gunceller (owner/tz/locale tazelenir),
yeni satir acmaz.

### `DELETE /notifications/device-token`

```jsonc
{ "token": "fcm-or-apns-token" }   // -> 204, idempotent
```

Cikis (logout) veya cihazda bildirimler kapatildiginda cagrilir.

## Zamanlanmis Job'lar

`NOTIFICATIONS_ENABLED=true` degilse hicbiri kaydedilmez (`main.ts` acilista
`registerNotificationSchedules()` cagirir). Uc job da tum cihaz token'larini
sayfalar ve **her cihazin kendi saat dilimine** gore filtreler.

| Job | Cron | Kosul | Guard anahtari |
|---|---|---|---|
| `meal-reminders` | `*/15 * * * *` | `masterEnabled` + ilgili ogun acik + yerel saat `HH:MM` slotuna girdi | `meal:<userId>:<dateKey>:<meal>` |
| `streak-saver` | `*/30 * * * *` | `streakSaver` acik + yerel saat `STREAK_SAVER_LOCAL_HOUR` + gun tamamlanmadi + `currentStreak >= 1` | `streak:<userId>:<dateKey>` |
| `weekly-report` | `0 * * * *` | `weeklyReport` acik + yerel gun `WEEKLY_REPORT_WEEKDAY` + yerel saat `WEEKLY_REPORT_LOCAL_HOUR` | `weekly:<userId>:<isoWeekKey>` |

Gonderim `SendPushToUser` uzerinden — kullanicinin TUM cihazlarina gider,
saglayicinin `invalid_token` dedigi satirlar silinir.

## Sequence — device token kayit

```mermaid
sequenceDiagram
    actor Client
    participant Ctl as NotificationsController
    participant UC as RegisterDeviceToken
    participant Repo as PrismaDeviceTokenRepository

    Client->>Ctl: POST /notifications/device-token {token, platform, timezone}
    Ctl->>UC: execute(userId, ...)
    UC->>UC: validate platform + IANA tz
    UC->>Repo: upsertByToken (where token)
    Repo-->>UC: DeviceToken
    UC-->>Ctl: { id }
    Ctl-->>Client: 200
```

## Sequence — zamanlanmis job

```mermaid
sequenceDiagram
    participant Cron as BullMQ repeatable
    participant Worker as notificationScheduled worker
    participant Job as MealReminder/StreakSaver/WeeklyReport
    participant Repo as DeviceTokenRepository
    participant Pref as NotificationPreferencesPort
    participant Guard as SendGuard (Redis)
    participant Send as SendPushToUser
    participant Push as PlatformRoutingPushSender

    Cron->>Worker: fire (fresh traceId)
    Worker->>Job: execute(now)
    loop her cihaz token sayfasi
        Job->>Repo: listPage(cursor)
        Job->>Job: resolveLocalWallClock(now, device.timezone)
        Job->>Pref: get(userId)  (run icinde cache'li)
        Job->>Guard: claim(key, ttl)
        alt claim == true
            Job->>Send: execute(userId, title, body)
            Send->>Push: send(message)  (platform'a gore FCM/APNs)
            Push-->>Send: sent | invalid_token | error
            Send->>Repo: deleteByToken (invalid_token ise)
        end
    end
```

## Env

`shared/config/env.ts` — hepsi opsiyonel, kimlik env'leri `NOTIFICATIONS_ENABLED`
iken zorunlu:

```
NOTIFICATIONS_ENABLED=false
FCM_SERVICE_ACCOUNT_JSON=      FCM_PROJECT_ID=            (JSON'daki project_id'ye duser)
APNS_KEY_ID=  APNS_TEAM_ID=  APNS_AUTH_KEY=(.p8 PEM)  APNS_BUNDLE_ID=  APNS_ENVIRONMENT=sandbox
STREAK_SAVER_LOCAL_HOUR=21     WEEKLY_REPORT_WEEKDAY=1 (0=Paz..6=Cmt)   WEEKLY_REPORT_LOCAL_HOUR=9
```

## Bilinen eksikler / sonraki adimlar

- `recognizePhotoJob`'daki "push notification code emitted" TODO'su hala
  `SendPushToUser`'a baglanmadi (foto tanima hatasi push'u).
- `waterReminders` tercihi var ama job'u yok.
- Push basina metrik sayaci (`prom-client`) eklenmedi.
