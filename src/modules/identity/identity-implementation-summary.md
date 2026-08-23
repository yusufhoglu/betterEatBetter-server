# Identity Modülü — Implementasyon Özeti

Bu doküman `src/modules/identity/` altında yazılan kodun `identity-rule.md`'deki hangi
kurala karşılık geldiğini ve `shared/` katmanıyla ilgili çıkan bir mimari
uyuşmazlığın nasıl çözüldüğünü özetler.

**Doğrulama durumu:** `tsc --noEmit` → 0 hata. `npm run test:unit` → 50 suite yeşil
(identity modülünde 29 gerçek test + repo genelinde daha önce yazılmış 47 `test.todo`).

---

## Önemli bir mimari uyuşmazlık ve nasıl çözüldüğü

`identity-prompt.md`'yi okurken, `shared/auth/jwt.ts` ve
`shared/auth/refreshTokenService.ts`'in aslında **zaten çalışan, test edilmiş** bir
JWT + refresh-token rotation/reuse-detection implementasyonu içerdiği ortaya çıktı:

- `shared/auth/jwt.ts` → `signAccessToken` / `verifyAccessToken`, `authMiddleware.ts`
  tarafından zaten kullanılıyor.
- `shared/auth/refreshTokenService.ts` → `issueInitialRefreshToken` /
  `rotateRefreshToken` / `revokeAllRefreshTokens`, `RefreshToken` tablosunda
  `revokedAt` (DateTime?) + `replacedById` (String?) alanlarıyla rotation +
  reuse detection'ı zaten uyguluyor — `identity-prompt.md`'nin istediği
  `status: 'active' | 'used' | 'revoked'` enum'u değil, ama **aynı semantiği**
  taşıyan bir tasarım (revokedAt dolu = artık aktif değil).

Bunun üstüne identity modülünde ikinci, bağımsız bir implementasyon yazmak iki
somut soruna yol açardı:

1. Aynı güvenlik-kritik mantığın (rotation + reuse detection) iki kopyası
   zamanla birbirinden sapabilir — biri düzeltilip diğeri unutulabilir.
2. Identity modülünün ürettiği access token'lar, `authMiddleware`'in kullandığı
   `verifyAccessToken` ile **aynı secret/algoritmayı** kullanmazsa, üretilen
   token diğer tüm modüllerin auth middleware'inde geçersiz sayılır.

**Çözüm:** `JwtSessionTokenAdapter` ve `PrismaRefreshTokenRepository`'yi
bağımsız implementasyonlar yerine, `shared/auth/`'a delegasyon yapan ince
sarmalayıcılar (thin wrapper) olarak yazdım. Bu tam olarak Port/Adapter
ayrımının öngördüğü şey: port identity modülünde tanımlı (kullanan tanımlar),
ama adapter altyapıyı yeniden icat etmiyor.

- `RefreshToken` şemasına ayrı bir `status` alanı **eklenmedi** — mevcut
  `revokedAt`/`replacedById` ile iki farklı state kaynağı (source of truth)
  yaratmak, tutarsızlık riski taşırdı.
- `User` modeline sadece `email` (unique) + `passwordHash` **eklendi**, mevcut
  `id`/`createdAt`/`updatedAt`/`refreshTokens` alanları/ilişkileri bozulmadı.
- Env değişkeni isimleri de mevcut `shared/config/env.ts`'e uyduruldu
  (`JWT_ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS`) — prompttaki
  `ACCESS_TOKEN_TTL_SECONDS` ismi yerine, zaten var olan ve `.env.example`'da
  tanımlı olan isim kullanıldı.

---

## Dosya → Kural Eşlemesi

