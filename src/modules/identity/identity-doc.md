# Identity Modulu Developer Doc

Bu modul kullanici kimligini dogrular, session token uretir, refresh token rotation yapar ve hesabi siler. Kod yapisi klasik `http -> use-case -> port -> adapter` zincirini izler.

## Mimari Ozeti

- `http/IdentityController.ts` request validation ve HTTP mapping yapar.
- `use-cases/` altinda `SignUp`, `SignIn`, `RefreshSession`, `Logout`, `DeleteAccount` bulunur.
- `ports/` katmani token uretimi, refresh token saklama ve identity provider sozlesmelerini tanimlar.
- `adapters/repository/` Prisma ile kaliciligi; `adapters/token/` JWT uretimini; `adapters/provider/` provider bazli kimlik dogrulamayi uygular.

## Endpointler

| Method | Path | Aciklama |
| --- | --- | --- |
| `POST` | `/auth/sign-up` | Email+sifre ile hesap acip ilk session'i uretir |
| `POST` | `/auth/sign-in` | Email+sifre ile oturum acar |
| `POST` | `/auth/refresh` | Refresh token rotation ile yeni session verir |
| `POST` | `/auth/logout` | Refresh token'i iptal eder |
| `DELETE` | `/auth/account` | Authenticated kullanicinin hesabini ve sessionlarini siler |

## Sequence Diagramlari

### `POST /auth/sign-up`

```mermaid
sequenceDiagram
    actor Client
    participant Controller as IdentityController
    participant UseCase as SignUp
    participant Provider as EmailPasswordAdapter
    participant UserRepo as PrismaUserRepository
    participant TokenPort as JwtSessionTokenAdapter
    participant RefreshRepo as PrismaRefreshTokenRepository

    Client->>Controller: sign-up body
    Controller->>UseCase: execute(credentials)
    UseCase->>Provider: createIdentity(credentials)
    Provider->>UserRepo: create user + hash password
    UserRepo-->>Provider: user
    Provider-->>UseCase: identity
    UseCase->>TokenPort: issue access/refresh tokens
    UseCase->>RefreshRepo: store rotated refresh token
    UseCase-->>Controller: session
    Controller-->>Client: 201 session payload
```

### `POST /auth/sign-in` ve `POST /auth/refresh`

```mermaid
sequenceDiagram
    actor Client
    participant Controller as IdentityController
    participant SignIn as SignIn
    participant Refresh as RefreshSession
    participant Provider as EmailPasswordAdapter
    participant TokenPort as JwtSessionTokenAdapter
    participant RefreshRepo as PrismaRefreshTokenRepository

    alt POST /auth/sign-in
        Client->>Controller: credentials
        Controller->>SignIn: execute(credentials)
        SignIn->>Provider: verify(credentials)
        Provider-->>SignIn: user identity
        SignIn->>TokenPort: create session tokens
        SignIn->>RefreshRepo: persist refresh token
        SignIn-->>Controller: session
        Controller-->>Client: 200 session
    else POST /auth/refresh
        Client->>Controller: refreshToken
        Controller->>Refresh: execute(refreshToken)
        Refresh->>RefreshRepo: validate current token
        Refresh->>TokenPort: mint new tokens
        Refresh->>RefreshRepo: rotate token family
        Refresh-->>Controller: new session
        Controller-->>Client: 200 session
    end
```

### `POST /auth/logout` ve `DELETE /auth/account`

```mermaid
sequenceDiagram
    actor Client
    participant Controller as IdentityController
    participant Logout as Logout
    participant Delete as DeleteAccount
    participant RefreshRepo as PrismaRefreshTokenRepository
    participant UserRepo as PrismaUserRepository

    alt POST /auth/logout
        Client->>Controller: refreshToken
        Controller->>Logout: execute(refreshToken)
        Logout->>RefreshRepo: revoke token
        Logout-->>Controller: ok
        Controller-->>Client: 204
    else DELETE /auth/account
        Client->>Controller: authenticated request
        Controller->>Delete: execute(userId)
        Delete->>RefreshRepo: revoke all refresh tokens
        Delete->>UserRepo: delete user account
        Delete-->>Controller: ok
        Controller-->>Client: 204
    end
```

## Gelistirme Rehberi

- Yeni provider ekleyecekseniz `IdentityProviderPort` implement edin; `SignIn` veya `RefreshSession` icine provider ozel kod koymayin.
- Refresh token akisini atlamayin. Session ile ilgili her yeni davranis `RefreshTokenRepositoryPort` uzerinden revoke/rotate mantigina uymali.
- Request validation controller'da `zod` ile yapiliyor. Use-case icine ham `req.body` tasimayin.
- Hesap silme, cikis ve refresh gibi kritik akislarda repository bypass etmeyin; tum silme/iptal islemleri use-case uzerinden gecmeli.

## Ornek Best Practice

Yeni bir social login eklerken dogru pattern:

```ts
class AppleSignInAdapter implements IdentityProviderPort {
  async verify(credentials: AppleCredentials) {
    return { externalId, email };
  }
}
```

Yanlis pattern: controller icinde provider SDK cagirmak veya `PrismaUserRepository`'yi dogrudan route dosyasindan degistirmek.
