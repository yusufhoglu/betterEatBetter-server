# Diyetisyen Platformu — API Kontrati (mobil + web)

Tum istekler `Authorization: Bearer <accessToken>`. Hatalar mevcut format: `{ code, message }`.
Tarihler ISO-8601; gun alanlari `YYYY-MM-DD`. `timeZone` IANA (orn. `Europe/Istanbul`).

## Rol / mod tespiti

`GET /practice/me` →
```json
{
  "dietitian": null | { "profile": {...}, "memberships": [{ "organizationId", "role": "owner|admin|dietitian", "organization": { "id", "name", "kind": "solo|clinic" } }] },
  "link": null | { "id", "status", "consentScopes": ["meals","meal_photos","body_measurements","water"], "dietitian": { "userId","name","username","avatarUrl" }, "threadId", "startedAt" }
}
```
- `dietitian != null` → uygulamada "Diyetisyen modu" acilir.
- `link != null` → danisan: AI koc girisi GIZLENIR (`/dietician/*` 403 `AI_COACH_UNAVAILABLE_MANAGED_CLIENT`), "Diyetisyenim" + mesaj girisi gosterilir.

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

Kapsamlar: `meals`, `meal_photos`, `body_measurements`, `water`. Onay ekraninda her biri ayri anahtar.

## Diyetisyen → danisanlar

| Istek | Not |
| --- | --- |
| `GET /practice/clients?view=mine\|organization&organizationId=&q=&timeZone=` | `{ items: [{ linkId, client, dietitian, consentScopes, startedAt, activity: { lastLoggedDate?, daysLoggedLast7?, latestWeightKg? } \| null }] }` — `organization` sadece owner/admin; `activity` sadece atanmis diyetisyene ve paylasilan kapsamlara gore |
| `GET /practice/clients/:clientId?timeZone=` | `{ link, client, dietitian, isAssigned, threadId, plan, activity }` |
| `GET /practice/clients/:clientId/meals?from=&to=&timeZone=` | en fazla 31 gun, yeniden eskiye; `{ items: [{ date, meals: [{ mealType, entries, calories, proteinG, carbsG, fatG, photoUrls }], consumed, goals }] }` |
| `GET /practice/clients/:clientId/body-measurements?metric=&limit=&cursor=` | |
| `GET /practice/clients/:clientId/water?from=&to=` | `{ items: [{ date, amountMl }] }` |
| `PUT /practice/clients/:clientId/plan` | `{ dailyCalories, proteinG, carbsG, fatG }` → danisan artik makro duzenleyemez (`PLAN_MANAGED_BY_DIETITIAN`) |
| `POST /practice/clients/:clientId/end` | |
| `PATCH /practice/clients/:clientId/assignee` | `{ dietitianId }` (owner/admin) |
| `GET/POST /practice/clients/:clientId/notes`, `PATCH/DELETE .../notes/:noteId` | `{ body }` — danisan GORMEZ, sadece yazari duzenler |

Hata kodlari: 404 `CLIENT_NOT_FOUND`, 403 `CONSENT_SCOPE_DISABLED` / `NOT_ASSIGNED_DIETITIAN` / `ORGANIZATION_ADMIN_REQUIRED`.

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
