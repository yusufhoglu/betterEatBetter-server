# Mobile Error Handling Guide

Bu dokumanin amaci, mobil ekip ile backend arasinda hata davranisini netlestirmektir.
Hedef:

- backend hata nedenlerini deterministik ve parse edilebilir sekilde donsun
- mobil taraf bu hatalari UX'e dogru map edebilsin
- kullaniciya "bir seyler ters gitti" yerine neyin yanlis oldugu daha net aktarilabilsin
- hata ayiklama sirasinda backend ve mobil ayni `traceId` uzerinden konusabilsin

## Genel Prensip

Backend modulleri rastgele `throw new Error(...)` kullanmaz. Beklenen is kurali / validation / auth / conflict hatalari ortak bir error taxonomysi uzerinden doner:

- `ValidationError` -> `400`
- `UnauthorizedError` -> `401`
- `NotFoundError` -> `404`
- `ConflictError` -> `409`
- `RateLimitError` -> `429`
- taninmayan / beklenmeyen hata -> `500`

HTTP mapping merkezi olarak [src/shared/errors/errorMapper.ts](/abs/path/C:/Users/hocao/Desktop/eatBetter/backend/src/shared/errors/errorMapper.ts:1) icinde yapilir.

## Standard Error Response Shape

Backend'in istemciye dondugu hata body'si standarttir:

```json
{
  "error": {
    "code": "INVALID_REQUEST_BODY",
    "message": "Invalid email"
  },
  "code": "INVALID_REQUEST_BODY",
  "message": "Invalid email"
}
```

Notlar:

- `error.code` ve ust seviyedeki `code` ayni degeri tasir
- `error.message` ve ust seviyedeki `message` ayni degeri tasir
- mobil taraf backward-compatibility icin ister nested `error.code`, ister top-level `code` okuyabilir
- `500` durumunda da shape ayni kalir

## Trace ID

Her request icin backend bir `x-trace-id` header'i uretir veya istemciden geleni aynen kullanir:

- request header: `x-trace-id`
- response header: `x-trace-id`

Implementasyon: [src/shared/observability/tracingMiddleware.ts](/abs/path/C:/Users/hocao/Desktop/eatBetter/backend/src/shared/observability/tracingMiddleware.ts:1)

Mobil onerisi:

- her request'e kendi `x-trace-id` degerini koy
- hata ekranlarinda ve internal debug loglarda bu degeri sakla
- backend loglariyla birebir eslestirmek icin support/debug ekranina trace id ekle

## Auth ve Validation Akisi

Auth endpoint'lerinde body parsing / validation ilk olarak controller seviyesinde yapilir:

- [src/modules/identity/http/IdentityController.ts](/abs/path/C:/Users/hocao/Desktop/eatBetter/backend/src/modules/identity/http/IdentityController.ts:1)

Protected endpoint'lerde access token kontrolu ortak middleware ile yapilir:

- [src/shared/auth/authMiddleware.ts](/abs/path/C:/Users/hocao/Desktop/eatBetter/backend/src/shared/auth/authMiddleware.ts:1)

Ornek auth endpoint'leri:

- `POST /auth/sign-up`
- `POST /auth/sign-in`
- `POST /auth/refresh`
- `POST /auth/logout`

## Hata Siniflari ve Mobil Anlami

### 400 Bad Request

Anlam:

- request body'si beklenen shape'te degil
- alan tipi yanlis
- zorunlu alan eksik
- business validation kurali saglanmiyor

Ornek kodlar:

- `INVALID_REQUEST_BODY`
- `PASSWORD_TOO_WEAK`

Ornek response:

```json
{
  "error": {
    "code": "INVALID_REQUEST_BODY",
    "message": "Invalid email"
  },
  "code": "INVALID_REQUEST_BODY",
  "message": "Invalid email"
}
```

Mobil UX onerisi:

- field-level hata varsa form alanina bagla
- email/password ekraninda `message` degerini gosterebilirsin
- teknik fallback: "Girdiler gecersiz, lutfen kontrol edin"

### 401 Unauthorized

Anlam:

- login credentials yanlis
- access token eksik
- access token gecersiz / expired
- refresh token gecersiz

Ornek kodlar:

- `INVALID_CREDENTIALS`
- `MISSING_ACCESS_TOKEN`

Ornek response:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "email veya sifre hatali"
  },
  "code": "INVALID_CREDENTIALS",
  "message": "email veya sifre hatali"
}
```

Mobil UX onerisi:

- `INVALID_CREDENTIALS` ise kullaniciya tekrar giris denet
- token bazli bir endpoint'te `401` alinirsa sessiz refresh dene
- refresh de `401` ise session'i kapatip login ekranina don

### 404 Not Found

Anlam:

- istenen kaynak yok
- ilgili entity daha once silinmis olabilir

Mobil UX onerisi:

- liste/detail ekranlarinda stale veri durumunu yonet
- "Icerik bulunamadi" veya listeyi yenileme aksiyonu sun

### 409 Conflict

Anlam:

- request teknik olarak dogru ama mevcut state ile celisiyor

Ornek kodlar:

- `EMAIL_ALREADY_REGISTERED`
- `ALREADY_ONBOARDED`

Ornek response:

```json
{
  "error": {
    "code": "EMAIL_ALREADY_REGISTERED",
    "message": "This email is already registered"
  },
  "code": "EMAIL_ALREADY_REGISTERED",
  "message": "This email is already registered"
}
```

Mobil UX onerisi:

- kullaniciya farkli aksiyon sun
- ornek: "Bu email zaten kayitli, giris yapmayi deneyin"

### 429 Too Many Requests

Anlam:

- oran limiti asildi

Ek header:

- `Retry-After: <seconds>`

Implementasyon: [src/shared/errors/errorMapper.ts](/abs/path/C:/Users/hocao/Desktop/eatBetter/backend/src/shared/errors/errorMapper.ts:1)

Mobil UX onerisi:

- kalan sureyi countdown olarak gosterebilirsin
- tekrar deneme butonunu gecici disable et
- otomatik retry varsa agresif olmamali

### 500 Internal Server Error

Anlam:

- beklenmeyen runtime / DB / entegrasyon hatasi
- guvenlik sebebiyle detay istemciye sizdirilmaz

Response:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Something went wrong"
  },
  "code": "INTERNAL_ERROR",
  "message": "Something went wrong"
}
```

