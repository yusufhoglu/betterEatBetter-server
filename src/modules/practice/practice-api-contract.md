# Diyetisyen Platformu — API Kontrati (mobil + web)

Tum istekler `Authorization: Bearer <accessToken>`. Hatalar mevcut format: `{ code, message }`.
Tarihler ISO-8601; gun alanlari `YYYY-MM-DD`. `timeZone` IANA (orn. `Europe/Istanbul`).

## Web oturumu (panel)

`POST /auth/web/sign-in { email, password }` · `POST /auth/web/google { idToken }` (Google Identity Services ID token;
web client ID `GOOGLE_OAUTH_CLIENT_IDS` listesinde olmali) · `POST /auth/web/refresh` · `POST /auth/web/logout`.
Hepsi `X-Requested-With: eatbetter-web` ister; refresh token httpOnly cerezde, govdede sadece `{ userId, accessToken }`.

## Rol / mod tespiti

`GET /practice/me` →
```json
{
  "dietitian": null | { "profile": {...}, "memberships": [{ "organizationId", "role": "owner|admin|dietitian", "organization": { "id", "name", "kind": "solo|clinic" } }] },
  "link": null | { "id", "status", "consentScopes": ["meals","meal_photos","body_measurements","water","steps","ai_chat"], "dietitian": { "userId","name","username","avatarUrl" }, "threadId", "startedAt",
                   "aiAssistant": { "enabled", "availableNow", "name": string|null, "nextAvailableAt": ISO|null } }
}
```
- `dietitian != null` → uygulamada "Diyetisyen modu" acilir.
- `link != null` → danisan: "Diyetisyenim" + mesaj girisi gosterilir. AI koc girisi **sadece `link.aiAssistant.enabled`** ise
  gosterilir, basliginda `aiAssistant.name` yazar. Aksi halde `/dietician/*` 403 `AI_COACH_UNAVAILABLE_MANAGED_CLIENT`.
  `enabled && !availableNow` → gecmis okunur ama gonderim 403 `DIETITIAN_AI_OFF_HOURS`; `nextAvailableAt` gosterilir.

## Diyetisyen hesabi

| Istek | Govde | Not |
| --- | --- | --- |
| `POST /practice/dietitian/activate` | `{ code }` | 201 `{ profile, membership }`; 404 `ACTIVATION_CODE_INVALID`, 409 `ALREADY_DIETITIAN` / `ALREADY_ORGANIZATION_MEMBER`, 429 |
| `PATCH /practice/dietitian/profile` | `{ title?, licenseNo?, bio?, specialties? }` | |
| `POST /practice/invites` | `{ organizationId?, validityDays? (1-365, vars. 7) }` | 201 `{ code: "XXXX-XXXX-XXXX-XXXX", expiresAt, organizationId }` — DB'ye yazilmaz, istendigi kadar uretilebilir |
| `POST /practice/invites/rotate` | `{ organizationId? }` | 204 — onceki TUM davet kodlarini iptal eder |
| `GET /practice/organizations/:orgId/members` | | `{ items: [{ userId, role, person, activeClientCount }] }` |

## Danisan tarafi

| Istek | Govde | Not |
| --- | --- | --- |
| `POST /practice/invites/preview` | `{ code }` | `{ dietitian: { name, title, specialties, ... }, organization, expiresAt }`; 404 `INVITE_CODE_INVALID` |
| `POST /practice/join` | `{ code, consentScopes: [...] }` | 201 link + `threadId`; 409 `CLIENT_ALREADY_LINKED` / `CANNOT_JOIN_SELF` |
| `GET /practice/me/link` | | 404 `NO_ACTIVE_LINK` |
| `PATCH /practice/me/link/consent` | `{ consentScopes: [...] }` | aninda etkili |
| `POST /practice/me/link/end` | | plan danisana doner, sohbet salt-okunur |
| `GET /practice/me/access-log?limit=&before=` | | `{ items: [{ actor, scope, resource, createdAt }], nextBefore }` |

Kapsamlar: `meals`, `meal_photos`, `body_measurements`, `water`, `steps`. Onay ekraninda her biri ayri anahtar.

## Diyetisyen → danisanlar

