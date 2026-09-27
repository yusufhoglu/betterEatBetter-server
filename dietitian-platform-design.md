# Diyetisyen Platformu — Tasarım & Mimari Kararlar

Durum: **Onaylandı (2026-09-27)** — kodlamaya bu dokümana göre başlanır.
Kapsam: bireysel kullanıcıların yanında, bir diyetisyene/kliniğe bağlı danışanların
uygulamayı kullanması; diyetisyenlerin danışanlarını mobil + web üzerinden takip etmesi
ve onlarla mesajlaşması.

---

## 1. Alınan Kararlar

| Konu | Karar |
| --- | --- |
| Ödeme / iş modeli | **Ertelendi.** Şimdilik `subscription` modülüne dokunulmaz. |
| Diyetisyen doğrulaması | Kullanıcı **ayarlardan bir aktivasyon kodu** girer. Kodlar admin tarafından üretilir (script / admin endpoint). |
| AI koç | Aktif diyetisyen bağlantısı olan danışanlar **AI koç (`dietician` modülü) kullanamaz.** Chatbot, fotoğraftan yemek tanıma (VLM) vb. diğer LLM özellikleri açık kalır. |
| Web paneli | **React** (Vite SPA + TanStack Query), ayrı repo/klasör. |
| Klinikler | **Hedefte, ilk günden modellenir** (`Organization`). Bağımsız diyetisyen = tek üyeli organizasyon. |
| Mesaj saklama | Mesajlar **saklanır.** İlişki bitince thread salt-okunur olur, silinmez. |
| Diyetisyen mobil | Mevcut Flutter uygulamasına **rol bazlı "diyetisyen modu"** (`features/practice`). |

## 2. Modül Yapısı

| Modül | Sorumluluk |
| --- | --- |
| `dietician` (mevcut) | AI koç. Değişmez; sadece "managed client" guard'ı eklenir. |
| **`practice`** (yeni) | Organizasyon, üyelik, diyetisyen profili, aktivasyon kodları, danışan bağlantısı/davet, onay kapsamları, `ClientAccessPolicy`, erişim logu, danışan verisi okuma endpoint'leri, dashboard read model. |
| **`messaging`** (yeni) | İnsan↔insan mesajlaşma: thread, katılımcı, mesaj, okundu, realtime, push tetikleme. `practice`'e bağımlı değildir — thread oluşturma `practice` tarafından port üzerinden çağrılır. |

Modüller arası erişim her zaman mevcut desenle: port + adapter, diğer modülün public
use-case'i üzerinden. Wiring `xRoutes.ts` içinde elle (container yok).

## 3. Veri Modeli (Prisma taslağı)

