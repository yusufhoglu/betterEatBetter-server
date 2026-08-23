# Identity Modülü — Rule

Bu dosya `src/modules/identity/` altında kod yazarken uyulması gereken kuralları listeler.
Referans: `backend-architecture.md` §8.1, `shared-rule.md` (auth bölümü).

---

## Kapsam — bu turda ne yapılıyor, ne yapılmıyor

- **Tam iskelet kurulur**: tüm domain/use-cases/ports/adapters/http klasörleri, refresh
  rotation + reuse detection dahil, PRODUCTION-KALİTESİNDE.
- **Sadece TEK provider implementasyonu yazılır**: email + şifre. Apple/Google adapter'ları
  bu turda YAZILMAZ — ama `IdentityProviderPort` arayüzü, ileride bu adapter'ların eklenmesini
  hiçbir mevcut kodu değiştirmeden mümkün kılacak şekilde tasarlanmalı (provider-agnostic).
- Şifre sıfırlama (forgot password) akışı bu turda kapsam DIŞI — ileride ayrı bir use-case
  olarak eklenecek, şimdiden yer açmaya gerek yok.

## Use-case ayrımı

- `SignUp` ve `SignIn` AYRI use-case'lerdir. "Upsert" (varsa giriş yap, yoksa oluştur)
  mantığı KULLANILMAZ — bu email+şifre için güvensiz (email/şifre kontrolünü belirsizleştirir).
- Apple/Google gibi provider'lar eklendiğinde, onlar için `SignInWithProvider` (provider
  zaten doğruladığı için "yoksa oluştur" mantığı orada güvenli) AYRI bir use-case olarak
  kalır — email+şifre akışıyla karıştırılmaz.

## Enumeration dengesi — bilinçli asimetri

- **`SignUp`**: email zaten kayıtlıysa NET bir hata dönülür — `ConflictError`,
  `code: 'EMAIL_ALREADY_REGISTERED'`. Bu bilgi saklanmaz (kullanıcı deneyimi gereği gerekli).
- **`SignIn`**: email bulunamadı VEYA şifre yanlış — HER İKİ DURUMDA DA aynı genel hata
  dönülür: `UnauthorizedError`, `code: 'INVALID_CREDENTIALS'`, mesaj: "email veya şifre
  hatalı". Hangisinin yanlış olduğu asla ayrıştırılmaz, ne response'ta ne logda kullanıcıya
  dönük tarafta.

## Şifre hashleme

- Algoritma: **argon2** (argon2id varyantı), bcrypt DEĞİL.
- Şifre minimum uzunluk kuralı: 8 karakter (`ValidationError` ile reddedilir, `SignUp`
  use-case'inde kontrol edilir, domain'de bir `validatePasswordStrength` pure fonksiyonu
  olarak tutulur).
- Şifre hash'i ASLA response'a, log'a, hiçbir yere plain ya da hash haliyle dönmez/yazılmaz
  (zaten `shared/observability/logger.ts`'teki redact listesi `password` alanını kapsıyor
  olmalı — burada ekstra kontrol: response DTO'ları hiçbir zaman `passwordHash` alanı
  içermemeli).

## Rate limiting

- Sadece **email bazlı**, IP bazlı DEĞİL (VPN/paylaşılan ağ yanlış pozitif riski nedeniyle
  bilinçli olarak çıkarıldı).
- Key formatı: `signin:${email}` — `shared/rateLimiting/rateLimiter.ts`'teki
  `checkRateLimit` kullanılır.
- Limit: 5 deneme / 5 dakika (300 saniye). Aşılırsa `RateLimitError` (429).
- Rate limit kontrolü `SignIn` use-case'inin EN BAŞINDA yapılır — şifre karşılaştırması bile
  yapılmadan önce (gereksiz argon2 hesaplaması israf edilmesin).

## Token stratejisi