| Istek | Not |
| --- | --- |
| `GET /practice/clients?view=mine\|organization&organizationId=&q=&timeZone=` | `{ items: [{ linkId, client, dietitian, consentScopes, startedAt, activity: { lastLoggedDate?, daysLoggedLast7?, latestWeightKg? } \| null }] }` — `organization` sadece owner/admin; `activity` sadece atanmis diyetisyene ve paylasilan kapsamlara gore |
| `GET /practice/clients/:clientId?timeZone=` | `{ link, client, dietitian, isAssigned, threadId, plan, activity }` |
| `GET /practice/clients/:clientId/meals?from=&to=&timeZone=` | en fazla 31 gun, yeniden eskiye; `{ items: [{ date, meals: [{ mealType, entries, calories, proteinG, carbsG, fatG, photoUrls }], consumed, goals }] }` |
| `GET /practice/clients/:clientId/body-measurements?metric=&limit=&cursor=` | |
| `GET /practice/clients/:clientId/water?from=&to=` | `{ items: [{ date, amountMl }] }` |
| `PUT /practice/clients/:clientId/plan` | `{ dailyCalories, proteinG, carbsG, fatG, waterTargetMl?, stepTarget? }` → danisan artik makro duzenleyemez (`PLAN_MANAGED_BY_DIETITIAN`). `waterTargetMl`/`stepTarget`: alan yok = degismez, `null` = otomatige don |
| `GET /practice/clients/:clientId/steps?from=&to=` | `{ items: [{ date, steps }] }` (kapsam `steps`) |
| `GET /practice/clients/:clientId/analytics?period=14\|30\|all&timeZone=` | Asagida |
| `POST /practice/clients/:clientId/end` | |
| `PATCH /practice/clients/:clientId/assignee` | `{ dietitianId }` (owner/admin) |
| `GET/POST /practice/clients/:clientId/notes`, `PATCH/DELETE .../notes/:noteId` | `{ body }` — danisan GORMEZ, sadece yazari duzenler |

Hata kodlari: 404 `CLIENT_NOT_FOUND`, 403 `CONSENT_SCOPE_DISABLED` / `NOT_ASSIGNED_DIETITIAN` / `ORGANIZATION_ADMIN_REQUIRED`.

## Analitik (`GET /practice/clients/:clientId/analytics`)

Sadece atanmis diyetisyen. Paylasilmayan kapsam hic okunmaz; ilgili alanlar `null`/bos doner.

```json
{
  "period": { "from": "2026-09-15", "to": "2026-09-28", "days": 14 },
  "shared": { "meals": true, "water": true, "steps": true, "body": true },
  "targets": { "dailyCalories": 1800, "proteinG": 120, "carbsG": 180, "fatG": 66, "waterMl": 2100, "steps": 10000, "waterAuto": true, "stepsAuto": false, "source": "dietitian" },
  "score": { "score": 78, "parts": [{ "id": "logging|calories|protein|water|steps", "weight": 30, "hits": 13, "days": 13, "ratio": 1 }] },
  "nutrition": { "loggedDays", "avgKcal", "avgProteinG", "avgCarbsG", "avgFatG", "daysInKcalRange", "weekdayAvgKcal", "weekendAvgKcal" },
  "activity": { "avgSteps", "stepGoalDays", "bestDay": { "date", "steps" }, "avgWaterMl", "waterGoalDays" },
  "days": [{ "date", "logged", "kcal", "proteinG", "carbsG", "fatG", "mealTypes": [], "waterMl": null, "steps": null }],
  "topFoods": [{ "name", "kcal", "count" }],
  "weight": { "startKg", "latestKg", "latestDate", "changeKg", "weeklyRateKg", "targetKg", "remainingKg", "projectedTargetDate", "points": [{ "date", "kg" }] },
  "measurements": [{ "metric", "unit", "start", "fourWeeksAgo", "latest", "latestDate", "change" }],
  "alerts": [{ "ruleId", "severity": "high|medium|low", "message", "params": {} }],
  "computedAt": "…"
}
```

- Skor: tamamlanmis gunler (bugun haric), agirliklar kayit 30 · kalori (±%10) 30 · protein (≥%90) 20 · su (≥%90) 10 · adim (≥hedef) 10. Paylasilmayan kisim duser, agirliklar yeniden olceklenir.
- Roster (`GET /practice/clients`) her satirda `insight: { score, alerts, computedAt }` (14 gunluk; gece ve detay acildiginda yenilenir).