| Dosya | Rule'daki karşılığı |
|---|---|
| `schema.prisma` | `User`'a `email`(unique)+`passwordHash` **eklendi**; mevcut modeller bozulmadı |
| `domain/validatePasswordStrength.ts` | Pure fonksiyon, min 8 karakter kontrolü |
| `domain/UserSession.ts` | Session/token entity'si — `userId`, `accessToken`, `refreshToken`, `refreshTokenExpiresAt` |
| `ports/IdentityProviderPort.ts` | Generic `verify(credentials): Promise<{externalId, email}>` — `IdentityProviderPort<TCredentials>`, varsayılan tip parametresi email+şifre. Apple/Google ileride `IdentityProviderPort<AppleCredentials>` olarak eklenebilir, `SignIn`/`RefreshSession` hiç değişmeden |
| `ports/UserRepositoryPort.ts` | User CRUD sözleşmesi, email ile bulma dahil |
| `ports/RefreshTokenRepositoryPort.ts` | `issue`/`rotate` — rotation+reuse detection'ın port seviyesindeki sözleşmesi |
| `ports/SessionTokenPort.ts` | Access token üretme/doğrulama sözleşmesi |
| `adapters/provider/EmailPasswordAdapter.ts` | argon2id ile hash/verify; email-bulunamadı ve şifre-yanlış durumları **tek throw path**'te birleşiyor → enumeration koruması yapısal olarak garanti, `SignIn`'in ayrıca hatırlamasına gerek yok |
| `adapters/repository/PrismaUserRepository.ts` | `UserRepositoryPort` → doğrudan Prisma |
| `adapters/repository/PrismaRefreshTokenRepository.ts` | `shared/auth/refreshTokenService.ts`'e delegasyon (rotation+reuse detection zaten orada, tekrar yazılmadı) |
| `adapters/token/JwtSessionTokenAdapter.ts` | `shared/auth/jwt.ts`'e delegasyon (authMiddleware ile aynı doğrulama mantığı garanti) |
| `use-cases/SignUp.ts` | `SignIn`'den ayrı use-case, upsert mantığı yok; email kayıtlıysa `ConflictError('EMAIL_ALREADY_REGISTERED')`; şifre zayıfsa email kontrolünden ÖNCE `ValidationError('PASSWORD_TOO_WEAK')`; başarılıysa access+refresh token (otomatik giriş) |
| `use-cases/SignIn.ts` | `checkRateLimit('signin:${email}', 5, 300)` EN BAŞTA, argon2 hesaplamasından önce; email bulunamadı/şifre yanlış ayrımı yapılmadan `UnauthorizedError('INVALID_CREDENTIALS', 'email veya şifre hatalı')` |
| `use-cases/RefreshSession.ts` | Rotation+reuse detection mantığı `RefreshTokenRepositoryPort#rotate`'te yaşıyor; use-case sadece rotate edilen refresh token'ın üstüne yeni bir access token ekliyor |
| `http/IdentityController.ts` | `/sign-up`, `/sign-in`, `/refresh` handler'ları, zod ile body validasyonu, response DTO'larında asla `passwordHash` yok |
| `http/identityRoutes.ts` | Route tanımları + manuel constructor injection (DI container yok), bu 3 endpoint `authMiddleware` DIŞINDA |
| `test-utils/fakes/*` | `InMemoryUserRepository`, `InMemoryRefreshTokenRepository` (identity-rule.md'deki TAM rotation+reuse akışını bellekte birebir taklit eder), `FakeSessionTokenPort` |
| `jest.setup.ts` + `jest.config.js` (`setupFiles`) | **Identity modülü dışı, küçük ve gerekli bir ek**: `shared/config/env.ts` import anında (`envSchema.parse(process.env)`) fail-fast validasyon yapıyor — bu da `logger`/`errorMapper`'ı (dolayısıyla env'i) import eden HERHANGİ bir test dosyasını, gerçek env değişkenleri olmadan import zamanında çökertiyordu. Muhtemelen repodaki tüm testlerin şimdiye kadar `test.todo` kalmasının bir sebebi de bu. Sadece test-time fallback env değerleri eklendi (gerçek Redis/Postgres/JWT davranışı hâlâ mock'lanıyor, bu değerler sadece import'un çökmemesi için) |

---

## Testler (7 suite, 29 gerçek test)

- **`validatePasswordStrength.test.ts`** — sınır değerler (7/8/9 karakter, boş string).
- **`EmailPasswordAdapter.test.ts`** — hash/verify round-trip; email-bulunamadı ve
  şifre-yanlış durumlarının **aynı** `UnauthorizedError` (aynı `code`, aynı `message`)
  ürettiğinin doğrulanması.
- **`SignUp.test.ts`** — başarı akışı (kullanıcı oluşur, passwordHash plain değil),
  `EMAIL_ALREADY_REGISTERED`, `PASSWORD_TOO_WEAK`, ve sıralama testi (şifre kontrolü
  email kontrolünden önce çalışıyor — zayıf şifreyle kayıtlı email'e bile ulaşılmıyor).
- **`SignIn.test.ts`** — rate limit'in `verify()`'den önce çağrıldığının call-order
  ile kanıtlanması, rate limit aşımında identity provider'ın hiç çağrılmadığı,
  başarı akışı, ve uçtan uca (gerçek `EmailPasswordAdapter` ile) enumeration koruması.
- **`RefreshSession.test.ts`** — rotation (eski token "used", yeni token "active"),
  bilinmeyen token → `UnauthorizedError`, reuse detection (kullanıcının TÜM aktif
  token'larının iptal edildiği), farklı bir kullanıcının token'larının etkilenmediği.
- **`IdentityController.test.ts`** — supertest ile gerçek HTTP status kodları
  (201/200/400/401/409), response body'de `passwordHash`/`password` sızmadığı,
  reuse detection'ın HTTP seviyesinde 401 + `REFRESH_TOKEN_REUSE_DETECTED` döndüğü,
  malformed body için 400 + `INVALID_REQUEST_BODY`.

**Kapsam dışı bırakılan test türü:** `PrismaUserRepository`, `PrismaRefreshTokenRepository`,
`JwtSessionTokenAdapter` için canlı Postgres/Redis gerektiren entegrasyon testi
yazılmadı — bu ortamda canlı altyapı yok, ve repodaki mevcut konvansiyonla tutarlı
(hiçbir modülde henüz `.integration.test.ts` yok).

---

## Kapsam Dışı Bırakılanlar (talimat gereği)

`AppleSignInAdapter.ts`, `GoogleSignInAdapter.ts`, `SignInWithProvider.ts` — hiç
dokunulmadı, hâlâ `initial scheleton constructed` commit'inden kalma TODO stub.
`IdentityProviderPort`'un generic tasarımı sayesinde bunlar ileride
`IdentityProviderPort<AppleCredentials>` / `IdentityProviderPort<GoogleCredentials>`
olarak eklenebilir, `SignIn`/`RefreshSession` hiç değişmeden.

`food-recognition`, `onboarding-plan` gibi diğer özellik modüllerine bu turda hiç
dokunulmadı.
