# Subscription Backend Contract (Google Play Billing)

Date: 2026-08-30

The purchase flow itself is **client-only** (Google Play Billing Library — the
app shows the product, runs the buy sheet, and gets a `purchaseToken`; Play does
not let the backend trigger a purchase). Everything after that is the backend's:
verify the token, own the entitlement, and react to Google's server-side
notifications.

## What the mobile app does

1. `in_app_purchase` (`in_app_purchase_android`) queries the two subscription
   products from Play and shows localized prices.
2. On purchase, the plugin's `purchaseStream` yields a `PurchaseDetails` whose
   `verificationData.serverVerificationData` is the **purchase token**.
3. The app calls `POST /subscription/verify` with that token and waits for the
   entitlement.
4. Only after the backend responds 2xx does the app call Play's
   `completePurchase()` (acknowledge). If verify fails, the app leaves the
   purchase **unacknowledged** — Play retries delivery and the RTDN path can
   still grant access.
5. The app treats `GET /subscription/entitlement` as the single source of
   truth. It re-fetches it after a purchase and could on app resume.

Play Console product ids the app expects (base plans, one each):

| id | cycle |
| --- | --- |
| `premium_monthly` | monthly |
| `premium_yearly` | yearly |

Android package name: `com.bettereatbetter.better_eat_better`.

## Endpoints

Both require `Authorization: Bearer <accessToken>` and return the same
`Entitlement` JSON.

### `POST /subscription/verify`

```json
{ "platform": "android", "productId": "premium_yearly", "purchaseToken": "<token>" }
```

Backend must:

1. Call the **Google Play Developer API**
   `purchases.subscriptionsv2.get` (or `purchases.subscriptions.get`) with a
   service-account credential for the package, passing `purchaseToken`.
2. Confirm the token is valid, matches `productId`, and belongs to a purchase
   Google considers active (`SUBSCRIPTION_STATE_ACTIVE` /
   `_IN_GRACE_PERIOD` / `_CANCELED` but not yet expired).
3. Bind the Play purchase to **this** `userId` (store
   `purchaseToken` + `linkedPurchaseToken` chain, `obfuscatedExternalAccountId`
   if you set one at purchase time — the app currently doesn't, so bind on
   first-seen and reject if the token is already bound to another user).
4. Acknowledge to Google. The backend now does this server-side
   (`purchases.subscriptions.acknowledge`) whenever the Play API reports the
   purchase as active + `ACKNOWLEDGEMENT_STATE_PENDING` — best-effort, it never
   fails the verify response. The client's `completePurchase()` and the RTDN
   reconcile path stay as backups (either side acknowledging within 3 days is
   fine).
5. Upsert the user's entitlement row and return it.

`200 OK` → `Entitlement`. Errors: `400 INVALID_TOKEN`, `409 TOKEN_ALREADY_LINKED`,
`502 PLAY_API_ERROR`.

### `GET /subscription/entitlement`

`200 OK` → the caller's current `Entitlement` (never 404 — return the free
shape for a user who never subscribed).

### `Entitlement` shape

```json
{
  "isPremium": true,
  "productId": "premium_yearly",
  "expiresAt": "2027-08-30T10:00:00.000Z",
  "willRenew": true,
  "inGracePeriod": false
}
```

- `isPremium` — grant access while `now < expiresAt`, even if `willRenew` is
  false (cancelled) or `inGracePeriod` is true.
- Free user: `{ "isPremium": false, "productId": null, "expiresAt": null, "willRenew": false, "inGracePeriod": false }`.

## Real-time Developer Notifications (RTDN)

Configure the app's Pub/Sub topic in the Play Console (Monetization setup →
Real-time developer notifications). Google publishes
`SubscriptionNotification` messages (`SUBSCRIPTION_RENEWED`, `_CANCELED`,
`_EXPIRED`, `_IN_GRACE_PERIOD`, `_ON_HOLD`, `_RECOVERED`, `_REVOKED`,
`_PURCHASED`, …).

Backend needs a push endpoint (e.g. `POST /subscription/play-rtdn`) that:

1. Verifies the Pub/Sub push (OIDC token audience check).
2. Base64-decodes `message.data`, reads `subscriptionNotification.purchaseToken`
   + `notificationType`.
3. Re-fetches the subscription from the Play Developer API (don't trust the
   notification body for state) and updates the bound user's entitlement.
4. Returns `2xx` quickly (ack), does the work async if needed.

This is what keeps `GET /subscription/entitlement` correct without the app
polling — renewals, cancellations, refunds, and payment failures all land here.

## Not handled by the app

- iOS / App Store (Android only for now).
- Upgrade/downgrade between monthly↔yearly (`ChangeSubscriptionParam`) — future.
- Promo codes, offers beyond the base plan.