## Uyari kurallari

| Istek | Not |
| --- | --- |
| `GET /practice/alert-rules` | `{ items: [{ id, scope, severity, unit, defaultThreshold, enabled, threshold, customized }] }` |
| `PUT /practice/alert-rules` | `{ rules: [{ ruleId, enabled, threshold: number\|null }] }` — `null` = varsayilan |

Kurallar: `no_logs`, `never_started`, `no_weighin`, `kcal_off`, `weekend`, `protein_low`, `plateau`, `too_fast`, `water_low`, `steps_low`, `unanswered` (esikler: `src/modules/practice/domain/alertRules.ts`).

## AI asistan (diyetisyenin AI'i)

Diyetisyen AI kocun danisanlarina KENDI uslubuyla cevap vermesini ayarlar (fine-tune YOK — her mesajda prompt baglami).
Danisan tarafi mevcut `/dietician/*` uclarini kullanir; kim olarak konusulacagini backend belirler.

| Istek | Govde / Not |
| --- | --- |
| `GET /practice/ai/settings` | `{ enabled, defaultClientAccess, assistantName, addressForm: "sen"\|"siz"\|null, tone, approach, rules: [], avoid: [], handoffMessage, schedule, displayName, availableNow, nextAvailableAt, exampleCount, updatedAt }` — hic kaydedilmediyse varsayilanlar (`enabled: false`) |
| `PUT /practice/ai/settings` | Yukaridaki duzenlenebilir alanlarin TAMAMI. `schedule: null` = her zaman acik, ya da `{ timeZone, windows: [{ days: [1..7] (1=Pzt), start: "HH:MM", end: "HH:MM" }] }` (`start >= end` = gece yarisini asar, esit = tam gun). 400 `INVALID_TIME_ZONE` / `INVALID_SCHEDULE_DAYS` / `INVALID_SCHEDULE_TIME` |
| `POST /practice/ai/preview` | `{ messages: [{ role: "user"\|"assistant", content }] }` (son mesaj `user`) → `{ reply }`. Kayitli ayarlarla, danisan verisi olmadan. 30/saat |
| `GET /practice/ai/examples` | `{ items: [{ id, question, answer, source: "manual"\|"correction", sourceMessageId, createdAt, updatedAt }] }` yeniden eskiye |
| `POST /practice/ai/examples` | `{ question, answer, sourceMessageId? }` → 201. `sourceMessageId` = bir AI cevabini duzeltme (bu diyetisyenin asistan mesaji olmali, yoksa 404 `AI_MESSAGE_NOT_FOUND`). En fazla 200 (409 `AI_EXAMPLE_LIMIT`) |
| `PATCH/DELETE /practice/ai/examples/:exampleId` | Sadece sahibi (digerine 404 `AI_EXAMPLE_NOT_FOUND`) |
| `GET /practice/clients/:clientId/ai` | `{ access: "on"\|"off"\|null, instructions, enabled, availableNow }` — atanmis diyetisyen |
| `PUT /practice/clients/:clientId/ai` | `{ access, instructions }` — `access: null` = diyetisyenin varsayilani. `instructions` danisan GORMEZ, AI'a ozel talimat |
| `GET /practice/clients/:clientId/ai/conversations` | kapsam `ai_chat`. `{ items: [{ conversationId, title, lastMessageAt, messageCount }] }` |
| `GET /practice/clients/:clientId/ai/conversations/:conversationId` | kapsam `ai_chat`. `{ items: [{ id, role, content, card: { kind, title }\|null, createdAt, correctionExampleId }] }` |

- Etkin durum: `enabled` (ana anahtar) VE (`access` ?? `defaultClientAccess`) VE diyetisyen askida degil; ustune `schedule`.
- Diyetisyen yalnizca KENDI asistaninin bu iliski boyunca (`link.startedAt` sonrasi) cevapladigi mesajlari gorur.

## Beslenme plani

Diyetisyen danisan basina TEK plan yazar (iliskiye baglidir; iliski bitip yenisi baslarsa temiz sayfa). Plan diyetisyenin kendi emegi olduğu icin danisan onay kapsami gerekmez: atanmis diyetisyen yazar, danisani gorebilen kadro (atanmis + org owner/admin) okur, danisan kendi planini okur.

