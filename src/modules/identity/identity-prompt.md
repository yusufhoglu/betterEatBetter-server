# Claude Code Prompt — `src/modules/identity/`
## PROMPT

```
Bu bir TypeScript backend projesi (food-tracking mobil uygulaması). src/shared/ katmanı
zaten kurulu (Prisma, error taxonomy, authMiddleware, logger, rateLimiter, resilience
policy'leri mevcut). Şimdi src/modules/identity/ modülünü kuracağız.

Aynı klasördeki identity-rule.md ve shared-rule.md dosyalarını oku, TÜM kurallarına
harfiyen uy — özellikle şu üç nokta ATLANMAMALI:
1. Sign-up ve sign-in ayrı use-case'ler, upsert mantığı YOK.
2. Sign-in'de "email bulunamadı" ile "şifre yanlış" AYNI genel hata mesajını döner
   (enumeration koruması).
3. Refresh token rotation + reuse detection TAM olarak identity-rule.md'deki akışa göre
   implemente edilmeli — bu güvenlik-kritik bir mekanizma, kısaltma yapma.

Kapsam: SADECE email+şifre provider'ı yazılacak. Apple/Google adapter'ları YAZILMAYACAK
ama IdentityProviderPort, onların ileride eklenmesini kolaylaştıracak şekilde
provider-agnostic tasarlanmalı.

Oluşturulacak yapı:

src/modules/identity/
  domain/
    UserSession.ts              -> Session/token entity'si
    validatePasswordStrength.ts   -> pure fonksiyon, min 8 karakter kontrolü

  use-cases/
    SignUp.ts                    -> email+şifre ile yeni kullanıcı oluşturur.
                                    Email zaten kayıtlıysa ConflictError(code:
                                    'EMAIL_ALREADY_REGISTERED') fırlatır. Şifreyi argon2id
                                    ile hashler. Başarılıysa access+refresh token döner
                                    (kayıt sonrası otomatik giriş).
    SignIn.ts                     -> email+şifre ile giriş. EN BAŞTA rate limit kontrolü
                                    (checkRateLimit('signin:${email}', 5, 300)). Email
                                    bulunamazsa VEYA şifre yanlışsa AYNI hata:
                                    UnauthorizedError(code: 'INVALID_CREDENTIALS',
                                    "email veya şifre hatalı"). Argon2 ile şifre karşılaştırır.
    RefreshSession.ts               -> identity-rule.md'deki TAM rotation + reuse detection
                                    akışını implemente eder. Reuse tespit edilirse
                                    kullanıcının TÜM refresh token'larını revoke eder.

  ports/
    IdentityProviderPort.ts          -> provider-agnostic arayüz, verify(credentials) gibi
                                    email+şifre VE ileride Apple/Google'ın ortak
                                    kullanabileceği bir sözleşme
    UserRepositoryPort.ts              -> User CRUD sözleşmesi (email ile bulma dahil)
    RefreshTokenRepositoryPort.ts        -> RefreshToken kayıtlarının okuma/yazma/durum
                                    güncelleme sözleşmesi (rotation + reuse detection için)
    SessionTokenPort.ts                    -> access/refresh JWT üretme-doğrulama sözleşmesi

  adapters/
    provider/
      EmailPasswordAdapter.ts          -> IdentityProviderPort'un email+şifre implementasyonu,
                                    argon2 ile hash/verify
    repository/
      PrismaUserRepository.ts            -> UserRepositoryPort implementasyonu
      PrismaRefreshTokenRepository.ts      -> RefreshTokenRepositoryPort implementasyonu
                                    (refresh token PLAIN DEĞİL, SHA-256 hash'i saklanır)
    token/
      JwtSessionTokenAdapter.ts              -> SessionTokenPort'un JWT implementasyonu,
                                    access token 15dk / refresh token 30 gün varsayılan
                                    (env: ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS)

  http/
    IdentityController.ts                  -> POST /sign-up, POST /sign-in, POST /refresh
                                    endpoint'leri. Bu üç endpoint authMiddleware'in
                                    DIŞINDA kalır (henüz token yok).
    identityRoutes.ts                        -> Route tanımları + adapter/use-case wiring
                                    (manuel constructor injection, DI container YOK)

Prisma şeması güncellemesi (schema.prisma'ya ekle, mevcut modelleri BOZMA):

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  tokenHash String   @unique
  status    String   // 'active' | 'used' | 'revoked'
  expiresAt DateTime
  createdAt DateTime @default(now())
}

Bağımlılıklar: argon2, jsonwebtoken (zaten shared'de olabilir, yoksa ekle), crypto
(Node built-in, SHA-256 için).

Beklentiler:
- Gerçek, çalışan, derlenebilir TypeScript kodu — placeholder/TODO YOK.
- Her hata durumu shared/errors/ taksonomisinden bir sınıf kullanmalı, çıplak throw
  new Error() YASAK.
- İşin sonunda kısa bir özet ver: hangi dosyayı neden bu şekilde yazdığın, identity-rule.md
  ve shared-rule.md'deki hangi kurala karşılık geldiği.
- SADECE identity modülüne dokun, başka hiçbir modüle (food-recognition vb.) dokunma.
```
