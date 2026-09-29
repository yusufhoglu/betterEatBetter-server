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
- AI koc erisimi: `dietician` modulu `ResolveAiAssistant`'i (`http/practiceWiring.ts`'teki singleton)
  `CoachAccessPort` uzerinden cagirir; o da once `IsManagedClient`'a bakar. Cache: Redis `practice:managed:<userId>`,
  TTL 60sn, fail-open. Link basladiginda/bittiginde MUTLAKA `managedClientCache.invalidate`.
- `practiceRoutes.ts` `dietician`'in `AssistantTranscripts` / `PreviewAssistantReply` public use-case'lerini kurar
  (`adapters/assistant/`). `practiceWiring.ts` `dietician`'dan HICBIR SEY import etmez (dongu olmasin).
- Rol claim'i JWT'ye EKLENMEDI: diyetisyenlik her istekte uyelikten okunur (aktivasyondan sonra
  token yenileme gerekmez).

## AI asistan (`domain/aiAssistant.ts`, `use-cases/ResolveAiAssistant.ts`)

- Diyetisyenin AI'i = `dietician` modulundeki AI koc, diyetisyenin persona'siyla. Fine-tune YOK: ayarlar, kurallar,
  danisana ozel talimat ve ornek cevaplar her turda prompt'a girer; degisiklik bir sonraki mesajda etkili.
- TEK karar noktasi `ResolveAiAssistant` (`http/practiceWiring.ts` singleton): `status` / `forTurn` / `viewForClient`.
  Etkin = `settings.enabled` VE (`ClientAiSetting.access` ?? `defaultClientAccess`) VE diyetisyenin uyeligi aktif; ustune
  `schedule` (`isWithinSchedule`). Diyetisyeni olmayan kullanici sadece `IsManagedClient` cache'ine bakar.
- Diyetisyenin danisani ASLA genel koca dusmez: kapaliysa 403 (`dietician` modulu hem guard'da hem turda kontrol eder).
- `ClientAiSetting` link'ten AYRI tablo — `instructions` danisanin okudugu link payload'ina sizmasin diye.
- Ornek secimi (`selectExamples`): TR karakter katlama + 5 harf onek kok + kume kosinusu; az eslesirse en yeni orneklerle
  tamamlanir (uslup icin). Embedding YOK — ornek sayisi (<=200) buna izin veriyor; buyurse pgvector'e gecilir.
- Sohbet incelemesi `ai_chat` kapsamina bagli ve `assertCanRead` ile loglanir. Okuma `AiTranscriptPort` →
  `dietician` `AssistantTranscripts` (public use-case); sadece `dietitianId` damgali ve `link.startedAt` sonrasi mesajlar.
- Duzeltme = `sourceMessageId`'li ornek (`source: 'correction'`); mesajin bu diyetisyenin asistan cevabi oldugu dogrulanir.
- Onizleme (`POST /ai/preview`) prime model calistirir — `30 / saat / diyetisyen` rate limit.

## Analitik, skor ve uyarilar

- Hesaplar SAF fonksiyonlardir: `domain/analytics.ts` (skor, ozetler, kilo ilerlemesi) ve
  `domain/alertRules.ts` (11 kural). I/O `use-cases/ClientInsightsService.ts`'te; veri SADECE
  diger modullerin public use-case'lerinden (`GetMealItemsForRange`, `GetWaterForRange`,
  `GetStepsForRange`, `GetDailyTargets`, `GetUserProfile`, `ListBodyMeasurements`).
- `DataSelection` = danisanin O ANKI consent'i; paylasilmayan kaynak HIC okunmaz (testli).
- Skor agirliklari urun karari (30/30/20/10/10) — degistirmeden once sorun. Bugun skora girmez.
- Kurallar kuralla uretilir (LLM YOK — urun karari). Yeni kural = `ALERT_RULES`'a bir kayit +
  test; `id` kalicidir (diyetisyen ayarlari ve cache bu id'ye bagli).
- `client_insights` roster cache'idir: gece job'i (`jobs/clientInsightsJob.ts`, 02:30 TR) +
  detay acilisi + kural ayari degisince yenilenir. Detay sayfasi her zaman canli hesaplar.
- Su/adim hedefi `onboarding-plan`'da: `Plan.waterTargetMl`/`stepTarget` null = otomatik.