```jsonc
// MealPlan govdesi (PUT) — tamami gonderilir, mevcut plan yer degistirir
{
  "title": "Hafta 1" | null,          // <=120
  "notes": "Genel not" | null,        // <=3000
  "meals": [                           // <=12, sirali
    {
      "id": "string",                  // editorun verdigi kararli id
      "name": "Sabah",                 // <=60; varsayilanlar: Sabah, Ara öğün, Öğle, İkindi, Akşam, Gece
      "time": "08:00" | null,          // 24s HH:MM
      "note": null,                    // <=500
      "items": [                       // <=60
        { "id": "string", "name": "Yulaf", "amount": 50 | null, "unit": "g",
          "calories": 190 | null, "proteinG": 6 | null, "carbsG": 33 | null, "fatG": 3 | null,  // girilen miktarin TOPLAMI
          "note": null }
      ]
    }
  ]
}
```

| Istek | Not |
| --- | --- |
| `GET /practice/clients/:clientId/meal-plan` | `{ plan: { id, title, notes, meals, createdAt, updatedAt } \| null }` |
| `PUT /practice/clients/:clientId/meal-plan` | Govde yukaridaki. Atanmis diyetisyen (403 `NOT_ASSIGNED_DIETITIAN`). → `{ plan }`. 400 `INVALID_REQUEST_BODY` |
| `DELETE /practice/clients/:clientId/meal-plan` | 204 |
| `GET /practice/me/meal-plan` | Danisan (mobil): aktif diyetisyeninin plani. `{ plan \| null }` |
| `GET /practice/plan-header` | Diyetisyenin PDF baslik bilgisi `{ clinicName, tagline, contact, footer }` (hepsi `null` olabilir) |
| `PUT /practice/plan-header` | Ayni sekil, tamami |
| `GET /practice/foods?q=` | Once diyetisyenin kendi besinleri, `q` >= 2 harfse ardindan ortak katalog: `{ items: [{ source: "custom"\|"catalog", id, name, brand, amount, unit, calories, proteinG, carbsG, fatG }] }` — degerler `amount` `unit` icin (katalog: 100 g ya da 1 porsiyon) |
| `POST /practice/foods` | `{ name, amount, unit, calories, proteinG, carbsG, fatG }` → 201 `{ id, dietitianId, ... }`. En fazla 500 (403 `CUSTOM_FOOD_LIMIT`) |
| `PUT/DELETE /practice/foods/:foodId` | Sadece sahibi (digerine 404 `FOOD_NOT_FOUND`) |

## Danisanin kendisi (mobil)

- `PUT /activity/steps { timeZone, source: "apple_health"|"health_connect", days: [{ date, steps }] }` — son 31 gun, idempotent.
- `GET /goal` artik `waterTargetMl, stepTarget, waterTargetAuto, stepTargetAuto, planSource` da doner.

## Mesajlasma

| Istek | Not |
| --- | --- |
| `GET /threads` | `{ items: [{ id, kind, refId, readOnly, lastMessageAt, lastMessage, unreadCount, counterparts }] }` |
| `GET /threads/:id/messages?before=&limit=` | `{ items (yeniden eskiye), nextBefore, readOnly, readReceipts: [{ userId, lastReadAt }] }` |
| `POST /threads/:id/messages` | `{ clientMessageId, type: "text"\|"image", body?, attachments?: [{ kind:"image", key, contentType, width?, height? }] }` → 201 yeni / 200 tekrar |
| `POST /threads/:id/read` | `{ messageId }` |
| `POST /threads/:id/attachments` | `{ contentType }` → `{ key, uploadUrl }`; dosyayi `PUT uploadUrl` (Content-Type ayni) ile yukle, sonra `key`'i mesajda gonder |
| `GET /realtime/stream` | SSE. `event: message.created \| thread.read \| thread.updated`, `data: <json>`; `: ping` her 25sn. Kopunca yeniden baglan + `GET /threads`. |

Mesaj tipi `system`: `senderId = null`, ortada gri balon olarak gosterilir.
Push: `data.type = "chat_message"`, `data.threadId` → ilgili sohbeti ac.