```prisma
model Organization {
  id        String   @id @default(uuid())
  name      String
  kind      String   // 'clinic' | 'solo'
  createdAt DateTime @default(now())
  members   OrganizationMember[]
  @@map("organizations")
}

model OrganizationMember {
  organizationId String
  userId         String
  role           String   // 'owner' | 'admin' | 'dietitian'
  status         String   // 'active' | 'removed'
  joinedAt       DateTime @default(now())
  @@id([organizationId, userId])
  @@index([userId])
  @@map("organization_members")
}

model DietitianProfile {
  userId             String   @id
  title              String?
  licenseNo          String?
  bio                String?
  specialties        String[]
  verifiedAt         DateTime
  activationCodeId   String
  createdAt          DateTime @default(now())
  @@map("dietitian_profiles")
}

// Admin üretir. Kodun düz hali sadece üretimde gösterilir, DB'de hash tutulur.
model DietitianActivationCode {
  id             String    @id @default(uuid())
  codeHash       String    @unique
  organizationId String?   // null → kullanan kişi için 'solo' org oluşturulur
  orgRole        String    @default("dietitian") // 'owner' | 'admin' | 'dietitian'
  maxUses        Int       @default(1)
  usedCount      Int       @default(0)
  expiresAt      DateTime?
  createdAt      DateTime  @default(now())
  revokedAt      DateTime?
  @@map("dietitian_activation_codes")
}

// Diyetisyenin danışana verdiği davet kodu (danışan uygulamada girer).
model ClientInvite {
  id             String    @id @default(uuid())
  code           String    @unique // kısa, insan-okunur
  organizationId String
  dietitianId    String
  expiresAt      DateTime
  usedByUserId   String?
  usedAt         DateTime?
  createdAt      DateTime  @default(now())
  @@map("client_invites")
}

model DietitianClientLink {
  id             String    @id @default(uuid())
  organizationId String
  dietitianId    String    // atanmış (primary) diyetisyen
  clientId       String
  status         String    // 'active' | 'paused' | 'ended'
  consentScopes  String[]  // 'meals' | 'meal_photos' | 'weight' | 'body_measurements' | 'water' | 'daily_tracking'
  consentGivenAt DateTime
  startedAt      DateTime  @default(now())
  endedAt        DateTime?
  endedBy        String?   // userId
  @@index([dietitianId, status])
  @@index([organizationId, status])
  @@index([clientId, status])
  @@map("dietitian_client_links")
}

model DataAccessLog {
  id          String   @id @default(uuid())
  actorId     String
  subjectId   String   // danışan
  scope       String
  resource    String   // örn. 'GET /practice/clients/:id/meals'
  createdAt   DateTime @default(now())
  @@index([subjectId, createdAt])
  @@map("data_access_logs")
}

model DietitianNote {        // danışan GÖRMEZ
  id        String   @id @default(uuid())
  linkId    String
  authorId  String
  body      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([linkId, createdAt])
  @@map("dietitian_notes")
}

// messaging
model Thread {
  id            String    @id @default(uuid())
  kind          String    // 'dietitian_client'
  refId         String?   // DietitianClientLink.id
  readOnly      Boolean   @default(false)
  createdAt     DateTime  @default(now())
  lastMessageAt DateTime?
  @@index([refId])
  @@map("threads")
}

model ThreadParticipant {
  threadId          String
  userId            String
  lastReadMessageId String?
  mutedUntil        DateTime?
  @@id([threadId, userId])
  @@index([userId])
  @@map("thread_participants")
}

model ChatMessage {
  id              String    @id @default(uuid())
  threadId        String
  senderId        String?   // hesap silinirse null (anonimleşir, mesaj kalır)
  clientMessageId String    // idempotency
  type            String    // 'text' | 'image' | 'meal_ref' | 'plan_ref' | 'system'
  body            String?
  attachments     Json?
  createdAt       DateTime  @default(now())
  editedAt        DateTime?
  deletedAt       DateTime?
  @@unique([threadId, senderId, clientMessageId])
  @@index([threadId, createdAt(sort: Desc)])
  @@map("chat_messages")
}
```

`Plan` modeline eklenecek: `source` (`'self' | 'ai' | 'dietitian'`), `setByDietitianId String?`.

## 4. Kimlik & Yetki

- `User` tablosu bölünmez. Diyetisyenlik = `DietitianProfile` + en az bir aktif `OrganizationMember`.
- Access token'a `roles: string[]` claim'i eklenir (`'dietitian'`). `requireRole('dietitian')`
  middleware'i `shared/auth` altına gelir. Rol değişince (kod aktivasyonu) client token'ı refresh eder.
- **Aktivasyon akışı:** `POST /practice/dietitian/activate { code }` → kod hash'i bulunur,
  geçerlilik/limit kontrol edilir (transaction içinde `usedCount++`), `DietitianProfile`
  oluşturulur, org üyeliği eklenir (org yoksa `solo` org). Rate limit: `activate:${userId}`.