- **Access token**: stateless JWT, imza doğrulama yeterli (DB'ye gitmez). Varsayılan süre:
  **15 dakika** (env'den override edilebilir: `ACCESS_TOKEN_TTL_SECONDS`).
- **Refresh token**: DB'de saklanır (`RefreshToken` tablosu). Varsayılan süre: **30 gün**
  (env'den override edilebilir: `REFRESH_TOKEN_TTL_DAYS`).
- Bu süre değerleri VARSAYIM olarak belirlendi, kesin karar verilmedi — ürün ihtiyacına göre
  kolayca değiştirilebilir olmalı (env üzerinden), koda sabit yazılmaz.

## Refresh Token Rotation + Reuse Detection — tam akış

```
RefreshSession(refreshToken) çağrıldığında:
  1. Gelen refreshToken DB'de aranır.
  2. Bulunamazsa → UnauthorizedError.
  3. Bulunur ama zaten "used"/"revoked" durumdaysa → REUSE TESPİT EDİLDİ:
     a. Bu token'ın ait olduğu userId'nin TÜM refresh token'ları "revoked" işaretlenir.
     b. UnauthorizedError döner (kullanıcı tüm cihazlarda yeniden login olmak zorunda kalır).
  4. Bulunur ve "active" durumdaysa:
     a. Bu token "used" olarak işaretlenir (silinmez, denetim izi için durum değişir).
     b. Yeni bir refreshToken + yeni bir accessToken üretilir.
     c. Yeni refreshToken "active" olarak DB'ye yazılır.
     d. İkisi de response'ta döner.
```

- `RefreshToken` tablosu en az şu alanları taşımalı: `id`, `userId`, `tokenHash` (token'ın
  kendisi değil, hash'i saklanır — DB sızıntısında token'ların direkt kullanılabilir
  olmaması için), `status` (`active` | `used` | `revoked`), `expiresAt`, `createdAt`.
- Refresh token'ın DB'de PLAIN saklanmaması önemli bir güvenlik detayı — sadece hash
  (SHA-256 yeterli, argon2'ye gerek yok çünkü brute-force hedefi değil, sadece sızıntı
  koruması) saklanır, gelen token'ın hash'i karşılaştırılır.

## Auth middleware ile ilişki

- `shared/auth/authMiddleware.ts` zaten JWT doğrulamayı yapıyor — bu modül onu tekrar
  yazmaz, sadece `IdentityController`'ın `/sign-up`, `/sign-in`, `/refresh` endpoint'leri
  bu middleware'in DIŞINDA kalır (henüz token yok, login akışının kendisi).
- `AuthContext`'e yazılan `userId`, bu modülün `UserRepositoryPort`'undaki `User.id` ile
  birebir eşleşmeli.

## Port sahipliği

- `IdentityProviderPort`, `UserRepositoryPort`, `SessionTokenPort` — üçü de bu modülün
  kendi ports/ klasöründe, çünkü bu modül onları kullanıyor (kural: kullanan tanımlar).
- `IdentityProviderPort` imzası, email+şifre VE gelecekteki Apple/Google için ORTAK
  kullanılabilir şekilde soyut tasarlanmalı — örneğin `verify(credentials): Promise<{
  externalId: string; email: string }>` gibi provider-agnostic bir dönüş tipi (email+şifre
  adapter'ı için `externalId` = kullanıcının kendi DB id'si olabilir, Apple/Google için
  provider'ın verdiği id).

---

## Test Stratejisi — ATLANMAYACAK

Test altyapısı standardı: **testcontainers** (`food-recognition` modülünde kanıtlanmış
pattern) — "zaten çalışan bir dev DB'ye bağlan" YAKLAŞIMI KULLANILMAZ. Her integration
test kendi izole Postgres container'ını ayağa kaldırır, hiçbir manuel ön koşula bağımlı
olmaz.

**KRİTİK NÜANS (food-recognition'da yaşanan hatadan ders)**: `shared/config/env.ts` ve
`shared/persistence/db.ts` (Prisma client) modül importunda bir kere kurulur/parse edilir.
Bir test dosyasında container'ı `beforeAll` içinde başlatıp env değişkenini SONRADAN set
ederseniz, zaten importlanmış modül bunu görmez. Bu yüzden container bağımlı modülleri
(`prisma`, varsa `jwt.ts` env okuyan kısımlar) `beforeAll` İÇİNDE, env set edildikten
SONRA, dinamik `await import(...)` ile yükleyin.

### Unit — `domain/`
- `validatePasswordStrength.test.ts`: min 8 karakter kuralı, sınır değerler (7/8/9 karakter).

### Unit — `use-cases/` (fake Port'larla)
- `SignUp.test.ts`: başarılı kayıt + email zaten kayıtlıysa `ConflictError
  (EMAIL_ALREADY_REGISTERED)` doğrulanır. Şifrenin gerçekten hash'lenip repository'ye
  hash olarak (plain değil) gittiği kontrol edilir.
- `SignIn.test.ts`: **enumeration testi kritik** — hem "email yok" hem "şifre yanlış"
  senaryolarının AYNI hata (`UnauthorizedError`, `code: INVALID_CREDENTIALS`, aynı mesaj)
  döndürdüğü ayrı ayrı test edilir. Ayrıca rate limit tetiklendiğinde (fake
  `checkRateLimit` 5. denemede reddediyor) `RateLimitError` döndüğü, ve rate limit
  kontrolünün şifre karşılaştırmasından ÖNCE yapıldığı (fake password verify fonksiyonunun
  hiç çağrılmadığı) doğrulanır.
- `RefreshSession.test.ts`: ÜÇ senaryo ayrı test edilir:
  1. Normal rotation: eski token "used" olur, yeni token+accessToken döner.
  2. Reuse detection: zaten "used"/"revoked" bir token tekrar gönderilirse, o kullanıcının
     TÜM refresh token'larının "revoked" olarak işaretlendiği (fake repository üzerinden)
     doğrulanır.
  3. Bulunamayan/süresi dolmuş token → `UnauthorizedError`.

### Integration — `adapters/` (testcontainers)
- `PrismaUserRepository.integration.test.ts`: gerçek Postgres'e karşı CRUD + email
  unique constraint'in gerçekten çalıştığı doğrulanır.
- `PrismaRefreshTokenRepository.integration.test.ts`: durum geçişleri (`active` → `used`
  → `revoked`) gerçek DB'ye karşı test edilir. Token'ın DB'de PLAIN DEĞİL, hash olarak
  saklandığı doğrulanır (ham SQL sorgusuyla kolonun içeriği kontrol edilir).
- `JwtSessionTokenAdapter.integration.test.ts`: üretilen access token'ın gerçekten
  doğrulanabildiği, süresi dolmuş bir token'ın reddedildiği test edilir (gerçek `jsonwebtoken`
  kütüphanesiyle, mock'suz — bu saf/hızlı bir test, container gerektirmez ama adapter'ın
  gerçek davranışını doğruladığı için integration klasöründe durur).

### E2E
- `signup-signin-refresh-flow.e2e.test.ts`: gerçek server'a karşı tam akış — sign-up →
  sign-in → refresh (eski refresh token'ı tekrar kullanmayı DENE, reddedildiğini doğrula).

**Tüm testler yazıldıktan sonra çalıştırılıp geçtiği doğrulanmalı.**
