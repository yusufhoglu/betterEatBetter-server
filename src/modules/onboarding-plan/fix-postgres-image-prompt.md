# Claude Code Prompt — Postgres Testcontainer Image Düzeltmesi (Repo Geneli)

Bu, tek bir modüle özgü değil, şema seviyesinde bir sorunu düzeltme turu. `identity`
modülüne test eklerken şu bulundu: `schema.prisma`'nın migration'ı
`CREATE EXTENSION IF NOT EXISTS "vector"` (pgvector) içeriyor, ama bazı integration
testler düz `postgres:16-alpine` image'ı kullanıyor — bu image'da pgvector extension'ı
yok, `migrate deploy` adımı bu testlerde patlıyor (henüz Docker'lı bir ortamda
çalıştırılıp doğrulanmadı ama kod incelemesiyle kesin).

---

## PROMPT

```
Repoda schema.prisma'nın migration'ı "CREATE EXTENSION IF NOT EXISTS vector" (pgvector)
içeriyor. Bu, HERHANGİ bir integration testin PostgreSqlContainer kullanırken
pgvector extension'ı OLAN bir image kullanması gerektiği anlamına geliyor — düz
"postgres:16-alpine" ile migration adımı patlar.

Görev:
1. Repo genelinde (src/modules/**/*.integration.test.ts, src/shared/**/*.integration.test.ts,
   test/e2e/**/*.ts dahil HER YER) "PostgreSqlContainer(" çağrılarını ara.
2. Her birinde image argümanı "postgres:16-alpine" (ya da pgvector içermeyen başka bir
   düz Postgres image'ı) ise, "pgvector/pgvector:pg16" ile DEĞİŞTİR. Zaten
   "pgvector/pgvector:pg16" kullananlara DOKUNMA.
3. Redis testcontainer'larına (RedisContainer) bu değişiklik UYGULANMAZ, sadece Postgres.
4. Değişiklik yaptığın her dosyayı, Docker mevcutsa çalıştırıp gerçekten geçtiğini
   doğrula. Docker yoksa (bu ortamda muhtemelen yok), en azından typecheck'in temiz
   kaldığını doğrula ve bunu raporda açıkça belirt.
5. schema.prisma'nın KENDİSİNE veya migration dosyalarına DOKUNMA — sadece test
   dosyalarındaki container image referansları değişiyor.
6. Bulduğun TÜM dosyaları (kaç tane, hangi modüllerde) raporda listele — bu sadece
   food-recognition'ı değil, taradığın her yeri kapsamalı.

Bu değişiklik SADECE image string'lerini hedefliyor, hiçbir test mantığını, hiçbir iş
mantığı kodunu DEĞİŞTİRME.
```

---

## Tamamlama Raporu (Claude Code işin sonunda bunu doldurmalı)

### 1. Ne yapıldı

Repo genelinde (`src/modules/**/*.integration.test.ts`, `src/shared/**/*.integration.test.ts`,
`test/e2e/**/*.ts`) `PostgreSqlContainer(` çağrıları tarandı. Toplam **4 dosyada**
`PostgreSqlContainer(` kullanımı bulundu:

| Dosya | Önceki image | Durum |
|---|---|---|
| `test/e2e/signup-signin-refresh-flow.e2e.test.ts` | `pgvector/pgvector:pg16` | zaten doğru, dokunulmadı |
| `src/modules/identity/adapters/repository/PrismaRefreshTokenRepository.integration.test.ts` | `pgvector/pgvector:pg16` | zaten doğru, dokunulmadı |
| `src/modules/identity/adapters/repository/PrismaUserRepository.integration.test.ts` | `pgvector/pgvector:pg16` | zaten doğru, dokunulmadı |
| `src/modules/food-recognition/adapters/repository/PrismaFoodEntryRepository.integration.test.ts` | `postgres:16-alpine` | **düzeltildi** → `pgvector/pgvector:pg16` |

Yalnızca 1 dosyada gerçek değişiklik gerekti: `PrismaFoodEntryRepository.integration.test.ts`
satır 12, `new PostgreSqlContainer('postgres:16-alpine')` → `new PostgreSqlContainer('pgvector/pgvector:pg16')`.

`RedisContainer(` kullanan dosyalara (identity/food-recognition altındaki Redis
integration testleri) göre bu tur kapsam dışı bırakıldığı için dokunulmadı.

### 2. Rule dosyasındaki hangi kurallara karşılık geldiği

`shared-rule.md` → Persistence bölümü, "KRİTİK — Postgres testcontainer image'ı" kuralı:
`schema.prisma`'nın `CREATE EXTENSION IF NOT EXISTS "vector"` migration adımı nedeniyle
TÜM Postgres testcontainer'larının `pgvector/pgvector:pg16` kullanması gerektiği kuralı.

### 3. Karşılaşılan/düzeltilen sorunlar

Beklenenden farklı bir durum yok — taramada bulunan tek sapma zaten prompttaki
food-recognition örneğiyle birebir eşleşti (`postgres:16-alpine`). Diğer 3 dosya zaten
doğru image'ı kullanıyordu, başka bir sorunları yoktu.

### 4. Test sonuçları

Bu ortamda Docker **mevcut değil** (`docker info` başarısız oldu) — integration testleri
gerçek bir container ile çalıştırılamadı. Bunun yerine:

- `npx tsc --noEmit`: ✅ temiz (proje genelinde hata yok).

Docker'lı bir ortamda doğrulanmadı — sadece image string'i değiştiği ve test mantığına
dokunulmadığı için (`PrismaFoodEntryRepository.integration.test.ts`'in geri kalanı, zaten
`food-recognition-fixes.md`'de belgelenen migration düzeltmesiyle daha önce doğrulanmıştı),
davranış riski düşük kabul edildi.

### 5. Rule/Prompt'tan bilinçli sapma var mı

Yok. Prompt'un istediği gibi sadece image string'i değişti, hiçbir test mantığı veya iş
mantığı koduna dokunulmadı; `schema.prisma`/migration dosyaları değiştirilmedi.
