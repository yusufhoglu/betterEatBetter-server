# Practice Modulu — Rule

`src/modules/practice/` (diyetisyen platformu: organizasyon, uyelik, aktivasyon kodu, danisan
baglantisi, onay kapsamlari, erisim logu, danisan verisi okuma, notlar). Referans:
`dietitian-platform-design.md`, `shared-rule.md`, `messaging-rule.md`.

---

## Erisim politikasi — TEK kapi: `use-cases/ClientAccessPolicy.ts`

- Diyetisyen tarafinda danisan verisine dokunan HER use-case once policy'yi cagirir:
  - `resolveStaffAccess` → liste/meta: atanmis diyetisyen VEYA link'in org'unda owner/admin.
  - `assertAssigned` → yazma (plan) ve veri: SADECE atanmis diyetisyen.
  - `assertCanRead(actor, client, scope, resource)` → `assertAssigned` + `scope ∈ consentScopes` + audit.
- Yetkisiz aktor **404 `CLIENT_NOT_FOUND`** alir (varlik sizdirilmaz). Kapsam kapaliysa
  **403 `CONSENT_SCOPE_DISABLED`**, atanmis degilse **403 `NOT_ASSIGNED_DIETITIAN`**.
- Klinik owner/admin danisan VERISINI GORMEZ (kullanici karari) — sadece liste, atama, not, bitirme.
- `meal_photos` ayri kapsamdir: kapaliysa ogunler foto URL'leri SIFIRLANMIS olarak doner.
- Her basarili veri okumasi `DataAccessLog`'a yazilir, **fire-and-forget** (`policy.log`) —
  log hatasi okumayi dusurmez. Roster/overview okumalari `scope='summary'` ile loglanir.
- `ClientDataPort` yetki KONTROL ETMEZ; cagiran (use-case) policy'den gecmis olmak zorunda.

## Kodlar

- **Aktivasyon kodu** (`domain/activationCode.ts`): admin uretir
  (`npm run practice:activation-code`), DB'de SADECE SHA-256 hash. Redeem, tek bir transaction
  icinde kosullu `UPDATE ... usedCount < maxUses` ile yapilir — eszamanli iki redeem son hakki
  ikisi birden kullanamaz. Gecersiz/suresi dolmus/iptal/tukenmis kodlar ayni hatayi verir
  (`ACTIVATION_CODE_INVALID`). Org'a bagli olmayan kod → kullaniciya `solo` org + `owner` rolu.
- **Davet kodu** (`domain/inviteCode.ts`): STATELESS. Kodun icinde uyeligin `inviteKey`'i +
  bitis gunu + 32-bit HMAC. DB'de davet tablosu YOK. Iptal = `POST /practice/invites/rotate`
  (inviteKey yenilenir, eski kodlarin hepsi gecersiz). 32-bit MAC ancak **rate limit** ile
  guvenli: preview/join/activate `10 / 15dk / kullanici`. Bu limiti kaldirmayin.
- Secret: `INVITE_CODE_SECRET` (opsiyonel); yoksa `JWT_SECRET`'tan HMAC ile turetilir
  (`http/practiceWiring.ts`). Secret degisirse verilmis tum davet kodlari gecersiz olur.

## Baglanti yasam dongusu

- Danisan basina en fazla **1 aktif link** (use-case kontrolu + partial unique index
  `dietitian_client_links_one_active_per_client`). Race'te Prisma P2002 → `CLIENT_ALREADY_LINKED`.
- Join → link + thread (`LinkThreadPort.ensureThreadForLink`) + managed-client cache invalidation.
- End (danisan / atanmis diyetisyen / org admin) → `status='ended'`, `ClientDataPort.releasePlan`
  (hedefler korunur, sahiplik danisana doner), thread read-only + sistem mesaji, cache invalidation.
  Linkler SILINMEZ; notlar link'e baglidir (yeni iliski temiz sayfa).
- Reassign (sadece owner/admin, ayni org'daki aktif diyetisyene) → consent tasinir, thread'de
  eski diyetisyen yenisiyle degistirilir.

## Moduller arasi

- Diger modullerin verisine SADECE public use-case'leri uzerinden (`adapters/client-data/ClientDataAdapter.ts`).
  Tek istisna `getActivity`: roster icin cok-danisanli agregat, iki read-only SQL. Buyurse
  tasarimdaki `ClientDailySummary` projeksiyonuna gecilir.
- `messaging`'e SADECE `ThreadAdmin` (via `MessagingLinkThreadAdapter`) — thread tablolarina dokunulmaz.
- AI koc guard'i: `dietician` modulu `IsManagedClient`'i (`http/practiceWiring.ts`'teki singleton)
  `ManagedClientPort` uzerinden cagirir. Cache: Redis `practice:managed:<userId>`, TTL 60sn,
  fail-open. Link basladiginda/bittiginde MUTLAKA `managedClientCache.invalidate`.
- Rol claim'i JWT'ye EKLENMEDI: diyetisyenlik her istekte uyelikten okunur (aktivasyondan sonra
  token yenileme gerekmez).
