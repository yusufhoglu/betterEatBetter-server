# Notifications Modulu Developer Doc

Bu modul su anda tam uygulanmamis durumda. Buna ragmen hedeflenen mimari acik: cihaz token kaydi, kullanici tercihleriyle senkron push gonderimi ve zamanlanmis bildirim job'lari.

## Mimari Ozeti

- `http/notificationsRoutes.ts` su anda bos; public endpoint yok.
- `use-cases/RegisterDeviceToken.ts` cihaz token kaydinin uygulama servisi olacak.
- `ports/DeviceTokenRepositoryPort.ts` token kaliciligini, `PushSenderPort.ts` ise FCM/APNS gonderimini soyutlar.
- `adapters/repository/PrismaDeviceTokenRepository.ts`, `adapters/push/FcmPushAdapter.ts`, `ApnsPushAdapter.ts` kalicilik ve provider implementasyonlarini saglar.
- `jobs/` altinda meal reminder, streak saver ve weekly report background akislari icin placeholder dosyalar var.

## Endpointler

Su an router'a mount edilmis aktif bir endpoint yok. `notificationsRoutes()` bos donuyor.

## Sequence Diagramlari

### Mevcut durum

```mermaid
sequenceDiagram
    actor Client
    participant Router as notificationsRoutes

    Client->>Router: /notifications/*
    Router-->>Client: no mounted endpoint
```

### Hedeflenen device token kayit akisi

```mermaid
sequenceDiagram
    actor Client
    participant Controller as NotificationsController
    participant UseCase as RegisterDeviceToken
    participant Repo as DeviceTokenRepositoryPort

    Client->>Controller: device token + platform
    Controller->>UseCase: execute(userId, token)
    UseCase->>Repo: upsert device token
    UseCase-->>Controller: ok
    Controller-->>Client: 200/201
```

### Hedeflenen background job akislari

```mermaid
sequenceDiagram
    participant Scheduler as cronRunner/scheduledJobRegistry
    participant Job as Notification Job
    participant Source as tracking/analytics/preferences
    participant Push as PushSenderPort

    Scheduler->>Job: trigger
    Job->>Source: read eligible users/data
    Source-->>Job: recipients + content
    Job->>Push: send push payload
    Push-->>Job: provider response
```

## Gelistirme Rehberi

- Bu modulu implement ederken ilk adim device token registration endpoint'ini bitirmek olmali; job'lar ondan sonra anlamli hale gelir.
- Push provider kodunu use-case veya job icine gommek yerine `PushSenderPort` arkasinda tutun. Ayni mesaj hem FCM hem APNS'e gidebilmeli.
- Notification tercihleri `me` modulunde tutuluyor. Job'lar bu tercihleri okuyup filtrelemeli; kendi preference kopyalarini olusturmayin.
- Streak saver ve weekly report gibi job'lar veri okumak icin `daily-tracking` ve `body-analytics` public use-case veya adaptorlerine gitmeli; repository kopyalamayin.

## Ornek Best Practice

Dogru:

```ts
await deviceTokenRepository.upsert({ userId, platform, token });
await pushSender.send({ tokens, title, body, data });
```

Yanlis: her job icinde APNS ve FCM request formatini elle kurup tekrar tekrar yazmak.
