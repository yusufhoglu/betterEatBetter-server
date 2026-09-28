# Messaging Modulu — Rule

`src/modules/messaging/` insan↔insan sohbet (bugun: diyetisyen↔danisan). Referans:
`dietitian-platform-design.md` §7, `shared-rule.md`, `practice-rule.md`.

---

- **Sahiplik**: thread yasam dongusu (olusturma, kapatma, katilimci degisimi, sistem mesaji)
  thread'in `refId`'sinin sahibi modulundedir; o modul `use-cases/ThreadAdmin.ts`'i cagirir.
  Messaging `practice`'i IMPORT ETMEZ.
- **Yetki**: her istek `requireParticipant` — katilimci degilse 404 `THREAD_NOT_FOUND`.
  Read-only thread'e gonderim/ek yukleme → 403 `THREAD_READ_ONLY`. Gecmis her zaman okunur.
- **Idempotency**: gonderim `(threadId, clientMessageId)` unique. Tekrar → ayni mesaj, HTTP 200,
  fan-out/push YOK. Ayni clientMessageId'yi baska gonderen kullanirsa 409.
- **Sayfalama**: yeniden eskiye, `before=<messageId>` (createdAt+id tie-break). `nextBefore` null → bitti.
- **Okundu**: `lastReadAt` monoton (`GREATEST`), mesajin `createdAt`'ine set edilir.
  Unread sayisi tek grouped SQL ile hesaplanir (N+1 yok).
- **Realtime**: `GET /realtime/stream` (SSE, kullanici basina tek baglanti). Arkada Redis pub/sub
  `rt:user:<id>`; process basina TEK subscriber baglantisi (`RedisRealtimeBus`, singleton —
  `http/messagingWiring.ts`). Olaylar: `message.created`, `thread.read`, `thread.updated`.
  Olaylar replay EDILMEZ: istemci yeniden baglaninca `GET /threads` ile esitlenir.
  Publish hatasi mesaji dusurmez (mesaj zaten kaydedildi).
- **Push**: gonderimden 20sn sonra BullMQ gecikmeli job (`jobId = chat-push:<msg>:<recipient>`),
  alici o ana kadar okumadiysa `notifications.SendPushToUser`. `NOTIFICATIONS_ENABLED=false` → no-op.
- **Ekler**: `POST /threads/:id/attachments` presigned PUT; key `users/<sender>/chat/<thread>/<uuid>.<ext>`
  (hesap silme prefix taramasi kapsar). Gonderimde key'in gonderenin prefix'inde oldugu dogrulanir.
  DB'de key saklanir, URL her okumada imzalanir (15dk).
- **Hesap silme**: `senderId` FK `SET NULL` — karsi tarafin gecmisi kalir, gonderen anonimlesir.
