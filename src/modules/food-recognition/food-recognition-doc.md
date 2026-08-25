# Food Recognition Modulu Developer Doc

Bu modul fotograf, barcode, text ve katalog arama akislariyla yiyecek tanima saglar. Senkron ve asenkron akislarin birlikte bulundugu, en fazla dis entegrasyon tasiyan moduldur.

## Mimari Ozeti

- `http/FoodRecognitionController.ts` ve `MediaUploadController.ts` public HTTP yuzeyini saglar.
- `use-cases/` tanima akislari ve upload hazirligi icin uygulama servislerini barindirir.
- `ports/` barkod lookup, text/photo estimator, barcode cache ve repository sozlesmelerini tanimlar.
- `adapters/photo/`, `adapters/barcode/`, `adapters/text/`, `adapters/search/`, `adapters/repository/` dis kaynaklari ve DB'yi soyutlar.
- `jobs/recognizePhotoJob.ts` ve `jobs/standardizeAndCopyJob.ts` foto akisinin worker tarafini tasir.

## Endpointler

| Method | Path | Aciklama |
| --- | --- | --- |
| `POST` | `/media/upload` | Photo upload icin presigned URL uretir |
| `POST` | `/food/photo` | Asenkron foto recognition istegi baslatir |
| `GET` | `/food/photo/:mealPhotoId` | Foto recognition durumunu sorgular |
| `POST` | `/food/barcode` | Barcode'dan tanima yapar |
| `POST` | `/food/text` | Text'ten nutrition estimate uretir |
| `GET` | `/food/search` | Lokal katalogda arama yapar |

## Sequence Diagramlari

### `POST /media/upload`

```mermaid
sequenceDiagram
    actor Client
    participant Controller as MediaUploadController
    participant UseCase as CreatePhotoUpload
    participant Storage as objectStorageClient

    Client->>Controller: upload intent
    Controller->>UseCase: execute()
    UseCase->>Storage: create presigned upload URL
    Storage-->>UseCase: upload URL + object key
    UseCase-->>Controller: upload payload
    Controller-->>Client: 200 upload target
```

### Foto recognition akisi

```mermaid
sequenceDiagram
    actor Client
    participant Controller as FoodRecognitionController
    participant UseCase as RecognizeFromPhoto
    participant Repo as PrismaFoodEntryRepository
    participant Queue as photo jobs
    participant Worker as recognizePhotoJob
    participant Estimator as ResilientPhotoEstimator

    alt POST /food/photo
        Client->>Controller: uploaded photo reference
        Controller->>UseCase: execute(userId, photoRef)
        UseCase->>Repo: create pending food entry
        UseCase->>Queue: enqueue standardize/recognize jobs
        UseCase-->>Controller: pending mealPhotoId
        Controller-->>Client: 202 pending
    else Worker path
        Worker->>Estimator: estimate from standardized photo
        Estimator-->>Worker: recognition result
        Worker->>Repo: update food entry status/result
    else GET /food/photo/:mealPhotoId
        Client->>Controller: status request
        Controller->>Repo: find food entry by id
        Repo-->>Controller: pending or completed result
        Controller-->>Client: 200 status/result
    end
```

### Senkron tanima endpointleri

```mermaid
sequenceDiagram
    actor Client
    participant Controller as FoodRecognitionController
    participant Barcode as RecognizeFromBarcode
    participant Text as RecognizeFromText
    participant Search as SearchFoodCatalog
    participant Cache as RedisBarcodeCache
    participant Provider as OpenFoodFactsAdapter / LlmTextEstimator / CatalogSearchAdapter

    alt POST /food/barcode
        Client->>Controller: barcode
        Controller->>Barcode: execute(barcode)
        Barcode->>Cache: get(barcode)
        opt cache miss
            Barcode->>Provider: lookup barcode
            Provider-->>Barcode: food result
            Barcode->>Cache: set result or negative cache
        end
        Barcode-->>Controller: recognition payload
        Controller-->>Client: 200
    else POST /food/text
        Client->>Controller: free text
        Controller->>Text: execute(text)
        Text->>Provider: estimate nutrition from text
        Provider-->>Text: structured estimate
        Text-->>Controller: recognition payload
        Controller-->>Client: 200
    else GET /food/search
        Client->>Controller: query
        Controller->>Search: execute(query)
        Search->>Provider: local catalog search
        Provider-->>Search: search hits
        Search-->>Controller: search result
        Controller-->>Client: 200
    end
```

## Gelistirme Rehberi

- Yeni tanima kaynagi eklerken once port acin, sonra adapter yazin. Use-case icine provider SDK veya HTTP client kodu gommekten kacinin.
- Barcode/text/search senkron akislarinda gereksiz DB persist etmeyin; photo akisi disinda repository sadece asenkron state icin kullaniliyor.
- Photo pipeline'da worker idempotency ve status gecisleri korunmali. Yeni job eklerken `pending -> processing -> completed/failed` semantigini bozmamaya dikkat edin.

## Ornek Best Practice

Dogru:

```ts
const photoEstimator = new ResilientPhotoEstimator(new RagHttpEstimator());
```

Yanlis: `RecognizeFromText` icinde dogrudan OpenAI client yaratmak veya barcode sonucunu her istekte DB'ye yazmak.
