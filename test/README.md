# Test Guide

## HTTP Smoke Tests

Tum HTTP smoke testleri tek su komutla calisir:

```powershell
npm run test:http:local
```

Bu komut:

- `.env` dosyasini okur
- `SMOKE_TEST_DATABASE_URL` varsa onu kullanir
- yoksa `DATABASE_URL` degerinden otomatik olarak `_smoke` suffix'li bir veritabani URL'i turetir
- `test/http/all-endpoints.smoke.test.ts` dosyasini calistirir

Ornek:

- `DATABASE_URL=postgresql://app:app@localhost:5432/food_tracking`
- otomatik smoke DB: `postgresql://app:app@localhost:5432/food_tracking_smoke`

## Smoke DB Olusturma

Smoke test veritabani tek su komutla olusturulur:

```powershell
npm run db:create:smoke
```

Bu komut:

- varsayilan olarak Docker icindeki `food-tracking-postgres` container'ina baglanir
- smoke test veritabanini olusturur
- veritabani icin `vector` extension'ini acar

Container adi farkliysa override edebilirsin:

```powershell
$env:SMOKE_TEST_POSTGRES_CONTAINER="your-postgres-container"
npm run db:create:smoke
```

## Onerilen Local Akis

```powershell
docker compose up -d
npm run db:create:smoke
npm run test:http:local
```

## Guvenlik Notu

HTTP smoke suite gercek veritabanina baglanir ve testler arasinda tablolari temizler. Bu yuzden:

- shared bir veritabani uzerinde calistirma
- production benzeri veride calistirma
- ayri bir smoke/dev veritabani kullan

## Manuel Override

Istersen smoke testler icin veritabanini acikca set edebilirsin:

```powershell
$env:SMOKE_TEST_DATABASE_URL="postgresql://app:app@localhost:5432/food_tracking_smoke"
npm run test:http:local
```