- Admin kod üretimi: `src/scripts/createActivationCode.ts` (mevcut `grantPremium` script'i gibi).

## 5. Erişim Politikası (KVKK — özel nitelikli sağlık verisi)

- Diyetisyen danışan verisini **sadece `practice` endpoint'leri üzerinden** okur.
- Her okuma: `ClientAccessPolicy.assertCanRead(actorId, clientId, scope)`:
  1. `status='active'` bir `DietitianClientLink` var mı,
  2. actor bu link'in `dietitianId`'si mi **veya** aynı org'da `owner/admin` mı,
  3. `scope ∈ consentScopes` mi.
  Değilse `NotFoundError` (varlığı sızdırma).
- Her başarılı okuma `DataAccessLog`'a yazılır (async, isteği bloklamaz).
- Danışan: `GET /practice/me/access-log` ile kimin neye baktığını görebilir;
  `PATCH /practice/me/link/consent` ile kapsamı daraltabilir; `POST /practice/me/link/end` ile bitirebilir.

## 6. AI Koç Guard'ı

- `dietician` modülüne `ManagedClientPort.isManagedClient(userId)` eklenir; adapter `practice`'in public use-case'ini çağırır (Redis cache, kısa TTL).
- Aktif link varsa tüm `/dietician/*` endpoint'leri `403` + code `AI_COACH_UNAVAILABLE_MANAGED_CLIENT`.
- `DieticianNudgeJob` bu kullanıcıları atlar.
- Chatbot / food-recognition / diğer LLM özellikleri etkilenmez. (Opsiyonel sonraki adım: chatbot system prompt'una "planı diyetisyen belirledi" bağlamı.)

## 7. Mesajlaşma

- Gönderme: `POST /threads/:id/messages` (REST, `clientMessageId` ile idempotent).
- Listeleme: `GET /threads` (lastMessageAt desc, unread sayısı), `GET /threads/:id/messages?before=<cursor>&limit=`.
- Okundu: `POST /threads/:id/read { messageId }`.
- Realtime: kullanıcı başına tek bağlantı (`GET /realtime/stream` SSE — mevcut SSE altyapısıyla
  uyumlu; ileride WS'e geçilebilir). Arkada **Redis pub/sub** kanal `user:${userId}` — çok instance'ta doğru bağlantıya ulaşmak için.
- Çevrimdışı alıcı: BullMQ job → `notifications.SendPushToUser`.
- Ek: mevcut R2 presigned upload. `meal_ref` mesajı `nutrition-logging`'deki bir öğüne referans verir; render ederken erişim politikası yine uygulanır.
- Link `ended` olunca thread `readOnly=true`; mesajlar saklanır.
- Hesap silme: `senderId` null'lanır, katılımcı kaydı silinir; diğer tarafın geçmişi korunur.

## 8. Diyetisyen Endpoint'leri (özet)

```
POST   /practice/dietitian/activate
GET    /practice/me/organizations
POST   /practice/invites                       → davet kodu üret
GET    /practice/clients?status=&q=            → dashboard listesi (read model)
GET    /practice/clients/:clientId             → özet + link bilgisi
GET    /practice/clients/:clientId/meals?from=&to=
GET    /practice/clients/:clientId/body-measurements?from=&to=
GET    /practice/clients/:clientId/water?from=&to=
PUT    /practice/clients/:clientId/plan        → hedefleri diyetisyen belirler
GET/POST/PATCH /practice/clients/:clientId/notes
PATCH  /practice/clients/:clientId/assignee    → org admin: danışanı başka diyetisyene ata
# danışan tarafı
POST   /practice/join { code, consentScopes }
GET    /practice/me/link
PATCH  /practice/me/link/consent
POST   /practice/me/link/end
GET    /practice/me/access-log
```

## 9. Dashboard Read Model

`ClientDailySummary (clientId, date, kcal, protein, carbs, fat, mealsLogged, waterMl, weightKg?)`
— mevcut `OutboxEvent` akışından beslenen projeksiyon. Dashboard "son log", "7 günlük uyum",
"kilo trendi" alanlarını buradan hesaplar; diğer modüllere canlı sorgu atmaz.

## 10. İstemciler

- **Mobil (Flutter):** `features/practice` (diyetisyen modu: danışan listesi, detay, mesajlar)
  + `features/messaging` (her iki rol). Danışan tarafında: ayarlarda "Diyetisyen kodu gir",
  "Diyetisyen olarak aktive et"; aktif link varsa AI koç girişi gizlenir, mesaj girişi görünür.
- **Web (React):** Vite + TypeScript + TanStack Query + React Router. API tipleri backend'in zod
  şemalarından türetilir. Auth: refresh token httpOnly cookie (web için ayrı akış), CORS + CSRF.

## 11. Aşamalar

1. **Temel (backend):** şema + migration, aktivasyon kodu & script, org/üyelik, davet/join,
   consent, `ClientAccessPolicy`, `DataAccessLog`, roles claim, AI koç guard'ı. Testler.
2. **Mesajlaşma (backend):** thread/mesaj/okundu, SSE + Redis pub/sub, push job.
3. **Takip (backend):** danışan veri endpoint'leri, `ClientDailySummary` projeksiyonu, plan override, notlar.
4. **Mobil:** join/activate akışları, mesajlaşma, diyetisyen modu.
5. **Web paneli (React).**
6. Sonra: ödeme, randevu, program şablonları, AI asistan (diyetisyene yardımcı).

## 12. Açık Sorular

- Web paneli ayrı GitHub reposu mu, yoksa monorepo mu?
- Klinik admin'i danışan verisini görebilmeli mi, yoksa sadece listeyi/atamayı mı? (Taslak: görebilir, loglanır.)
- Davet kodu geçerlilik süresi (taslak: 7 gün, tek kullanımlık).
