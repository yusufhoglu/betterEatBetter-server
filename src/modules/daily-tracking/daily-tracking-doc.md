# Daily Tracking Modulu Developer Doc

Bu modul nutrition log verisini yorumlayarak gunluk durum ve haftalik ilerleme sunar. Kendi tablosu yoktur; salt okunur bir turetilmis gorunum olarak calisir.

## Mimari Ozeti

- `http/DailyTrackingController.ts` iki read endpoint'ini sunar.
- `use-cases/GetTodayStatus.ts` ve `GetWeekProgress.ts` sonuc objelerini uretir.
- `ports/DayLogsPort.ts` hangi gunlerde hangi meal type'larin loglandigini soyutlar.
- `adapters/dayLogs/NutritionLoggingDayLogsAdapter.ts` `nutrition-logging/GetLoggedMealTypesForDateRange` use-case'ine kopru olur.
- `domain/DefineDayCompletion.ts` ve `ComputeStreak.ts` urun kuralini ve saf algoritmayi ayri tutar.

## Endpointler

| Method | Path | Aciklama |
| --- | --- | --- |
| `GET` | `/tracking/today-status` | Bugunun tamamlanma durumu ve streak bilgisini doner |
| `GET` | `/tracking/week-progress` | Haftalik gun tamamlama haritasini doner |

## Sequence Diagramlari

### `GET /tracking/today-status`

```mermaid
sequenceDiagram
    actor Client
    participant Controller as DailyTrackingController
    participant UseCase as GetTodayStatus
    participant Port as DayLogsPort
    participant Adapter as NutritionLoggingDayLogsAdapter
    participant Source as nutrition-logging/GetLoggedMealTypesForDateRange

    Client->>Controller: today status request
    Controller->>UseCase: execute(userId)
    UseCase->>Port: get logs for streak window
    Port->>Adapter: delegate
    Adapter->>Source: execute(userId, dateRange)
    Source-->>Adapter: logged meal types
    Adapter-->>UseCase: day logs
    UseCase->>UseCase: DefineDayCompletion + ComputeStreak
    UseCase-->>Controller: today status
    Controller-->>Client: 200 status
```

### `GET /tracking/week-progress`

```mermaid
sequenceDiagram
    actor Client
    participant Controller as DailyTrackingController
    participant UseCase as GetWeekProgress
    participant Port as DayLogsPort
    participant Source as nutrition-logging/GetLoggedMealTypesForDateRange

    Client->>Controller: week progress request
    Controller->>UseCase: execute(userId)
    UseCase->>Port: get logs for 7-day range
    Port->>Source: single range query
    Source-->>Port: aggregated meal-type map
    Port-->>UseCase: day logs
    UseCase->>UseCase: DefineDayCompletion per day
    UseCase-->>Controller: week progress
    Controller-->>Client: 200 progress
```

## Gelistirme Rehberi

- Yeni bir streak veya completion kurali ekleyecekseniz `DefineDayCompletion` icinde urun kararini, `ComputeStreak` icinde algoritmayi ayri tutun.
- Bu modula tablo eklemeyin; once ayni sonuc mevcut meal log verisinden turetilebiliyor mu bakin.
- Performans degisikliginde hedefiniz range-based query olmali. Gun gun N sorgu atan implementasyonlardan kacin.

## Ornek Best Practice

Dogru:

```ts
const logs = await dayLogsPort.getLoggedMealTypes(userId, from, to);
return ComputeStreak(logs.map(DefineDayCompletion));
```

Yanlis: her gun icin ayri repository sorgusu atmak veya completion sonucunu DB'de materialize etmek.