Mobil UX onerisi:

- teknik stack trace kullaniciya gosterilmemeli
- fallback mesaj: "Su anda islemi tamamlayamiyoruz. Lutfen tekrar deneyin."
- `x-trace-id` kaydedilmeli

## Login / Session Ozelinde Beklenen Hatalar

### `POST /auth/sign-in`

Beklenen basarisiz durumlar:

- `400 INVALID_REQUEST_BODY`
  - email gecersiz formatta
  - password eksik
- `401 INVALID_CREDENTIALS`
  - email yok
  - password yanlis
- `429 ...`
  - rate limit
- `500 INTERNAL_ERROR`
  - DB/runtime problemi

Mobil davranisi:

- `400`: form alanlarini duzelt
- `401`: email/sifre hatali mesaji
- `429`: bekleme suresi goster
- `500`: retry + genel hata mesaji

### `POST /auth/sign-up`

Beklenen basarisiz durumlar:

- `400 INVALID_REQUEST_BODY`
- `400 PASSWORD_TOO_WEAK`
- `409 EMAIL_ALREADY_REGISTERED`
- `500 INTERNAL_ERROR`

Mobil davranisi:

- `PASSWORD_TOO_WEAK`: password alanina inline hata
- `EMAIL_ALREADY_REGISTERED`: "Giris yap" CTA'si sun

### Protected endpoint'ler

Beklenen auth hatalari:

- `401 MISSING_ACCESS_TOKEN`
- `401` invalid/expired JWT

Mobil davranisi:

1. access token ile istegi dene
2. `401` alirsan refresh dene
3. refresh basarisizsa session'i sifirla
4. login ekranina yonlendir

## Backend Log Davranisi

Request ve hata gorunurlugu artik daha nettir:

- request geldi mi
- hangi path'e geldi
- body'de hangi key'ler vardi
- controller request'i aldi mi
- hata `DomainError` mu, beklenmeyen hata mi
- response hangi status ile, kac ms'de dondu

Ilgili dosyalar:

- [src/shared/observability/requestLoggingMiddleware.ts](/abs/path/C:/Users/hocao/Desktop/eatBetter/backend/src/shared/observability/requestLoggingMiddleware.ts:1)
- [src/modules/identity/http/IdentityController.ts](/abs/path/C:/Users/hocao/Desktop/eatBetter/backend/src/modules/identity/http/IdentityController.ts:1)
- [src/shared/errors/errorMapper.ts](/abs/path/C:/Users/hocao/Desktop/eatBetter/backend/src/shared/errors/errorMapper.ts:1)

Beklenen log akisi ornegi:

```text
request received { method: "POST", path: "/auth/sign-in", bodyKeys: ["email", "password"] }
sign-in request received
domain error mapped to http response { code: "INVALID_CREDENTIALS", httpStatus: 401 }
request completed { statusCode: 401, durationMs: 42 }
```

## Mobile Icin Uygulama Rehberi

### 1. Response parser

Mobil taraf su alanlari okumali:

- `status`
- `body.code`
- `body.message`
- `body.error.code`
- `body.error.message`
- response header `x-trace-id`
- response header `Retry-After` (varsa)

### 2. Error normalization

Mobilde ortak bir hata objesi uret:

```ts
type ApiError = {
  httpStatus: number;
  code: string;
  message: string;
  traceId?: string;
  retryAfterSeconds?: number;
};
```

### 3. UX mapping

Basit bir map tablosu:

- `INVALID_REQUEST_BODY` -> form validation mesaji
- `PASSWORD_TOO_WEAK` -> password guclendirme mesaji
- `INVALID_CREDENTIALS` -> email/sifre hatali
- `MISSING_ACCESS_TOKEN` -> session yenile / login'e don
- `EMAIL_ALREADY_REGISTERED` -> login oner
- `ALREADY_ONBOARDED` -> onboarding'i tekrar baslatma, mevcut home/plan ekranina yonlen
- `INTERNAL_ERROR` -> genel retry mesaji

### 4. Fault tolerance

Mobil taraf:

- `5xx` hatalarda sinirli retry uygulayabilir
- `4xx` hatalarda otomatik retry yapmamali
- `401` icin sadece token yenileme senaryosu calistirmali
- `429` icin `Retry-After` bazli bekleme uygulamali

## Ornek Karar Agaci

`sign-in` icin:

1. `status === 200`
   - session'i kaydet
   - home/onboarding yonlendirmesini yap
2. `status === 400`
   - form hatasi goster
3. `status === 401`
   - "Email veya sifre hatali" goster
4. `status === 429`
   - "Cok fazla deneme yaptiniz, biraz bekleyin" goster
5. `status >= 500`
   - genel hata + trace id opsiyonel debug bilgisi

## Bu Dokumanin Siniri

Bu dokuman backend'in su anki gercek hata davranisini anlatir. Tum moduller canli smoke test ile tek tek dogrulanmis degildir; ancak error mapping altyapisi ortaktir ve yeni endpoint'ler de ayni pattern'i izlemelidir.
