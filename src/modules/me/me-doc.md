# Me Modulu Developer Doc

Bu modul mobil uygulamanin profil, goal, tercih ve kisisel katalog ekranlarini tek yerde toplar. Cekirdek mantigi kendisi uretmek yerine birden fazla modulu orkestre eder.

## Mimari Ozeti

- `http/MeController.ts` request validation, DTO mapping ve response composition yapar.
- Kimlik verisi `identity`, hedef ve profil verisi `onboarding-plan`, premium bilgisi `subscription` modulunden okunur.
- `ports/MeCatalogRepositoryPort.ts` ve `MePreferencesRepositoryPort.ts` sadece bu modulun sahip oldugu katalog/preference kaliciligini soyutlar.
- `adapters/repository/` altindaki Prisma repository'ler favorite recipes, my meals ve preference verilerini saklar.

## Endpointler

| Method | Path | Aciklama |
| --- | --- | --- |
| `GET` | `/profile` | Birlesik profil cevabi |
| `PATCH` | `/profile` | Profil alanlarini gunceller |
| `GET` | `/goal` | Birlesik hedef cevabi |
| `PATCH` | `/goal` | Hedefi gunceller |
| `POST` | `/goal/preview-calories` | Yeni hedef icin tahmini kalori preview |
| `GET` | `/notification-preferences` | Bildirim tercihleri |
| `PATCH` | `/notification-preferences` | Bildirim tercihlerini gunceller |
| `GET` | `/unit-preferences` | Unit tercihleri |
| `PATCH` | `/unit-preferences` | Unit tercihlerini gunceller |
| `GET` | `/favorite-recipes` | Favori tarif listesi |
| `POST` | `/favorite-recipes` | Favori tarif ekler |
| `DELETE` | `/favorite-recipes/:id` | Favori tarif siler |
| `GET` | `/my-meals` | Kullanicinin kaydettigi meal listesi |
| `POST` | `/my-meals` | Kisisel meal ekler |
| `PATCH` | `/my-meals/:id` | Kisisel meal gunceller |
| `DELETE` | `/my-meals/:id` | Kisisel meal siler |
| `GET` | `/subscription/plans` | Statik subscription plan katalogu |

## Sequence Diagramlari

### Profil ve goal endpointleri

```mermaid
sequenceDiagram
    actor Client
    participant Controller as MeController
    participant Identity as identity use-cases
    participant Onboarding as onboarding-plan use-cases
    participant Subscription as GetSubscriptionEntitlement

    alt GET /profile
        Client->>Controller: request
        Controller->>Identity: GetUserAccountProfile.execute
        Controller->>Onboarding: GetUserProfile.execute
        Controller->>Subscription: execute(userId)
        Controller-->>Client: 200 merged profile
    else PATCH /profile
        Client->>Controller: profile patch
        Controller->>Identity: UpdateUserAccountProfile.execute
        opt height/age update
            Controller->>Onboarding: UpdateProfileMeasurements.execute
        end
        opt weight update
            Controller->>Onboarding: UpdatePlan.execute
        end
        Controller-->>Client: 200 rebuilt profile
    else GET/PATCH /goal
        Client->>Controller: goal request
        Controller->>Onboarding: GetActivePlan / UpdatePlan
        Controller->>Onboarding: GetUserProfile
        Controller-->>Client: 200 merged goal payload
    else POST /goal/preview-calories
        Client->>Controller: preview patch
        Controller->>Onboarding: GetUserProfile
        Controller->>Controller: computePlan preview
        Controller-->>Client: 200 dailyCalories
    end
```

### Preferences ve katalog endpointleri

```mermaid
sequenceDiagram
    actor Client
    participant Controller as MeController
    participant PrefRepo as PrismaMePreferencesRepository
    participant CatalogRepo as PrismaMeCatalogRepository

    alt GET/PATCH /notification-preferences
        Client->>Controller: request
        Controller->>PrefRepo: get or upsert notification preferences
        PrefRepo-->>Controller: stored preferences
        Controller-->>Client: 200
    else GET/PATCH /unit-preferences
        Client->>Controller: request
        Controller->>PrefRepo: get or upsert unit preferences
        PrefRepo-->>Controller: stored preferences
        Controller-->>Client: 200
    else /favorite-recipes*
        Client->>Controller: list/create/delete request
        Controller->>CatalogRepo: list/create/delete favorite recipe
        CatalogRepo-->>Controller: result
        Controller-->>Client: 200/201/204
    else /my-meals*
        Client->>Controller: list/create/update/delete request
        Controller->>CatalogRepo: operate on my meals
        CatalogRepo-->>Controller: result
        Controller-->>Client: 200/201/204
    else GET /subscription/plans
        Client->>Controller: request
        Controller-->>Client: 200 static plan list
    end
```

## Gelistirme Rehberi

- `me` modulunu business source of truth'a cevirmeyin. Bu modulun gorevi birlesik mobile-facing response olusturmak.
- Profil/goal patch endpointlerinde alanlar farkli sahip modullere dagiliyor. Yeni alan eklerken once owner modulunu belirleyin, sonra `MeController` sadece orkestrasyon yapsin.
- Preferences ve user catalog verileri bu modulun kendi sahipligi altinda; yeni preference turleri ekliyorsaniz `MePreferencesRepositoryPort` uzerinden ilerleyin.

## Ornek Best Practice

Dogru:

```ts
const [account, profile, isPremium] = await Promise.all([
  getUserAccountProfile.execute(userId),
  getUserProfile.execute(userId),
  getSubscriptionEntitlement.execute(userId),
]);
```

Yanlis: profil response'u olustururken farkli modullerin Prisma repository'lerini controller icinde dogrudan okuyup sahiplik sinirlarini bozmak.
